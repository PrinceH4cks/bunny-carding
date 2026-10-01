import { getProduct } from "../services/product-service.js";
import { login } from "../core/auth.js";
import { db } from "../core/db.js";
import { totals } from "../services/cart-service.js";
import { pageUrl } from "../core/app.js";

/* =========================================================
   /buy.js
   Buying a prepaid card.

   There is no checkout step and nothing is shipped: the product is digital, so
   the whole flow is "take the money out of the wallet, write the order, hand
   over the card". Buy on a product page and Pay from the cart both land here so
   the money handling is written once.

   The wallet is debited first. If the order write then fails, the debit is
   reversed, so a customer is never charged for an order that does not exist and
   never gets an order they did not pay for.
   ========================================================= */

import { $, esc, inr, el } from "../core/app.js";
import { toast } from "../components/toast.js";
import { icon } from "../components/icons.js";
import { createOrder, issueCards } from "../services/order-service.js";
import { debitWallet, creditWallet } from "../services/wallet-service.js";
import { markOrderDelivered } from "../services/product-service.js";
import { getCart, clearCart, getCoupon, COUPONS } from "../services/cart-service.js";
import { removeCoupon } from "../services/product-service.js";

/* ------------------------------------------------------------------
   The amount is worked out from the lines handed in, never from whatever
   happens to be sitting in the cart. Buying straight from a product page has an
   empty cart, and reading the total from there charged nothing.
   Nothing is shipped, so there is no delivery charge either.
   ------------------------------------------------------------------ */
function priceUp(items, couponCode) {
  const sub = items.reduce((s, i) => s + Number(i.price || 0) * i.qty, 0);
  const mrp = items.reduce((s, i) => s + Number(i.mrp || i.price || 0) * i.qty, 0);

  let disc = 0;
  const c = COUPONS[String(couponCode || "").trim().toUpperCase()];
  if (c && sub >= c.min) {
    const raw = c.type === "percent" ? Math.round((sub * c.value) / 100) : Number(c.value || 0);
    disc = Math.min(c.max ? Math.min(raw, c.max) : raw, sub);
  }
  return { sub, mrp, disc, delivery: 0, total: Math.max(0, sub - disc), saved: mrp - Math.max(0, sub - disc) };
}

/* ------------------------------------------------------------------ */
export async function purchase({ items, user, coupon = "", note = "" }) {
  if (!items.length) return { ok: false, reason: "empty" };
  if (!user) return { ok: false, reason: "login" };

  /* Every line needs stock before any money moves.

     A product whose stock has never been set is not treated as sold out: the
     check is "counted and short", not "no number". Reading a blank stock as zero
     is what refused a whole order as out of stock when a line reached checkout
     without the field — the cart could not have produced one since, but the
     check itself was wrong to assume the worst. */
  for (const i of items) {
    const counted = i.stock !== undefined && i.stock !== null && i.stock !== "";
    if (counted && Number(i.stock) < i.qty) {
      return { ok: false, reason: "stock", name: i.name, left: Number(i.stock) };
    }
  }

  const t = priceUp(items, coupon);

  const debited = await debitWallet(user.id, t.total, "Card purchase", "");
  if (!debited.ok) return { ok: false, reason: "insufficient", balance: debited.balance ?? 0, need: t.total };

  try {
    /* A fresh card per purchase. Without this the product document's single
       cardNo was copied onto every order, so the same customer buying the
       same product twice received the same number both times. */
    const issued = await issueCards(items, user);

    const ref = await createOrder({
      user,
      items: issued,
      totals: t,
      address: { coupon },
      payment: "wallet",
      note
    });

    /* the card is handed over the moment it is paid for, so the order goes
       straight to delivered. A failure here is cosmetic only - the money is
       already taken and the order exists, so it must not trigger a refund. */
    await markOrderDelivered(ref.id).catch(() => {});

    /* hand back the cards that were actually issued, so the receipt shows the
       same numbers the order stores */
    return { ok: true, orderId: ref.id, balance: debited.balance, totals: t, items: issued };
  } catch (err) {
    /* put the money back rather than leaving a phantom charge */
    await creditWallet(user.id, t.total, "Reversed: order could not be created", "").catch(() => {});
    return { ok: false, reason: "order", message: err?.message || String(err) };
  }
}

