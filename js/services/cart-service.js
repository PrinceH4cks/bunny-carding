/* No static import of product-service here. It used to be there for getCoupons,
   which created a cycle: cart-service -> product-service -> cart-service. Which of
   the two ran first depended on the page, so on some pages the cart's body ran
   while app.js was still initialising, and calling inr() at the top of this file
   threw — taking the whole module graph with it. getCoupons is fetched inside
   loadCoupons() instead, which is where it is actually used. */
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

/* Adds a product, or more of one already in the cart.

   Two different products are two lines; the same product twice is one line with
   a bigger quantity. That is what the find-by-id below is for, and it only works
   if the id is real — which is why this refuses a line without one rather than
   storing a blank. A blank id made every such line match every other blank one,
   so two different cards collapsed into a single row, and the stock field came
   out as an empty string, which checkout then read as zero and refused the order
   as out of stock.

   `stock` is a number here and a number is expected. The old `|| 1` fallback
   turned a missing stock into 1 and a stock of 0 into 1 as well, so a sold-out
   product went into the cart instead of being refused. An unknown stock — a
   product that has never had the field set — is treated as unlimited, because
   refusing to sell something the shop has not counted yet is the worse mistake. */
export function addToCart(item, qty = 1) {
  const want = Math.max(1, Number(qty) || 1);

  if (!item || typeof item !== "object" || !item.id) {
    console.error("addToCart was given something that is not a product", item);
    toast("That card could not be added.", "err");
    return { ok: false, reason: "bad-item" };
  }

  /* absent means the shop has not counted it, which is not the same as none */
  const hasStock = item.stock !== undefined && item.stock !== null && item.stock !== "";
  const stock = hasStock ? Math.max(0, Number(item.stock) || 0) : Infinity;

  const items = read();
  const found = items.find((i) => i.id === item.id);

  if (stock === 0) {
    toast(item.name + " is out of stock.", "warn");
    /* a line already in the cart must not be left looking buyable either */
    if (found && found.qty > 0) write(items.filter((i) => i.id !== item.id));
    return { ok: false, reason: "stock", name: item.name, left: 0 };
  }

  if (found) {
    const room = hasStock ? stock - found.qty : Infinity;
    if (want > room) {
      if (room <= 0) {
        toast("All " + item.name + " in stock is already in your cart.", "warn");
        return { ok: false, reason: "stock", name: item.name, left: 0 };
      }
      toast("Only " + room + " more of " + item.name + " in stock.", "warn");
      found.qty = stock;
    } else found.qty += want;
    /* an older line may predate the brand/network fields, so refresh them —
       and the stock, so a cart opened before a restock does not stay capped */
    CART_FIELDS.forEach((k) => { if (item[k] !== undefined) found[k] = item[k]; });
  } else {
    const line = { qty: hasStock ? Math.min(want, stock) : want };
    CART_FIELDS.forEach((k) => { line[k] = item[k] ?? ""; });
    items.push(line);
  }
  write(items);
  toast(item.name + " was added to your cart.", "ok");
  bump();
  return { ok: true, id: item.id, qty: (items.find((i) => i.id === item.id) || {}).qty };
}

export function setQty(id, qty) {
  const items = read();
  const it = items.find((i) => i.id === id);
  if (!it) return;
  /* an uncounted product is not capped; a sold-out one cannot be raised above
     zero, and asking for zero takes the line out rather than leaving a 0 qty row */
  const stock = it.stock === undefined || it.stock === null || it.stock === "" ? Infinity : Math.max(0, Number(it.stock) || 0);
  const n = Math.floor(Number(qty) || 0);
  if (n <= 0) { write(items.filter((i) => i.id !== id)); return; }
  const capped = Math.min(n, stock === Infinity ? n : stock);
  if (capped !== n) toast("Only " + capped + " of " + it.name + " in stock.", "warn");
  it.qty = capped;
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
