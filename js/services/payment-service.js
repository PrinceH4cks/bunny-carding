import { brandName } from "../core/brand.js";
import { el, field } from "../core/app.js";
import { db, storage, COL } from "../core/firebase-config.js";

import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc,
  query, where, orderBy, limit, serverTimestamp, increment, runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref as sref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

/* =========================================================
   PAYMENT SETTINGS (configured from the admin panel)
   ========================================================= */

/* Three deposit methods, each switched on and off on its own, so the store can
   take money the way it happens to be convenient that day. The old single
   `gateway` field only ever described one of them. */
export const DEFAULT_METHODS = {
  /* ZapUPI: the order is created against the gateway's API, the payment screen
     opens by itself, and the wallet is credited the moment it reports success.
     There is no webhook to wait for, so nothing here is optional except the
     customer's mobile number. */
  zap: {
    on: false,
    label: "ZapUPI AutoPay",
    /* from the ZapUPI dashboard, and the only thing an admin has to fill in */
    zapKey: "",
    /* how often the browser asks the gateway whether the payment landed, and how
       long it keeps asking. Not admin settings: ZapUPI settles a payment in
       seconds, so these are just the patience of the checking loop. */
    pollSeconds: 4,
    maxTries: 15
  },
  /* manual: show a UPI QR, the customer pays and types the UTR, an admin approves */
  upi: {
    on: true,
    label: "Manual UPI",
    vpa: "",
    payeeName: "",
    expiryMinutes: 10,
    requireUtr: true,
    notes: "Pay the exact amount shown, then enter the UTR from your UPI app."
  },
  /* crypto: show a deposit address, the customer sends, an admin confirms it */
  crypto: {
    on: false,
    label: "Crypto",
    currency: "USDT",
    network: "TRC20",
    address: "",
    minAmount: 10,
    /* confirmations before the balance is credited */
    confirmations: 12,
    notes: "Send only on the network shown. The wallet is credited once the network confirms the transfer."
  }
};

/* Kept so older saved documents, and the old admin form, keep working. The
   manual UPI values are mirrored out of the methods map on read. */
export const DEFAULT_PAYMENT = {
  gateway: "manual_upi",
  upiId: "",
  payeeName: "",
  qrMinutes: 10,
  requireUtr: true,
  notes: DEFAULT_METHODS.upi.notes
};

const methodDefaults = (k) => ({ ...DEFAULT_METHODS[k] });

export async function getPaymentSettings() {
  try {
    const s = await getDoc(doc(db, COL.settings, "payment"));
    const d = s.exists() ? s.data() : {};
    const saved = d.methods || {};
    const methods = {
      zap: { ...methodDefaults("zap"), ...(saved.zap || {}) },
      upi: { ...methodDefaults("upi"), ...(saved.upi || {}) },
      crypto: { ...methodDefaults("crypto"), ...(saved.crypto || {}) }
    };
    /* Always ask for the UTR. The panel used to offer a switch to skip it, which
       meant a manual deposit could be credited on the amount alone, with nothing
       tying it to a payment that actually happened. An admin still has to approve
       every request; this only removes the option of approving it blind. */
    methods.upi.requireUtr = true;
    /* an install saved before methods existed still has its manual UPI settings
       at the top level, so lift them into the method rather than losing them */
    if (!saved.upi && d.upiId) {
      methods.upi.vpa = d.upiId;
      methods.upi.payeeName = d.payeeName || methods.upi.payeeName;
      if (d.qrMinutes) methods.upi.expiryMinutes = Number(d.qrMinutes) || 10;
      if (d.notes) methods.upi.notes = d.notes;
    }
    /* likewise, an earlier ZapUPI install kept the key as gatewayKey */
    if (!saved.zap && d.gatewayKey) methods.zap.zapKey = d.gatewayKey;
    return { ...DEFAULT_PAYMENT, ...d, methods };
  } catch {
    return { ...DEFAULT_PAYMENT, methods: {
      zap: methodDefaults("zap"), upi: methodDefaults("upi"), crypto: methodDefaults("crypto")
    } };
  }
}

export async function savePaymentSettings(data) {
  const patch = { ...data, updatedAt: serverTimestamp() };
  await setDoc(doc(db, COL.settings, "payment"), patch, { merge: true });
}

/** The methods a customer is actually offered, in display order. */
export function enabledMethods(cfg) {
  const m = (cfg && cfg.methods) || {};
  return ["zap", "upi", "crypto"]
    .filter((k) => m[k] && m[k].on)
    .map((k) => ({ key: k, ...m[k] }));
}


/* =========================================================
   /payment.js
   QR payment sheet: UPI deep link, QR render, countdown, UTR submit
   Works with a manual UPI setup out of the box, and is ready for
   a gateway API to be plugged in from the admin panel.
   ========================================================= */