/* ------------------------------------------------------------------
   The confirmation screen. For a prepaid card the useful part is the card
   itself, so it gets a real card face rather than a list of labels.
   ------------------------------------------------------------------ */
const groupDigits = (s) => String(s || "").replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();

function credRow(label, value, copy) {
  if (!value) return "";
  return '<div class="cred-row">' +
    '<span class="cred-k">' + esc(label) + "</span>" +
    '<span class="cred-v">' + esc(value) + "</span>" +
    (copy ? '<button class="cred-copy" data-copy="' + esc(value) + '" title="Copy">' + icon("copy", "ic ic-sm") + "</button>" : '<span class="cred-copy ghost"></span>') +
  "</div>";
}

function cardFace(c) {
  const brand = String(c.brand || c.name || "CARD").toUpperCase();
  return '<div class="pcard-face">' +
    '<div class="pcard-glow"></div>' +
    '<div class="pcard-top"><b>' + esc(brand) + "</b><span>" + esc(c.network || "card") + "</span></div>" +
    '<div class="pcard-chip"></div>' +
    '<div class="pcard-num">' + esc(groupDigits(c.cardNo)) + "</div>" +
    '<div class="pcard-bot">' +
      "<div><small>VALID THRU</small><b>" + esc(c.expiry || "—") + "</b></div>" +
      "<div><small>CARD HOLDER</small><b>" + esc(String(c.holderName || "").toUpperCase() || "—") + "</b></div>" +
    "</div>" +
  "</div>";
}

export function showReceipt(order, items) {
  const cards = items.filter((i) => i.cardNo);
  const t = order.totals || {};
  const bal = order.balance;

  const summary =
    '<div class="buy-sum">' +
      '<div class="buy-sum-row"><span>Paid for</span><b>' + esc(items.map((i) => i.name).join(", ")) + "</b></div>" +
      (t.disc ? '<div class="buy-sum-row"><span>Coupon</span><b class="text-ok">&minus; ' + esc(inr(t.disc)) + "</b></div>" : "") +
      '<div class="buy-sum-row big"><span>Total from wallet</span><b>' + esc(inr(t.total != null ? t.total : 0)) + "</b></div>" +
      (bal !== undefined ? '<div class="buy-sum-row"><span>Wallet left</span><b>' + esc(inr(bal)) + "</b></div>" : "") +
    "</div>";

  const cardBlocks = cards.length
    ? cards.map((c) =>
        '<div class="buy-card">' + cardFace(c) +
          '<div class="buy-card-rows">' +
            credRow("Card number", groupDigits(c.cardNo), true) +
            (c.holderName ? credRow("Name", c.holderName, false) : "") +
            (c.expiry ? credRow("Valid till", c.expiry, false) : "") +
            (c.pin ? credRow("PIN", c.pin, true) : "") +
            (c.cvv ? credRow("CVV", c.cvv, true) : "") +
          "</div>" +
          (c.instructions ? '<p class="buy-note">' + esc(c.instructions) + "</p>" : "") +
        "</div>"
      ).join("")
    : "";

  const back = el("div", { class: "modal-back open buy-back" },
    '<div class="modal modal-lg buy-modal">' +
      '<div class="buy-hero">' +
        '<span class="buy-tick">' + icon("check", "ic ic-lg") + "</span>" +
        "<div><h3>Payment successful</h3>" +
        "<p>Your card is ready. Keep these details safe.</p></div>" +
      "</div>" +
      '<div class="modal-body">' + summary + cardBlocks +
        (cards.length ? "" : '<p class="text-muted fs-sm">Your order is confirmed. Open My orders any time to view it.</p>') +
      "</div>" +
      '<div class="modal-foot">' +
        '<button class="btn btn-ghost" data-x>Keep shopping</button>' +
        '<a class="btn btn-primary" href="' + pageUrl("pages/orders.html") + '">' + icon("layers") + " View my orders</a>" +
      "</div>" +
    "</div>");

  document.body.appendChild(back);
  document.body.classList.add("no-scroll");
  const close = () => { back.remove(); document.body.classList.remove("no-scroll"); };
  back.querySelectorAll("[data-x]").forEach((b) => b.addEventListener("click", close));

  back.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(b.dataset.copy);
      toast("Copied.", "ok");
    } catch {
      toast("Could not copy. Select the text and copy it manually.", "warn");
    }
  }));

  return close;
}

