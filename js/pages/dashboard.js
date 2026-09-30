import { auth } from "../core/firebase-config.js";
import { db } from "../core/db.js";
import { pageUrl } from "../core/app.js";

/* /dashboard.js  (user dashboard) */
import { $, inr, esc, fmtDate, timeAgo, statusBadge, ORDER_STATUS } from "../core/app.js";
import { emptyState } from "../components/ui.js";
import { cardTile } from "../components/card-visual.js";
import { getUserOrders } from "../services/order-service.js";
import { getProducts, seedIfEmpty } from "../services/product-service.js";
import { requireLogin, PROFILE, CURRENT } from "../core/auth.js";
import { getCart, cartCount } from "../services/cart-service.js";
import { getWallet } from "../services/wallet-service.js";
import { icon } from "../components/icons.js";

const HOUR = new Date().getHours();
const PART = HOUR < 12 ? "Good morning" : HOUR < 17 ? "Good afternoon" : "Good evening";

function statCard(ic, bg, fg, value, label) {
  return '<div class="card card-pad"><div class="stat">' +
    '<div class="stat-ic" style="background:' + bg + ";color:" + fg + '">' + icon(ic) + "</div>" +
    '<div><div class="stat-v">' + value + "</div><div class='stat-l'>" + label + "</div></div>" +
    "</div></div>";
}

async function loadStats(orders) {
  const active = orders.filter((o) => !["delivered", "cancelled"].includes(o.status)).length;
  const spent = orders.filter((o) => o.status !== "cancelled").reduce((s, o) => s + Number(o.total || 0), 0);
  const points = Math.floor(spent / 10);

  const wallet = await getWallet(CURRENT.uid).catch(() => ({ balance: 0 }));

  $("#statRow").innerHTML =
    statCard("box", "var(--brand-50)", "var(--brand-600)", orders.length, "Total orders") +
    statCard("truck", "var(--warn-50)", "var(--accent-600)", active, "In progress") +
    statCard("wallet", "var(--ok-50)", "var(--ok-600)", inr(spent), "Total spent") +
    statCard("gift", "var(--ink-900)", "var(--accent-400)", points, "Reward points") +
    statCard("wallet", "var(--brand-50)", "var(--brand-600)", inr(wallet.balance), "Wallet balance");

  const so = $("#sideOrdCount");
  if (so) { so.textContent = active; so.classList.toggle("hidden", !active); }
}

function renderRecent(orders) {
  const box = $("#recentOrders");
  if (!orders.length) {
    box.innerHTML = emptyState({
      icon: "cart", title: "No orders yet",
      text: "Place your first order and get 20% off with coupon SHOP10.",
      action: '<a class="btn btn-primary" href="' + pageUrl("pages/cards.html") + '">' + icon("cart") + " Start shopping</a>"
    });
    return;
  }
  box.innerHTML = orders.slice(0, 5).map((o) => `
    <div class="cart-row" style="grid-template-columns:1fr auto">
      <div>
        <b class="fs-sm">${esc(o.orderNo)}</b>
        <div class="fs-xs text-muted">${fmtDate(o.createdAt)} &middot; ${o.itemCount} item(s)</div>
      </div>
      <div class="tc">
        <b>${inr(o.total)}</b>
        <div class="mt-1">${statusBadge(ORDER_STATUS, o.status)}</div>
      </div>
    </div>`).join("");
}

async function loadSuggest() {
  const box = $("#suggest");
  try {
    await seedIfEmpty();
      box.innerHTML = (await getProducts({ sort: "popular", limitN: 4 })).map(cardTile).join("");
  } catch {
    box.innerHTML = '<p class="text-muted mb-0">Recommendations are unavailable right now.</p>';
  }
}

document.addEventListener("DOMContentLoaded", async () => {

  await requireLogin();

  $("#greet").textContent = PART + ", " + (PROFILE?.name || "shopper") + "!";
  $("#sub").textContent = "Track your orders and discover new products from here.";
  if (PROFILE && !PROFILE.phone) {
    $("#sub").innerHTML += ' <a href="\' + pageUrl("pages/profile.html") + \' class="fw-7">Add your phone number</a>';
  }

  const cc = cartCount();
  const sc = $("#sideCartCount");
  if (sc) { sc.textContent = cc; sc.classList.toggle("hidden", !cc); }

  let orders = [];
  try { orders = await getUserOrders(CURRENT.uid); }
  catch (e) {
    console.error(e);
    $("#recentOrders").innerHTML = '<div class="alert alert-warn"><span>!</span><div>Your orders could not be loaded. Check your connection.</div></div>';
  }

  await loadStats(orders);
  renderRecent(orders);
  await loadSuggest();
});
