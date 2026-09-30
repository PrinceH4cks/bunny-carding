import { app, auth } from "./firebase-config.js";
import { db } from "./db.js";
import { pageUrl } from "./app.js";

/* =========================================================
   /header.js
   Shared shell: auth state in the header, cart badge, logout
   Loaded on every public page
   ========================================================= */

import { $, $$, inr } from "./app.js";
import { toast } from "../components/toast.js";
import { icon } from "../components/icons.js";
import { paintCount } from "../services/cart-service.js";
import { watchAuth, logout, errText } from "./auth.js";
import { SITE_ADMIN_URL } from "./firebase-config.js";
import { getWallet } from "../services/wallet-service.js";
import { reconcileZap } from "../services/zap-service.js";

watchAuth(async (u) => {
  paintCount();
  await paintWallet(u);
  /* Anything the customer paid for in an earlier session is settled here, on
     whichever page they happen to open. The order id was kept on the deposit, so
     this works after a refresh, after the browser was closed, and from another
     device: it is a check against the gateway, not a continuation of a page.
     It never blocks the page and never throws at the customer. */
  if (u) {
    try {
      const paid = await reconcileZap(u);
      for (const d of paid) {
        toast(inr(d.amount) + " added to your wallet.", "ok", "Payment received");
        document.dispatchEvent(new CustomEvent("wallet:credit", { detail: { amount: d.amount } }));
      }
    } catch { /* the next visit tries again */ }
  }
});

/* The wallet link belongs in the navigation for everyone: a visitor who is not
   signed in can still reach it and be asked to sign in, and hiding it left the
   desktop header without a way to the wallet at all. Only the balance waits,
   because a figure before signing in would be a lie. */
export async function paintWallet(u) {
  ensureChip();
  const chip = $("#navWallet");
  const amt = $("#navWalletAmt");
  if (!u) {
    if (amt) { amt.textContent = ""; amt.hidden = true; }
    setAppWallet(null);
    return;
  }
  try {
    const w = await getWallet(u.uid);
    if (chip) {
      if (amt) { amt.textContent = inr(w.balance); amt.hidden = false; }
    }
    /* the phone app bar carries its own wallet button, so it needs the figure
       too or the balance is invisible on a phone */
    setAppWallet(w.balance);
  } catch { /* ignore */ }
}

/* The compact app bar is built by appbar.js, so the amount element may not
   exist yet on the very first paint. It is created lazily if needed. */
export function setAppWallet(balance) {
  let amt = $("[data-app-wallet]");
  if (!amt) {
    const btn = $(".app-bar-wallet");
    if (!btn) return;
    amt = document.createElement("span");
    amt.className = "app-bar-amt";
    amt.setAttribute("data-app-wallet", "");
    btn.appendChild(amt);
  }
  if (balance === null || balance === undefined) { amt.hidden = true; return; }
  amt.textContent = inr(balance);
  amt.hidden = false;
}

/* The wallet page announces a new balance. Listening for the event avoids an
   import from wallet.js back into this file, which already imports it. */
document.addEventListener("wallet:change", (e) => setAppWallet(e.detail?.balance));

/* A page that was written without the chip gets one here, next to the cart.
   It is added without the hidden attribute, because the link is navigation and
   is offered to every visitor; only the balance inside it waits. */
function ensureChip() {
  if ($("#navWallet")) return;
  const anchor = $(".nav-actions .cart-btn");
  if (!anchor) return;
  const a = document.createElement("a");
  a.href = pageUrl("pages/wallet.html");
  a.className = "nav-wallet";
  a.id = "navWallet";
  a.innerHTML = icon("wallet", "ic ic-sm") + '<span id="navWalletAmt" hidden></span>';
  anchor.after(a);
}

document.addEventListener("click", (e) => {
  const b = e.target.closest("#logoutBtn, [data-logout]");
  if (!b) return;
  e.preventDefault();
  logout().catch((err) => toast(errText(err), "err"));
});

/* The admin panel lives in a separate project, so link out to it. */
document.addEventListener("click", (e) => {
  const a = e.target.closest("[data-admin-link]");
  if (!a || SITE_ADMIN_URL) return;
  e.preventDefault();
  toast("Admin URL is not set yet - add SITE_ADMIN_URL in js/firebase-config.js.", "warn");
});

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-admin-link]").forEach((a) => {
    if (!SITE_ADMIN_URL) { a.title = "Set SITE_ADMIN_URL in js/firebase-config.js"; return; }
    a.href = SITE_ADMIN_URL;
    a.target = "_blank";
    a.rel = "noopener";
  });
});

/* newsletter (footer, present on every page) */
document.addEventListener("submit", (e) => {
  const f = e.target;
  if (f.id !== "newsletterForm") return;
  e.preventDefault();
  toast("Thanks! You are now on the newsletter list.", "ok");
  f.querySelector("input").value = "";
});

/* The header is written into the page, but a script can run before it has been
   parsed, so the chip is offered again once the document is ready and whenever
   the wallet is painted. Both attempts are cheap because the first one to
   succeed means there is nothing left to do. */
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", ensureChip, { once: true });
} else {
  ensureChip();
}
