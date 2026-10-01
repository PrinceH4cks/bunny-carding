import { auth } from "../core/firebase-config.js";
import { addToCart } from "../services/cart-service.js";
import { pageUrl } from "../core/app.js";

/* /orders.js  (customer orders + tracking) */
import { $, $$, inr, esc, fmtDate, timeAgo, statusBadge, ORDER_STATUS, PAY_STATUS } from "../core/app.js";
import { toast } from "../components/toast.js";
import { emptyState } from "../components/ui.js";
import { openModal, confirmBox } from "../components/modal.js";
import { getUserOrders, setOrderStatus } from "../services/order-service.js";
import { getProduct } from "../services/product-service.js";
import { cardVisual, groupCardNo, fmtExp } from "../components/card-visual.js";
import { requireLogin, CURRENT } from "../core/auth.js";
import { updateDoc, doc, increment } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db, COL } from "../core/db.js";
import { icon } from "../components/icons.js";

let ALL = [];
let TAB = "p-all";
let QUERY = "";

const FILTERS = {
  "p-all":     () => true,
  "p-pending": (o) => ["pending", "confirmed"].includes(o.status),
  "p-ready":   (o) => ["paid", "ready"].includes(o.status),
  "p-done":    (o) => o.status === "delivered",
  "p-cancel":  (o) => o.status === "cancelled"
};

/* Each tab carries its own count, so the numbers are read off FILTERS rather
   than a hand-kept tally that would drift the moment a status changes. */
const TABS = [
  { key: "p-all",     label: "All"       },
  { key: "p-pending", label: "Pending"   },
  { key: "p-ready",   label: "Ready"     },
  { key: "p-done",    label: "Completed" },
  { key: "p-cancel",  label: "Cancelled" }
];

/* the search box matches the things a customer actually remembers */
function matches(o, q) {
  if (!q) return true;
  const hay = [
    o.orderNo, o.userEmail, o.userName,
    o.coupon,
    ...(o.items || []).map((i) => i.name)
  ].join(" ").toLowerCase();
  return hay.includes(q);
}

const paid = (o) => o.payStatus === "paid" || (o.paymentStatus === "paid" && !o.payStatus);
const money = (n) => inr(Number(n || 0));

/* ------------------------------------------------------------------
   Orders placed before the card details were saved with them.

   A prepaid card product IS its own card: one product document holds one
   card number, PIN and CVV, and the stock counter is just a count of how many
   people may buy that same card. So for an order whose items are missing the
   credentials, the product document is the authoritative place to read them
   back from.

   This is safe to do on every page load and needs no migration step. It only
   ever fills in a blank; an order that already carries its own card numbers
   is never touched. getUserOrders loads the page's own orders, so the only
   products read are ones this customer already bought.
   ------------------------------------------------------------------ */
const repaired = new Set();

/* The product editor's live preview falls back to these while the admin types,
   and an early save path could write them for real. They are not a card, so
   treating them as one would put "0000 0000 0000 0000" in front of a customer
   who has already paid. */
const PLACEHOLDER_NO = /^0+$/;
const hasReal = (v, min) => !!v && String(v).trim().length >= min && !PLACEHOLDER_NO.test(String(v).trim());
const realCard = (i) => hasReal(i.cardNo, 12) || hasReal(i.pin, 3);
const needsRepair = (o) => (o.items || []).some((i) => !realCard(i));

async function repairOrders() {
  if (repaired.size) return;
  const stale = ALL.filter((o) => paid(o) && needsRepair(o) && !repaired.has(o.id));
  if (!stale.length) return;

  for (const o of stale) {
    await Promise.allSettled((o.items || []).map(async (i) => {
      if (realCard(i) || !i.id) return;
      const p = await getProduct(i.id).catch(() => null);
      if (!p) return;
      /* fill only the blanks, and never copy a placeholder over a real value */
      if (!hasReal(i.cardNo, 12) && hasReal(p.cardNo, 12)) i.cardNo = p.cardNo;
      if (!hasReal(i.pin, 3) && hasReal(p.pin, 3)) i.pin = p.pin;
      if (!hasReal(i.cvv, 3) && hasReal(p.cvv, 3)) i.cvv = p.cvv;
      if (!hasReal(i.expiry, 4) && hasReal(p.expiry, 4)) i.expiry = p.expiry;
      i.holderName = i.holderName || p.holderName || "";
      i.value = i.value || p.value || 0;
      i.brand = i.brand || p.brand || "";
      i.network = i.network || p.network || "";
      i.instructions = i.instructions || p.instructions || "";
      i.image = i.image || p.image || "";
    }));
    repaired.add(o.id);
  }
}

