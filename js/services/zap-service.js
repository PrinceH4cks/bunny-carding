/* =========================================================
   ZAPUPI, AND THE PART THAT SURVIVES THE BROWSER

   ZapUPI's kit only knows about an order while its overlay is on screen. A
   customer who taps through to their UPI app, pays there, and comes back to a
   page that reloaded has left the store with a paid order it cannot trace, and
   a wallet that never gets credited.

   So the order id is written onto the deposit document, and any later visit
   checks the open deposits against the gateway. That is what makes the money
   turn up whether the customer comes back in ten seconds or ten days, from this
   device or another one. Nothing here waits in the background: the credit
   happens the next time the customer opens the site, which for a wallet only
   ever has to happen once.
   ========================================================= */

import { getUserDeposits, markDepositPaid } from "./user-service.js";
import { getPaymentSettings } from "./payment-service.js";

/* the kit itself */
const ZAP_SDK = "https://zapupi.com/single-html-web-kit.js";
let sdk = null;

/** Loads the kit once, on demand, and only when a payment or a check needs it. */
export function loadZapSdk() {
  if (sdk) return sdk;
  if (typeof window === "undefined") return Promise.reject(new Error("No browser."));
  if (window.ZapUPI) { sdk = Promise.resolve(window.ZapUPI); return sdk; }
  sdk = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = ZAP_SDK;
    s.async = true;
    s.onload = () => window.ZapUPI ? res(window.ZapUPI) : rej(new Error("ZapUPI did not load."));
    s.onerror = () => rej(new Error("Could not reach ZapUPI. Check your connection and try again."));
    document.head.appendChild(s);
  }).catch((e) => { sdk = null; throw e; });
  return sdk;
}

/* ZapUPI reports status as a loose set of words, so they are all treated as
   "paid" rather than trusting one spelling. */
const ZAP_PAID = new Set(["success", "completed", "complete", "1", "captured", "paid", "done"]);
const ZAP_DEAD = new Set(["failed", "cancelled", "canceled", "0", "expired", "timeout", "failed_", "declined"]);

/**
 * Asks the gateway what became of one order.
 *
 * Returns one of three answers, and the caller does not have to guess which:
 * paid, failed, or still open.
 */
export async function zapStatus(Z, m, orderId) {
  const data = await new Promise((res, rej) => {
    Z.orderStatus({ zap_key: String(m.zapKey || "").trim(), order_id: orderId }, {
      onResponse: (oid, d) => res(d),
      onError: (err) => rej(new Error(String(err || "Status check failed")))
    });
  });

  /* ZapUPI nests its answer under data in some versions and returns it flat in
     others, so both are read. The status and the reference are looked for in
     the same two places: reading the status from one and the reference from the
     other is how a paid deposit ends up filed against its own order id with
     the bank's reference thrown away. */
  const row = (data && data.data) || {};
  const flat = data || {};
  const st = String(row.status ?? flat.status ?? "").trim().toLowerCase();
  const ref = String(
    row.txn_ref || row.txnRef || row.reference || row.utr || row.id ||
    flat.txn_ref || flat.txnRef || flat.reference || flat.utr || ""
  ).trim();

  if (ZAP_PAID.has(st)) return { ok: true, ref: ref || orderId };
  if (ZAP_DEAD.has(st)) return { failed: true, reason: "The payment did not go through (" + st + ")." };
  return { pending: true };
}

/* ---------- the same-device shortcut ----------
   A local copy of the order being paid right now, so the wallet page can pick it
   up without waiting for the network. The document is the real record; this only
   saves a round trip on the device that started it. */
const KEY = "bunnystore_zap_pending";
/* long enough to cover a customer who pays and forgets, short enough that a
   row which was never paid does not sit in storage for ever */
const LOCAL_MAX_AGE = 14 * 24 * 60 * 60 * 1000;

export function rememberGatewayOrder(o) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...o, at: Date.now() })); } catch { /* private mode */ }
}
export function forgetGatewayOrder() {
  try { localStorage.removeItem(KEY); } catch { /* nothing to clean up */ }
}
export function readGatewayOrder() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || !o.orderId || !o.depId) { forgetGatewayOrder(); return null; }
    if (Date.now() - Number(o.at || 0) > LOCAL_MAX_AGE) { forgetGatewayOrder(); return null; }
    return o;
  } catch { forgetGatewayOrder(); return null; }
}

/* ---------- the sweep that credits later ----------
   An order the gateway will never take any more money for. Three days is well
   past any UPI payment window, and past it an unpaid order is not going to
   start paying itself, so it is left for the admin to close by hand. */
const SWEEP_MAX_AGE = 3 * 24 * 60 * 60 * 1000;
const OPEN = (d) => d && d.status !== "approved" && d.status !== "rejected";

let sweeping = null;

/**
 * Checks the signed-in customer's open ZapUPI deposits and credits any that the
 * gateway says were paid.
 *
 * This is the whole answer to "I paid and the browser reloaded": the order id
 * was kept on the document, so the next visit can still find out. It is silent
 * about its own failures, because a payment page that throws because a
 * background check could not run would be worse than one that waits for the
 * next visit.
 *
 * Returns the deposits it credited, so a caller can tell the customer.
 */
export function reconcileZap(user, opts = {}) {
  if (!user || !user.uid) return Promise.resolve([]);
  /* one sweep at a time: the wallet page is checking the same order at the same
     moment, and two checks of one order is one wasted call */
  if (sweeping) return sweeping;

  const at = Date.now();
  sweeping = (async () => {
    const credited = [];
    try {
      const s = await getPaymentSettings();
      const m = s && s.methods && s.methods.zap;
      /* the merchant key lives in the admin's settings, so without it there is
         nothing to ask the gateway */
      if (!m || !m.on || !m.zapKey) return credited;

      const deps = await getUserDeposits(user.uid, 50);
      const open = (deps || []).filter((d) =>
        OPEN(d) && d.gatewayOrderId &&
        at - stamp(d.createdAt) < SWEEP_MAX_AGE);
      if (!open.length) return credited;

      const Z = await loadZapSdk();
      for (const d of open) {
        try {
          const st = await zapStatus(Z, m, d.gatewayOrderId);
          if (!st.ok) continue;
          /* the transaction is idempotent, so an order that is also being
             polled from the open dialog still only credits once */
          const r = await markDepositPaid(d.id, st.ref || d.gatewayOrderId);
          if (r && r.ok && !r.already) {
            credited.push({ ...d, ref: st.ref || d.gatewayOrderId });
            if (typeof opts.onCredited === "function") opts.onCredited(d);
          }
        } catch {
          /* one unreachable order must not stop the rest being checked */
        }
      }
      if (credited.length) forgetGatewayOrder();
    } catch {
      /* offline, signed out, or the gateway is down: the next visit tries again */
    } finally {
      sweeping = null;
    }
    return credited;
  })();
  return sweeping;
}

/* A server timestamp comes back as an object with a toMillis method, and an
   older document may hold a number instead, so both are read the same way. */
function stamp(v) {
  if (!v) return 0;
  if (typeof v === "number") return v;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (v.seconds) return Number(v.seconds) * 1000;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : 0;
}
