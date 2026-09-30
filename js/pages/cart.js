import { field, pageUrl } from "../core/app.js";
import { getProducts } from "../services/product-service.js";
import { db } from "../core/db.js";

/* /cart.js  (cart page) */
import { $, $$, inr, esc } from "../core/app.js";
import { toast } from "../components/toast.js";
import { emptyState } from "../components/ui.js";
import { confirmBox } from "../components/modal.js";
import { getCart, setQty, removeItem, clearCart, totals, applyCoupon, getCoupon, cartCount, loadCoupons } from "../services/cart-service.js";
import { removeCoupon } from "../services/product-service.js";
import { catLabel } from "../services/product-service.js";
import { cardVisual } from "../components/card-visual.js";
import { buyCart } from "./buy.js";
import { icon } from "../components/icons.js";

/* the discount the store is already offering, before any coupon */
const productSave = (i) => Math.max(0, (i.mrp || i.price) - i.price) * i.qty;

function savingsLine() {
  const save = getCart().reduce((s, i) => s + productSave(i), 0);
  return save > 0
    ? '<div class="summary-line"><span>Price saving</span><b class="text-ok">&minus; ' + inr(save) + "</b></div>"
    : "";
}

function render() {
  const items = getCart();
  const zone = $("#zone");

  $("#cartCount").textContent = items.length
    ? cartCount() + (cartCount() === 1 ? " item" : " items") + " ready to buy"
    : "Your cart is currently empty.";

  if (!items.length) {
    zone.innerHTML = '<div class="card">' + emptyState({
      icon: "cart", title: "Your cart is empty",
      text: "Add any product you like and check out from here.",
      action: '<div class="flex gap-2 justify-center wrap">' +
        '<a class="btn btn-primary" href="' + pageUrl("pages/cards.html") + '">' + icon("cart") + " Browse products</a>" +
        '<a class="btn btn-ghost" href="' + pageUrl("pages/dashboard.html") + '">Go to dashboard</a></div>'
    }) + "</div>";
    return;
  }

  const t = totals();
  const coupon = getCoupon();
  const code = coupon.split("|")[1] || "";

  zone.innerHTML = `
  <div class="cart-layout">

    <section class="card">
      <div class="card-head">
        <h3 class="mb-0">Items (${cartCount()})</h3>
        <button class="btn btn-xs btn-ghost" id="clearBtn">${icon("trash", "ic ic-sm")} Empty cart</button>
      </div>
      <div class="card-body">
        ${items.map((i) => `
          <div class="cart-row" data-id="${esc(i.id)}">
            <a class="cart-thumb cart-thumb-card" href="../../pages/card-detail.html" aria-label="${esc(i.name)}">
              ${i.image
                ? '<img src="' + esc(i.image) + '" class="img-cover" alt="' + esc(i.name) + '">'
                : cardVisual(i, { size: "sm" })}
            </a>

            <div class="cart-info">
              <b class="cart-name">${esc(i.name)}</b>
              <div class="cart-tags">
                <span class="badge badge-sm">${esc(catLabel(i.category))}</span>
                <span class="fs-xs ${i.stock > 0 ? "stock in" : "stock out"}">
                  ${i.stock > 0 ? i.stock + " in stock" : "Out of stock"}
                </span>
              </div>
              <div class="cart-price">
                <b>${inr(i.price)}</b>
                ${i.mrp > i.price
                  ? '<s class="fs-xs text-muted">' + inr(i.mrp) + "</s>" +
                    '<span class="cart-off">Save ' + inr(productSave({ ...i, qty: 1 })) + "</span>"
                  : ""}
              </div>
            </div>

            <div class="cart-actions">
              <div class="qty">
                <button data-dec aria-label="Decrease quantity">&minus;</button>
                <input type="number" value="${i.qty}" min="1" max="${i.stock || 99}" data-qty aria-label="Quantity for ${esc(i.name)}">
                <button data-inc aria-label="Increase quantity">+</button>
              </div>
              <b class="cart-line">${inr(i.price * i.qty)}</b>
              <button class="btn btn-ghost btn-icon cart-del" data-del title="Remove ${esc(i.name)}" aria-label="Remove ${esc(i.name)}">${ic("trash", "ic ic-sm")}</button>
            </div>
          </div>`).join("")}
      </div>
    </section>

    <aside class="card summary">
      <div class="card-head"><h3 class="mb-0">Bill summary</h3></div>
      <div class="card-body">

        <div class="field">
          <label>Coupon code</label>
          <div class="flex gap-1">
            <input class="input" id="cpn" placeholder="SHOP10" value="${esc(code)}" ${coupon ? "disabled" : ""}>
            ${coupon
              ? '<button class="btn btn-ghost" id="cpnRm" title="Remove coupon">' + ic("x") + "</button>"
              : '<button class="btn btn-dark" id="cpnAp">Apply</button>'}
          </div>
          ${coupon ? '<div class="field-ok" style="display:block">' + ic("check", "ic ic-sm") + " " + esc(coupon.split("|")[0]) + " applied</div>" : ""}
        </div>

        <div class="summary-line"><span>Subtotal</span><b>${inr(t.sub)}</b></div>
        ${savingsLine()}
        ${t.disc ? '<div class="summary-line"><span>Coupon discount</span><b class="text-ok">&minus; ' + inr(t.disc) + "</b></div>" : ""}

        <div class="summary-line total"><span>Total</span><span>${inr(t.total)}</span></div>
        ${t.saved > 0 ? '<div class="text-center fs-sm fw-7 text-ok mt-1">You save ' + inr(t.saved) + " in total</div>" : ""}

        <div class="alert alert-ok mt-1">${icon("gift")}<div>Your cards show up in <b>My orders</b> the moment you pay.</div></div>

        <button class="btn btn-primary btn-lg btn-block mt-3" id="payBtn">${ic("wallet")} Pay from wallet</button>
        <a href="../../pages/cards.html" class="btn btn-ghost btn-block mt-1">Add more products</a>

        <div class="flex gap-2 center justify-center mt-3 fs-xs text-muted wrap">
          <span>${icon("lock")} Secure</span>&middot;<span>${icon("wallet")} Paid from your wallet</span>&middot;<span>${icon("zap")} Instant access</span>
        </div>
      </div>
    </aside>
  </div>`;

  bind();
}