/* Nothing is packed or shipped: the card details land in the account the moment
   the wallet payment clears, so the track is receive -> confirmed -> ready. */
const STEPS = [
  { key: "pending",   label: "Order received",      ic: "ticket"    },
  { key: "confirmed", label: "Payment confirmed",   ic: "check"     },
  { key: "ready",     label: "Cards ready",         ic: "gift"      },
  { key: "delivered", label: "Completed",           ic: "check"     }
];

const ORDER = ["pending", "confirmed", "ready", "delivered"];

function card(o) {
  const step = ORDER.indexOf(o.status);
  const items = o.items || [];
  const n = o.itemCount || items.reduce((s, i) => s + Number(i.qty || 0), 0);
  const saved = Number(o.subtotal || 0) - Number(o.discount || 0) - Number(o.total || 0);

  return `
  <article class="card ord-card">
    <div class="card-head ord-head">
      <div class="ord-head-id">
        <b>${esc(o.orderNo)}</b>
        <span class="ord-head-when">${fmtDate(o.createdAt)} &middot; ${timeAgo(o.createdAt)}</span>
      </div>
      <div class="ord-head-badges">
        ${statusBadge(ORDER_STATUS, o.status)}
        ${o.payStatus === "awaiting"
          ? '<span class="badge badge-warn badge-dot">Payment due</span>'
          : statusBadge(PAY_STATUS, o.paymentStatus)}
      </div>
    </div>

    <div class="card-body">
      <div class="ord-items">
        <div class="ord-items-list">
          ${items.slice(0, 4).map((i) => `
            <div class="ord-item">
              <div class="ord-item-thumb cart-thumb cart-thumb-ph">
                ${i.image ? '<img src="' + esc(i.image) + '" class="img-cover">' : icon("box", "ic ic-sm")}
              </div>
              <div class="ord-item-txt">
                <b>${esc(i.name)}</b>
                <small class="text-muted">&times;${i.qty}</small>
              </div>
            </div>`).join("")}
          ${items.length > 4
            ? '<div class="ord-item"><div class="ord-item-more">+' + (items.length - 4) + "</div>" +
              '<div class="ord-item-txt"><small class="text-muted">' + (items.length - 4) +
              " more product" + (items.length - 4 > 1 ? "s" : "") + "</small></div></div>"
            : ""}
        </div>
        <div class="ord-total">
          <div class="fs-xs text-muted">Total</div>
          <b>${money(o.total)}</b>
          <div class="fs-xs text-muted">${n} item${n === 1 ? "" : "s"}</div>
          ${Number(o.discount || 0) > 0
            ? '<div class="fs-xs text-ok">saved ' + money(o.discount) + "</div>"
            : ""}
        </div>
      </div>

      ${paid(o) ? revealPanel(o) : o.payStatus === "awaiting" ? pendingPanel(o) : ""}

      ${o.status === "cancelled" ? "" : `
      <ul class="ord-track">
        ${STEPS.map((s, i) => `
          <li class="ord-step${i <= step ? " on" : ""}${i === step ? " now" : ""}">
            <span class="ord-dot">${i <= step ? icon("check", "ic ic-xs") : ""}</span>
            <b>${esc(s.label)}</b>
          </li>`).join("")}
      </ul>`}
    </div>

    <div class="card-foot ord-foot">
      <span class="ord-foot-note">${icon("wallet", "ic ic-sm")} Paid from wallet${o.coupon ? " &middot; coupon " + esc(o.coupon) : ""}</span>
      <div class="ord-foot-acts">
        ${["pending", "confirmed"].includes(o.status)
          ? '<button class="btn btn-ghost btn-xs" data-cancel="' + esc(o.id) + '">' + icon("x", "ic ic-sm") + " Cancel</button>" : ""}
        <button class="btn btn-ghost btn-xs" data-again="${esc(o.id)}">${icon("repeat", "ic ic-sm") + " Reorder"}</button>
        <button class="btn btn-primary btn-xs" data-view="${esc(o.id)}">${icon("eye", "ic ic-sm") + " Details"}</button>
      </div>
    </div>
  </article>`;
}

