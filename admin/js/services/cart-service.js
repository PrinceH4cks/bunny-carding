/* No static import of product-service here. It used to be there for getCoupons,
   which created a cycle: cart-service -> product-service -> cart-service. Which
   of the two ran first depended on the page, so on the admin sign-in page the
   cart's module body ran while app.js was still initialising, and calling inr()
   at the top of this file threw. The whole graph then failed to load — no icon
   sprite, no data. getCoupons is fetched inside loadCoupons() instead, which is
   where it is actually used. */
import { db } from "../core/firebase-config.js";

/* =========================================================
   /cart-core.js
   Cart state (localStorage) + coupons + totals
   ========================================================= */

import { $, $$, inr } from "../core/app.js";
import { toast } from "../components/toast.js";

const KEY = "bc_cart_v1";
const COUPON_KEY = "bc_coupon_v1";

/* ---------- coupons ----------
   The built-in list is the fallback so the cart keeps working with no network.
   loadCoupons() replaces it with whatever the admin has published, which is what
   makes the Admin > Coupons screen actually mean something at checkout.

   A coupon only ever changes the discount line. It never touches a product's
   price, so the number the shopper was shown and the number on the order cannot
   drift apart. */
const BUILT_IN = {
  SHOP10:   { type: "percent", value: 10, max: 150, min: 299, label: "10% off (max " + inr(150) + ")" },
  SAVE200:  { type: "flat",    value: 200, min: 799, label: inr(200) + " off" },
  FIRST100: { type: "flat",    value: 100, min: 499, label: inr(100) + " off on your first order" }
};

export const COUPONS = { ...BUILT_IN };

const stamp = (v) => (v && typeof v.toDate === "function" ? v.toDate().getTime() : v ? new Date(v).getTime() : null);

export async function loadCoupons() {
  try {
    const { getCoupons } = await import("../core/db.js");
    const live = await getCoupons();
    if (!Array.isArray(live) || !live.length) return;
    const now = Date.now();
    const next = {};
    live.forEach((c) => {
      if (c.active === false) return;
      if (c.startsAt && stamp(c.startsAt) && now < stamp(c.startsAt)) return;
      if (c.endsAt && stamp(c.endsAt) && now > stamp(c.endsAt)) return;
      if (c.maxUses > 0 && (c.used || 0) >= c.maxUses) return;
      const value = Number(c.value) || 0;
      if (value <= 0) return;
      next[String(c.code || "").toUpperCase()] = {
        type: c.kind === "flat" ? "flat" : "percent",
        value,
        /* a percent coupon is capped at 30% of the order, so a large code can
           never wipe out the whole basket */
        max: c.kind === "flat" ? value : Math.round((cartSubtotalSafe() * 30) / 100),
        min: Number(c.minOrder) || 0,
        label: c.kind === "flat" ? inr(value) + " off" : Math.min(100, value) + "% off"
      };
    });
    /* keep the built-ins as a floor so a shopper is never locked out by an
       admin who has not created anything yet */
    Object.keys(COUPONS).forEach((k) => delete COUPONS[k]);
    Object.assign(COUPONS, BUILT_IN, next);
    /* re-validate whatever was already applied against the refreshed list */
    const held = getCoupon();
    if (held) {
      const code = held.split("|")[1];
      if (!COUPONS[code]) localStorage.removeItem(COUPON_KEY);
    }
    document.dispatchEvent(new CustomEvent("coupon:change"));
  } catch {
    /* offline or no permission: the built-in list stands */
  }
}

const cartSubtotalSafe = () => { try { return cartSubtotal(); } catch { return 0; } };

const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
const write = (items) => {
  localStorage.setItem(KEY, JSON.stringify(items));
  paintCount();
  document.dispatchEvent(new CustomEvent("cart:change", { detail: items }));
};

export const getCart = read;
export const cartCount = () => read().reduce((s, i) => s + i.qty, 0);
export const cartSubtotal = () => read().reduce((s, i) => s + i.price * i.qty, 0);
export const cartMrp = () => read().reduce((s, i) => s + (i.mrp || i.price) * i.qty, 0);
export const cartSavings = () => cartMrp() - cartSubtotal();