import { $, $$, esc, inr } from "../core/app.js";
import { toast } from "../components/toast.js";
import { icon } from "../components/icons.js";

/* ---------- UPI deep link (works with every UPI app) ---------- */
export function upiLink({ upiId, payee = "", amount = 0, note = "", ref = "" }) {
  if (!upiId) return "";
  const p = new URLSearchParams({
    pa: upiId,
    pn: payee || brandName(),
    am: Number(amount || 0).toFixed(2),
    cu: "INR",
    tn: (note || "Order payment").slice(0, 48)
  });
  if (ref) p.set("tr", String(ref).slice(0, 40));
  return "upi://pay?" + p.toString();
}

/* ---------- app buttons ---------- */
const APPS = [
  { key: "pe",    name: "PhonePe",  mark: "Pe",  scheme: "phonepe://" },
  { key: "gpay",  name: "GPay",     mark: "G",   scheme: "tez://" },
  { key: "paytm", name: "Paytm",    mark: "PTM", scheme: "paytmmp://" },
  { key: "fampay",name: "FamPay",   mark: "F",   scheme: "fampay://" }
];

export function appButtons() {
  return '<div class="upi-apps">' + APPS.map((a) =>
    '<button class="upi-app" data-upi-app="' + a.scheme + '">' +
      '<span class="upi-logo upi-' + a.key + '">' + a.mark + "</span>" +
      "<span>" + a.name + "</span></button>").join("") + "</div>";
}

/* ---------- QR renderer (CDN lib, graceful fallback) ---------- */
const QR_SRC = "https://cdn.jsdelivr.net/npm/qrcode@1.5.4/build/qrcode.min.js";
let qrLoading = null;

function loadQR() {
  if (window.QRCode) return Promise.resolve(true);
  if (qrLoading) return qrLoading;
  qrLoading = new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = QR_SRC;
    s.onload = () => resolve(!!window.QRCode);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
  return qrLoading;
}

/* Draws the code a customer scans.

   If the shop has supplied a picture of its own — the admin can paste a link to
   a QR image on any method, which is how a merchant account or a printed card
   gets into the customer's hands — that picture is used and nothing is drawn
   here. Drawing it from the text means loading a library from a CDN first, which
   is slower and stops working when the CDN is blocked, and it cannot draw a
   code the shop was given rather than made. If the picture turns out not to
   load, the code is still drawn underneath it, so a wrong link never leaves the
   customer with an empty box. */
export async function renderQR(el, text, imageUrl) {
  if (!el) return false;
  el.innerHTML = "";

  const drawn = async () => {
    if (!text) { el.innerHTML = '<div class="qr-fallback">No payment address configured</div>'; return false; }
    const ok = await loadQR();
    if (ok) {
      try {
        const canvas = document.createElement("canvas");
        el.appendChild(canvas);
        await window.QRCode.toCanvas(canvas, text, {
          width: 212, margin: 1,
          color: { dark: "#0c1222", light: "#ffffff" }
        });
        return true;
      } catch { /* fall through */ }
    }
    /* offline / CDN blocked — show the raw link instead of a blank box */
    el.innerHTML = '<div class="qr-fallback">' + esc(text) + "</div>";
    return false;
  };

  const src = String(imageUrl || "").trim();
  if (src) {
    el.innerHTML = '<img src="' + esc(src) + '" alt="Payment QR code" referrerpolicy="no-referrer">';
    const img = el.querySelector("img");
    /* an image that is already in the browser cache may have finished loading
       before this line, so complete state is checked as well as the event */
    if (img) {
      if (img.complete && img.naturalWidth > 0) return true;
      await new Promise((res) => {
        img.addEventListener("load", () => res(), { once: true });
        img.addEventListener("error", () => res(), { once: true });
      });
      if (img.naturalWidth > 0) return true;
    }
    /* the link was wrong, or the file is gone: carry on and draw the code */
  }

  return drawn();
}

/* ---------- countdown ---------- */
export function startCountdown(el, minutes, onEnd) {
  let left = Math.max(60, Math.round(minutes * 60));
  clearInterval(el._t);

  const paint = () => {
    const m = String(Math.floor(left / 60)).padStart(2, "0");
    const s = String(left % 60).padStart(2, "0");
    el.textContent = m + ":" + s;
    el.classList.toggle("urgent", left <= 60);
  };
  paint();

  el._t = setInterval(() => {
    left--;
    paint();
    if (left <= 0) {
      clearInterval(el._t);
      toast("This payment window has expired. Please start a new payment.", "warn");
      onEnd?.();
    }
  }, 1000);

  return () => clearInterval(el._t);
}