/* the tab strip, rebuilt from TABS so the counts cannot fall out of step */
function paintTabs() {
  const box = $(".tabs[data-ordtabs]");
  if (!box) return;
  box.innerHTML = TABS.map((t) => {
    const n = ALL.filter(FILTERS[t.key]).length;
    return '<button class="tab' + (t.key === TAB ? " active" : "") + '" data-tab="' + t.key + '">' +
      esc(t.label) +
      (n ? ' <span class="tab-n">' + n + "</span>" : "") +
      "</button>";
  }).join("");
  box.classList.toggle("hide-sm", false);
}

/* a short summary of the account's money, so the page answers "what did I
   spend" without anyone having to add the cards up */
function paintSummary() {
  const box = $("#ordSummary");
  if (!box) return;
  if (!ALL.length) { box.innerHTML = ""; box.classList.add("hidden"); return; }
  box.classList.remove("hidden");

  const live = ALL.filter((o) => o.status !== "cancelled");
  const spend = live.reduce((s, o) => s + Number(o.total || 0), 0);
  const saved = live.reduce((s, o) => s + Number(o.discount || 0), 0);
  const cards = live.reduce((s, o) =>
    s + (o.items || []).filter((i) => i.cardNo || i.pin).length, 0);
  const pending = ALL.filter((o) => ["pending", "confirmed"].includes(o.status)).length;

  const stat = (v, l, ic) =>
    '<div class="card ord-stat">' +
      '<span class="ord-stat-ic">' + icon(ic, "ic ic-sm") + "</span>" +
      '<div class="ord-stat-txt">' +
        '<div class="ord-stat-v">' + v + "</div>" +
        '<div class="ord-stat-l">' + l + "</div>" +
      "</div>" +
    "</div>";

  /* Deliberately no .g-4 here. The project collapses .g-2/.g-3/.g-4 to a single
     column at <=760px, and that rule sits later in the stylesheet, so it wins on
     equal specificity and the summary ended up as five full-width bars. */
  box.className = "grid mb-3 ord-stats";
  box.innerHTML =
    stat(ALL.length, "orders placed", "box") +
    stat(money(spend), "total spent", "wallet") +
    stat(money(saved), "saved on coupons", "coins") +
    stat(pending, pending === 1 ? "order in progress" : "orders in progress", "hourglass") +
    (cards ? stat(cards, "cards issued", "gift") : "");
}

function wire(zone) {
  zone.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => openDetail(b.dataset.view)));
  zone.querySelectorAll("[data-again]").forEach((b) => b.addEventListener("click", () => reOrder(b.dataset.again)));
  zone.querySelectorAll("[data-cancel]").forEach((b) => b.addEventListener("click", () => cancelOrder(b.dataset.cancel)));
  zone.querySelectorAll("[data-cp]").forEach((b) => b.addEventListener("click", async () => {
    if (!b.dataset.cp) { toast("There is nothing to copy here.", "warn"); return; }
    try {
      await navigator.clipboard.writeText(b.dataset.cp);
      b.classList.add("copied-flash");
      toast("Copied to clipboard.", "ok");
    } catch {
      toast("Could not copy. Select the text and copy it manually.", "warn");
    }
  }));
}