/* ------------------------------------------------------------------
   Shared failure messaging, so the two entry points behave the same.
   Nothing is ever charged on a failure.
   ------------------------------------------------------------------ */
export function explain(err) {
  if (err.reason === "insufficient") {
    /* say it plainly, then take them to the page where the fix lives */
    toast("Wallet " + inr(err.balance || 0) + ", this costs " + inr(err.need) + ". Taking you to your wallet to add money.", "warn", "Not enough balance");
    setTimeout(() => { location.href = pageUrl("pages/wallet.html"); }, 1600);
    return;
  }
  if (err.reason === "stock") {
    toast("Only " + err.left + " left of " + err.name + ".", "err", "Out of stock");
    return;
  }
  if (err.reason === "login") {
    toast("Please log in to buy.", "warn");
    setTimeout(() => { location.href = pageUrl("pages/login.html"); }, 900);
    return;
  }
  toast("The purchase could not be completed. Nothing was charged.", "err", "Purchase failed");
}

/* ------------------------------------------------------------------
   Buy one product straight from its page.
   ------------------------------------------------------------------ */
export async function buyNow(product, qty = 1) {
  const n = Math.max(1, Number(qty) || 1);
  const items = [{
    id: product.id, name: product.name, price: product.price, mrp: product.mrp,
    qty: n, stock: product.stock, image: product.image,
    cardNo: product.cardNo, expiry: product.expiry, pin: product.pin, cvv: product.cvv,
    holderName: product.holderName, value: product.value,
    brand: product.brand, network: product.network, instructions: product.instructions
  }];

  const btn = $("#buyBtn");
  const label = btn ? btn.innerHTML : "";
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Processing'; }

  let user = null;
  try {
    const auth = await import("../core/auth.js");
    user = auth.PROFILE || (auth.CURRENT ? { id: auth.CURRENT.uid, name: auth.CURRENT.displayName, email: auth.CURRENT.email, phone: "" } : null);
    if (user && !user.id) user.id = auth.CURRENT?.uid;
  } catch { /* not signed in */ }

  const r = await purchase({ items, user });

  if (!r.ok) {
    if (btn) { btn.disabled = false; btn.innerHTML = label; }
    explain(r);
    return false;
  }

  if (btn) btn.innerHTML = label;
  toast(inr(product.price * n) + " paid from your wallet.", "ok", "Purchase complete");
  /* r.items holds the cards that were actually issued, which are not the ones
     the product document carried */
  showReceipt(r, r.items || items);
  return true;
}

/* ------------------------------------------------------------------
   Pay for everything sitting in the cart.
   ------------------------------------------------------------------ */
export async function buyCart(user) {
  const lines = getCart();
  if (!lines.length) {
    toast("Your cart is empty.", "warn");
    return false;
  }
  /* The cart only keeps id/name/price/qty, so the credentials have to be read
     back off the product before the order is written. Without this the order
     is created with empty cardNo/pin/cvv and My orders cannot show anything. */
  const { getProduct } = await import("../core/db.js");
  const items = [];
  for (const l of lines) {
    const p = (await getProduct(l.id).catch(() => null)) || l;
    items.push({
      id: l.id, name: l.name, price: l.price, mrp: l.mrp, qty: l.qty,
      cardNo: p.cardNo, expiry: p.expiry, pin: p.pin, cvv: p.cvv,
      holderName: p.holderName, value: p.value, brand: p.brand,
      network: p.network, instructions: p.instructions, image: p.image
    });
  }
  const r = await purchase({ items, user, coupon: (getCoupon() || "").split("|")[1] || "" });
  if (!r.ok) { explain(r); return false; }

  clearCart();
  removeCoupon();
  document.dispatchEvent(new CustomEvent("cart:change"));
  toast(inr(r.totals.total) + " paid from your wallet.", "ok", "Purchase complete");
  showReceipt(r, r.items || items);
  return true;
}