const ic = (n, c = "ic ic-sm") => icon(n, c);

/* Lines added before the cart stored brand and network have neither, and
   cardVisual() then printed "CARD" in both top corners. Products that carry a
   network are fetched once and used to fill the gaps; a line whose product is
   gone keeps the plain placeholder. */
let LOOKUP = null;

async function fillCardFaces(items) {
  const missing = items.filter((i) => !i.brand || !i.network);
  if (!missing.length) return items;
  if (!LOOKUP) {
    try {
      const { getProducts } = await import("../core/db.js");
      const all = await getProducts({ limitN: 500, onlyActive: false });
      LOOKUP = new Map((all || []).map((p) => [p.id, p]));
    } catch {
      LOOKUP = new Map();
    }
  }
  items.forEach((i) => {
    const p = LOOKUP.get(i.id);
    if (!p) return;
    if (!i.brand) i.brand = p.brand || "";
    if (!i.network) i.network = p.network || "";
  });
  return items;
}

function bind() {
  const items = getCart();

  $$(".cart-row").forEach((row) => {
    const id = row.dataset.id;
    const it = items.find((i) => i.id === id);
    const input = row.querySelector("[data-qty]");

    row.querySelector("[data-inc]").addEventListener("click", () => { setQty(id, it.qty + 1); render(); });
    row.querySelector("[data-dec]").addEventListener("click", () => {
      if (it.qty <= 1) { removeItem(id); render(); return; }
      setQty(id, it.qty - 1); render();
    });
    input.addEventListener("change", () => { setQty(id, Number(input.value) || 1); render(); });
    row.querySelector("[data-del]").addEventListener("click", () => { removeItem(id); render(); });
  });

  $("#clearBtn")?.addEventListener("click", async () => {
    if (await confirmBox({ title: "Empty your cart?", text: "All items will be removed.", ok: "Yes, empty it" })) {
      clearCart();
      render();
    }
  });

  $("#cpnAp")?.addEventListener("click", () => {
    const r = applyCoupon($("#cpn").value);
    toast(r.msg, r.ok ? "ok" : "err");
    if (r.ok) render();
  });

  $("#cpnRm")?.addEventListener("click", () => { removeCoupon(); render(); });

  /* one button pays the whole cart from the wallet - no checkout page exists */
  $("#payBtn")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const label = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Processing';
    try {
      let user = null;
      const auth = await import("../core/auth.js");
      if (auth.CURRENT) {
        user = auth.PROFILE || { id: auth.CURRENT.uid, name: auth.CURRENT.displayName, email: auth.CURRENT.email, phone: "" };
        if (!user.id) user.id = auth.CURRENT.uid;
      }
      await buyCart(user);
    } catch (err) {
      console.error(err);
      toast("The payment could not be completed. Nothing was charged.", "err");
    } finally {
      btn.disabled = false;
      btn.innerHTML = label;
    }
  });
}

    document.addEventListener("cart:change", () => {
      if (location.pathname.endsWith("../../pages/cart.html")) render();
    });

    /* the code list comes from Admin > Coupons, so refresh it and re-render */
    document.addEventListener("coupon:change", () => {
      if (location.pathname.endsWith("../../pages/cart.html")) render();
    });

document.addEventListener("DOMContentLoaded", async () => {
  await fillCardFaces(getCart());
  render();
  loadCoupons();
});