function render() {
  const zone = $("#zone");
  const q = QUERY.trim().toLowerCase();
  const list = ALL.filter(FILTERS[TAB]).filter((o) => matches(o, q));

  const count = $("#ordCount");
  if (count) {
    count.textContent = list.length === ALL.length
      ? ALL.length + (ALL.length === 1 ? " order" : " orders")
      : list.length + " of " + ALL.length + " orders";
  }

  if (!ALL.length) {
    zone.innerHTML = '<div class="card">' + emptyState({
      icon: "box", title: "No orders yet",
      text: "You have not placed an order yet. Your cards will show up here the moment you pay for them.",
      action: '<a class="btn btn-primary" href="' + pageUrl("pages/cards.html") + '">Browse products</a>'
    }) + "</div>";
    return;
  }

  if (!list.length) {
    zone.innerHTML = '<div class="card">' + emptyState({
      icon: "search",
      title: q ? "Nothing matches that search" : "No orders in this tab",
      text: q
        ? "Try the order number or the product name."
        : "Nothing here right now. Try another tab, or place a new order.",
      action: q
        ? '<button class="btn btn-ghost" data-clear>Clear search</button>'
        : '<a class="btn btn-ghost" href="' + pageUrl("pages/cards.html") + '">Browse products</a>'
    }) + "</div>";
    zone.querySelector("[data-clear]")?.addEventListener("click", () => {
      QUERY = "";
      const s = $("#ordSearch");
      if (s) s.value = "";
      render();
    });
    return;
  }

  zone.innerHTML = '<div class="flex col gap-2">' + list.map(card).join("") + "</div>";
  wire(zone);
}

function pendingPanel(o) {
  return '<div class="alert alert-warn mt-3">' + icon("hourglass") +
    "<div><b>Payment is not complete yet</b><br>" +
    "Pay " + inr(o.payAmount || o.total) + " for order " + esc(o.orderNo) +
    " and enter your UTR, or open the order details to see the QR again.</div></div>";
}

/* ---------- one card's credentials ---------- */
function credRow(label, value, copy) {
  if (!value) return "";
  return '<div class="cred-row">' +
    '<span class="cred-k">' + esc(label) + "</span>" +
    '<span class="cred-v">' + esc(value) + "</span>" +
    (copy
      ? '<button class="cred-copy" data-cp="' + esc(value) + '" title="Copy ' + esc(label) + '" aria-label="Copy ' + esc(label) + '">' + icon("copy", "ic ic-sm") + "</button>"
      : '<span class="cred-copy ghost"></span>') +
  "</div>";
}

/* An older order may have been written before the credentials were saved with
   it, and repairOrders() could not find them on the product either. Saying so
   plainly beats a row of em dashes that looks like a broken card. */
function missingCreds(item) {
  return !realCard(item);
}

function credBlock(item, o) {
  if (missingCreds(item)) {
    return '<div class="alert alert-warn">' + icon("hourglass") +
      "<div><b>Card details are not stored on this order</b><br>" +
      "This order was placed before the card details were saved with it. " +
      "Open a support request quoting order " + esc(o.orderNo) +
      " and we will send them to you again.</div></div>";
  }
  return '<div class="cred-rows">' +
    credRow("Card number", groupCardNo(item.cardNo), true) +
    credRow("PIN", item.pin, true) +
    credRow("CVV", item.cvv, true) +
    credRow("Valid thru", fmtExp(item.expiry), false) +
    (item.value ? credRow("Value", money(item.value), false) : "") +
  "</div>" +
  (item.instructions ? '<div class="alert alert-info fs-sm">' + icon("bulb") + "<div>" + esc(item.instructions) + "</div></div>" : "");
}