/* ---------- the whole payment sheet ---------- */
/**
 * Renders QR + timer + app buttons + UTR form into a container.
 *
 * Crypto reuses this: it has no UPI apps to offer and no 12-digit reference, so
 * `apps: false` drops the app row and `refLabel` / `refPlaceholder` / `refTest`
 * say what the field is instead. Everything else is identical, which is the
 * point — the QR, the countdown and the submit are the same job in both cases,
 * and a customer moving between them should not find the screen has changed
 * rules under them.
 * @returns {{ stop:Function, link:string }}
 */
export async function paymentSheet(mount, opts) {
  const {
    upiId = "", payee = "", amount = 0,
    note = "", ref = "", minutes = 10,
    qrImage = "", apps = true,
    refLabel = "I have paid — enter the UTR / reference number",
    refPlaceholder = "12-digit UTR",
    refHint = "You will get the card details as soon as the payment is verified.",
    refTest = /^\d{12}$/,
    refTooShort = "Please enter the full UTR from your payment app.",
    refWrong = "A UTR is 12 digits. Check it in your UPI app and try again.",
    submitText = "I have paid — submit",
    onSubmit = null, expiredText = "This payment window has expired."
  } = opts || {};

  const link = upiLink({ upiId, payee, amount, note, ref });

  mount.innerHTML = `
  <div class="qr-sheet">
    <div class="flex between center wrap gap-2 mb-2">
      <span class="label mb-0">${esc(apps ? "Scan the QR or use an app below" : "Scan the QR or send to the address below")}</span>
      <span class="upi-amount-pill">${icon("banknote", "ic ic-sm")} ${esc(inr(amount))}</span>
    </div>

    <div class="qr-frame" id="qrBox"></div>

    <div class="mt-2 mb-2">
      <div class="timer-box">
        <span class="timer-label">Expires in</span>
        <span class="timer-value" id="qrTimer">--:--</span>
      </div>
    </div>

    <div class="upi-id mb-2">
      <span>${esc(apps ? "UPI: " : "Address: ")}<b id="upiText">${esc(upiId || "not configured")}</b></span>
      <button class="btn btn-xs btn-ghost" data-copy="${esc(upiId)}" ${upiId ? "" : "disabled"}>${icon("copy", "ic ic-sm")} Copy</button>
    </div>

    ${apps ? appButtons() : ""}

    <form class="mt-3" id="utrForm" novalidate>
      <div class="field" style="text-align:left;margin-bottom:12px">
        <label>${esc(refLabel)}</label>
        <input class="input" name="utr" placeholder="${esc(refPlaceholder)}" inputmode="numeric" maxlength="128" required>
        <div class="field-hint">${esc(refHint)}</div>
        <div class="field-error"></div>
      </div>
      <button class="btn btn-ok btn-block" type="submit" id="utrBtn">
        ${icon("check")} ${esc(submitText)}
      </button>
    </form>

    <p class="fs-xs text-muted mt-2 mb-0" id="payNote">
      ${esc(opts.notes || "Pay the exact amount shown. This page refreshes automatically.")}
    </p>
  </div>`;

  renderQR($("#qrBox", mount), link, opts.qrImage);

  const stop = startCountdown($("#qrTimer", mount), minutes, () => {
    mount.innerHTML = '<div class="empty"><div class="empty-ic">' + icon("hourglass") +
      "</div><h3>Payment window expired</h3><p>" + esc(expiredText) + "</p></div>";
  });

  /* app deep links */
  mount.addEventListener("click", (e) => {
    const app = e.target.closest("[data-upi-app]");
    if (app) {
      if (!link) { toast("No UPI id configured yet.", "warn"); return; }
      location.href = app.dataset.upiApp + link.replace("upi://pay?", "pay?");
      return;
    }
    const cp = e.target.closest("[data-copy]");
    if (cp) {
      navigator.clipboard?.writeText(cp.dataset.copy);
      /* the row is the customer's own copy of the address, whatever the method
         is called — saying "UPI id" on a crypto screen would be wrong */
      toast(opts.copyToast || "UPI id copied.", "ok");
    }
  });

  /* reference submit */
  const form = $("#utrForm", mount);
  form?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const input = form.utr;
    const val = input.value.trim();
    /* A UPI reference is 12 digits. Anything shorter is a half-typed or a
       copied-in amount, and an admin would only end up chasing it. A crypto
       transaction hash is a long hex string, so it brings its own test. */
    if (!refTest.test(val)) {
      input.classList.add("invalid");
      toast(val.length < 12 ? refTooShort : refWrong, "err");
      return;
    }
    const btn = $("#utrBtn", mount);
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Submitting&hellip;';
    try {
      await onSubmit?.(val);
    } finally {
      btn.disabled = false;
      btn.innerHTML = icon("check") + " " + esc(submitText);
    }
  });

  return { stop, link };
}