export const getCoupon = () => localStorage.getItem(COUPON_KEY) || "";

export function applyCoupon(code) {
  const c = COUPONS[String(code).trim().toUpperCase()];
  if (!c) return { ok: false, msg: "That coupon code is not valid." };
  const sub = cartSubtotal();
  if (sub < c.min) return { ok: false, msg: "This coupon applies to orders above " + inr(c.min) + "." };
  localStorage.setItem(COUPON_KEY, c.label + "|" + String(code).trim().toUpperCase());
  return { ok: true, msg: "Coupon applied." };
}

export function removeCoupon() { localStorage.removeItem(COUPON_KEY); }

export function couponDiscount() {
  const raw = getCoupon();
  if (!raw) return 0;
  const c = COUPONS[raw.split("|")[1]];
  if (!c) return 0;
  const sub = cartSubtotal();
  if (sub < c.min) return 0;
  const d = c.type === "percent" ? Math.round((sub * c.value) / 100) : c.value;
  return Math.min(c.max ? Math.min(d, c.max) : d, sub);
}

/* Nothing is shipped, so there is no delivery charge to add and no free-delivery
   threshold to chase. js/buy.js already totals at zero delivery; this keeps the
   cart page honest instead of quietly adding a Rs 49 line and a "spend more for
   free delivery" nudge. The delivery key stays in the shape because the order
   documents in db.js and both orders screens still read it. */
const DELIVERY = 0;

export function totals() {
  const sub = cartSubtotal();
  const disc = couponDiscount();
  const afterDisc = Math.max(0, sub - disc);
  const delivery = DELIVERY;
  return {
    sub, disc, delivery,
    total: Math.round(afterDisc + delivery),
    saved: cartSavings() + disc
  };
}

/* ---------- actions ---------- */
/* Only the fields the cart actually reads are kept. brand and network are
   stored because the cart draws the real card face, and a face with no brand
   and no network printed "CARD" in both of its top corners. */
const CART_FIELDS = ["id", "name", "price", "mrp", "stock", "image", "category", "brand", "network"];

export function addToCart(item, qty = 1) {
  const items = read();
  const found = items.find((i) => i.id === item.id);
  if (found) {
    if (found.qty + qty > item.stock) {
      toast("Only " + item.stock + " left in stock.", "warn");
      found.qty = item.stock;
    } else found.qty += qty;
    /* an older line may predate the brand/network fields, so refresh them */
    CART_FIELDS.forEach((k) => { if (item[k] !== undefined) found[k] = item[k]; });
  } else {
    const line = { qty: Math.min(qty, item.stock || 1) };
    CART_FIELDS.forEach((k) => { line[k] = item[k] ?? ""; });
    items.push(line);
  }
  write(items);
  toast(item.name + " was added to your cart.", "ok");
  bump();
}

export function setQty(id, qty) {
  const items = read();
  const it = items.find((i) => i.id === id);
  if (!it) return;
  it.qty = Math.max(1, Math.min(qty, it.stock || 99));
  write(items);
}

export function removeItem(id) {
  write(read().filter((i) => i.id !== id));
  toast("Item removed from your cart.", "info");
}

export function clearCart() {
  localStorage.removeItem(KEY);
  removeCoupon();
  paintCount();
  document.dispatchEvent(new CustomEvent("cart:change", { detail: [] }));
}

function bump() {
  const b = $(".cart-btn");
  if (b) b.animate?.(
    [{ transform: "scale(1)" }, { transform: "scale(1.25)" }, { transform: "scale(1)" }],
    { duration: 340, easing: "ease-out" }
  );
}

export function paintCount() {
  const n = cartCount();
  $$("[data-cart-count]").forEach((b) => {
    b.textContent = n > 99 ? "99+" : n;
    b.style.display = n ? "grid" : "none";
  });
}

document.addEventListener("DOMContentLoaded", paintCount);
if (document.readyState !== "loading") paintCount();