function revealPanel(o) {
  const items = o.items || [];
  /* An order can hold several cards, so decide once at the top whether any of
     them can actually be shown. Falling through to the warning for the whole
     order keeps a half-populated order from showing a face for one card and a
     warning for the other. */
  const usable = items.filter((i) => i.cardNo || i.pin);
  if (!usable.length) {
    return '<div class="reveal-panel mt-3">' +
      '<div class="flex between center wrap gap-2 mb-2">' +
        '<b class="fs-sm"><span class="text-ok fw-7">' + icon("verified") + " Payment verified</span>" +
        (items.length > 1 ? " &mdash; " + items.length + " cards purchased" : " &mdash; card purchased") + "</b>" +
        '<span class="fs-xs text-muted">Order ' + esc(o.orderNo) + "</span>" +
      "</div>" +
      '<div class="alert alert-warn">' + icon("hourglass") +
        "<div><b>We do not have the card number for this order</b><br>" +
        "The card details for order " + esc(o.orderNo) +
        " were never saved and are not on the product either, so this is not something the page can recover. " +
        "Please contact support with the order number and we will send the card details to you.</div>" +
        '<a class="btn btn-primary btn-sm mt-2" href="' + pageUrl("pages/contact.html") + '">' +
        icon("support", "ic ic-sm") + " Contact support</a>" +
      "</div>" +
    "</div>";
  }

  return '<div class="reveal-panel ord-reveal">' +
    '<div class="ord-reveal-head">' +
      '<b><span class="text-ok fw-7">' + icon("verified") + " Payment verified</span>" +
      (items.length > 1
        ? " &mdash; your " + items.length + " cards are ready"
        : " &mdash; your card is ready") + "</b>" +
      '<span class="ord-reveal-no">Order ' + esc(o.orderNo) + "</span>" +
    "</div>" +
    '<div class="ord-cards">' +
      usable.map((i, n) =>
        '<div class="ord-card-row">' +
          '<div class="ord-card-face">' +
            cardVisual(i, { reveal: true, holder: i.holderName || o.userName || "CUSTOMER NAME", size: "sm" }) +
          "</div>" +
          '<div class="ord-card-creds">' +
            (usable.length > 1
              ? '<b class="fs-xs text-muted ord-cred-idx">Card ' + (n + 1) + " of " + usable.length + "</b>"
              : "") +
            credBlock(i, o) +
          "</div>" +
        "</div>").join("") +
    "</div>" +
  "</div>";
}