/* =========================================================
   /deposits.js
   The three ways a customer can put money in their wallet.

   Each method is described once, here, and both panels read from it: the admin
   payment settings builds its three cards from METHOD_FIELDS, and the wallet's
   "Add money" popup builds its three tabs from METHODS. Nothing about a method
   is written twice, so adding a fourth one means adding it to one list.

   zap    automated UPI through a gateway; the wallet is credited when the
          gateway reports the payment succeeded
   upi    manual UPI; the customer scans a QR, types the UTR, an admin approves
   crypto send to a fixed address; an admin confirms it once the network has
          enough confirmations
   ========================================================= */

/* ---------- how each method is configured, and shown ---------- */
export const METHODS = [
  {
    key: "zap",
    title: "ZapUPI AutoPay",
    icon: "zap",
    /* the minimum a customer can send through this method */
    min: 1,
    /* ZapUPI brings its own payment page, so the only thing an admin has to
       supply is the key. How often the wallet checks for the money, and how
       patient it is, are fixed in wallet.js rather than being settings nobody
       should have to think about. */
    fields: [
      { name: "zapKey", label: "ZapUPI key", type: "secret", required: true }
    ],
    required: ["zapKey"]
  },
  {
    key: "upi",
    title: "Manual UPI",
    icon: "wallet",
    min: 100,
    fields: [
      { name: "vpa", label: "UPI ID", type: "text", mono: true, required: true },
      { name: "payeeName", label: "Payee name", type: "text" },
      { name: "expiryMinutes", label: "QR valid for (minutes)", type: "number", min: 1, max: 120 },
      { name: "notes", label: "Note for customers", type: "area" }
    ],
    required: ["vpa"]
  },
  {
    key: "crypto",
    title: "Crypto",
    icon: "coins",
    min: 10,
    fields: [
      { name: "currency", label: "Currency", type: "text", required: true },
      { name: "network",  label: "Network",  type: "text", required: true },
      { name: "address",  label: "Deposit address", type: "text", mono: true, required: true },
      { name: "minAmount", label: "Minimum deposit", type: "number", min: 0 },
      { name: "confirmations", label: "Confirmations needed", type: "number", min: 0, max: 200 },
      { name: "notes", label: "Note for customers", type: "area" }
    ],
    required: ["currency", "network", "address"]
  }
];

export const methodByKey = (key) => METHODS.find((m) => m.key === key);

/* ---------- small helpers ---------- */

export const validUpi = (v) => /^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(String(v || "").trim());

/* an address is only checked for length and characters, never for which chain
   it belongs to: that is what the network field and the admin's own eyes are for */
const validAddress = (v) => {
  const s = String(v || "").trim();
  return s.length >= 16 && s.length <= 120 && /^[A-Za-z0-9:_\-.]+$/.test(s);
};

export const validUrl = (v) => {
  try { const u = new URL(String(v || "").trim()); return u.protocol === "https:"; }
  catch { return false; }
};

/** Field-level check, so the admin sees the message on the exact input. */
export function validateMethod(key, cfg) {
  const m = methodByKey(key);
  const out = {};
  if (!m) return out;

  for (const f of m.fields) {
    const v = cfg[f.name];
    if (f.required && !String(v ?? "").trim()) { out[f.name] = "This is required."; continue; }

    switch (f.name) {
      case "vpa":
        if (v && !validUpi(v)) out[f.name] = "Enter a valid UPI id, for example yourname@bank";
        break;
      case "address":
        if (v && !validAddress(v)) out[f.name] = "That does not look like a wallet address";
        break;
      case "zapKey":
        /* ZapUPI keys are opaque strings; the only thing to rule out is a key
           that got truncated while being pasted */
        if (v && String(v).trim().length < 16)
          out[f.name] = "That key looks too short. Copy the whole key from the ZapUPI dashboard.";
        break;
      case "expiryMinutes":
      case "confirmations":
      case "pollSeconds":
      case "maxTries":
        if (v !== "" && v != null && (!Number.isFinite(Number(v)) || Number(v) < Number(f.min || 0)))
          out[f.name] = "Enter a number of at least " + (f.min || 0);
        break;
      case "minAmount":
        if (v !== "" && v != null && (!Number.isFinite(Number(v)) || Number(v) < 0))
          out[f.name] = "Cannot be negative";
        break;
      default: break;
    }
  }

  /* the required-field pass above stops at the first problem on that field, so
     run it again to collect every message for a turn-on attempt */
  if (cfg.on) {
    for (const name of m.required) {
      if (out[name]) continue;
      if (!String(cfg[name] ?? "").trim()) out[name] = "Fill this in before turning the method on.";
    }
  }
  return out;
}

/** Is a method switched on *and* complete enough to be offered? */
export function isUsable(key, cfg) {
  const m = methodByKey(key);
  const c = cfg && cfg[key];
  if (!m || !c || !c.on) return false;
  return Object.keys(validateMethod(key, c)).length === 0;
}