function openDetail(id) {
  const o = ALL.find((x) => x.id === id);
  if (!o) return;
  const step = ORDER.indexOf(o.status);

  $("#odBody").innerHTML = `
    <div class="flex between wrap gap-2 mb-2">
      <div>
        <b class="fs-lg">${esc(o.orderNo)}</b>
        <div class="fs-sm text-muted">${fmtDate(o.createdAt)}</div>
      </div>
      <div class="flex gap-1">${statusBadge(ORDER_STATUS, o.status)}${statusBadge(PAY_STATUS, o.paymentStatus)}</div>
    </div>

    <div class="divider"></div>
    <h4 class="mb-1">Items</h4>
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>Product</th><th>Price</th><th>Qty</th><th class="tr">Total</th></tr></thead>
        <tbody>
          ${(o.items || []).map((i) => `
            <tr>
              <td>
                <div class="flex gap-2 center">
                  <div class="cart-thumb cart-thumb-ph" style="width:44px;height:34px">
                    ${i.image ? '<img src="' + esc(i.image) + '" class="img-cover" style="border-radius:6px">' : icon("box", "ic ic-sm")}
                  </div>
                  <b class="fs-sm">${esc(i.name)}</b>
                </div>
              </td>
              <td class="num">${inr(i.price)}</td>
              <td class="num">${i.qty}</td>
              <td class="tr num fw-7">${inr(i.price * i.qty)}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>

    <div class="divider"></div>
    <div class="grid g-2">
      <div>
        <h4 class="mb-1">Account</h4>
        <p class="fs-sm text-muted mb-0">Cards for this order are in your account.<br>
        Signed in as <b>${esc(o.userEmail || o.userName || "")}</b><br>
        Phone: ${esc(o.userPhone || "")}</p>
      </div>
      <div>
        <h4 class="mb-1">Payment</h4>
        <p class="fs-sm text-muted mb-0">Method: <b>${esc((o.payment || "cod").toUpperCase())}</b><br>
        Status: ${statusBadge(PAY_STATUS, o.paymentStatus)}<br>
        Subtotal ${inr(o.subtotal)} &middot; Discount ${inr(o.discount)} &middot; Total ${inr(o.subtotal - o.discount)}</p>
      </div>
    </div>

    ${paid(o) ? revealPanel(o) : o.payStatus === "awaiting" ? pendingPanel(o) : ""}

    <div class="divider"></div>
    ${o.status === "cancelled"
      ? '<div class="alert alert-err"><span>!</span><div>This order was cancelled.</div></div>'
      : '<ul class="timeline">' + STEPS.map((s, i) => `
        <li class="${i <= step ? "done" : ""}">
          <b>${s.ic === "check" ? "" : icon(s.ic, "ic ic-sm")} ${esc(s.label)}</b>
          <small>${i <= step ? (i === step ? "Current status" : "Completed") : "Pending"}</small>
        </li>`).join("") + "</ul>"}

    ${o.note ? '<div class="alert alert-info mt-2"><span>' + icon("edit", "ic ic-sm") + "</span><div><b>Your note:</b> " + esc(o.note) + "</div></div>" : ""}

    <div class="card card-pad mt-3" style="background:var(--ink-50);text-align:center">
      <b class="fs-lg">${inr(o.total)}</b>
      <div class="fs-sm text-muted">Total amount</div>
    </div>`;

  $$("[data-cp]", $("#odBody")).forEach((b) => b.addEventListener("click", () => {
    navigator.clipboard?.writeText(b.dataset.cp);
    b.classList.add("copied-flash");
    toast("Copied to clipboard.", "ok");
  }));

  openModal("odModal");
}

async function reOrder(id) {
  const o = ALL.find((x) => x.id === id);
  if (!o) return;
  const { addToCart } = await import("../services/cart-service.js");
  let added = 0;
  let gone = 0;
  for (const it of o.items || []) {
    const p = await getProduct(it.id).catch(() => null);
    /* a product with no stock counted yet is not sold out — the same reading of
       the field that addToCart uses, so a re-order is not refused over a number
       the shop never typed */
    const counted = p && p.stock !== undefined && p.stock !== null && p.stock !== "";
    if (!p || (counted && Number(p.stock) <= 0)) { gone++; continue; }
    addToCart(p, it.qty);
    added++;
  }
  if (added) {
    toast(added + " item(s) were added to your cart." + (gone ? " " + gone + " no longer available." : ""), "ok");
    setTimeout(() => (location.href = pageUrl("pages/cart.html")), 900);
  } else toast(gone ? "Those products are no longer available." : "None of those products are in stock right now.", "warn");
}

async function cancelOrder(id) {
  const ok = await confirmBox({
    title: "Cancel this order?",
    text: "The order will be cancelled and the stock will be returned to inventory.",
    ok: "Yes, cancel it"
  });
  if (!ok) return;
  try {
    const o = ALL.find((x) => x.id === id);
    await setOrderStatus(id, "cancelled");
    await Promise.allSettled((o?.items || []).map((i) =>
      updateDoc(doc(db, COL.products, i.id), { stock: increment(i.qty), sold: increment(-i.qty) })));
    toast("Your order has been cancelled.", "ok");
    load();
  } catch (e) {
    console.error(e);
    toast("We could not cancel this order. Please contact support.", "err");
  }
}

async function load() {
  const zone = $("#zone");
  try {
    ALL = await getUserOrders(CURRENT.uid);
    /* fill in any missing card details from the product before the first paint,
       so an older order shows its card instead of the "not stored" notice */
    await repairOrders();
    paintTabs();
    paintSummary();
    render();
  } catch (e) {
    console.error(e);
    zone.innerHTML = '<div class="alert alert-err"><span>!</span><div>Your orders could not be loaded. Check your connection and sign in again.</div></div>';
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await requireLogin();
  await load();

  /* tabs are rebuilt on every load, so the listener is delegated from the
     strip's container and survives paintTabs() replacing the buttons */
  $(".tabs[data-ordtabs]")?.addEventListener("click", (e) => {
    const t = e.target.closest("[data-tab]");
    if (!t) return;
    TAB = t.dataset.tab;
    paintTabs();
    render();
  });

  /* search, debounced so typing does not re-filter on every keystroke */
  let t = null;
  $("#ordSearch")?.addEventListener("input", (e) => {
    QUERY = e.target.value;
    clearTimeout(t);
    t = setTimeout(render, 200);
  });

  $("#odPrint")?.addEventListener("click", () => window.print());
  $("#ordPrint2")?.addEventListener("click", () => window.print());
});
