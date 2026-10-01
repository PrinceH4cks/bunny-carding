import { auth } from "../core/firebase-config.js";
import { pageUrl } from "../core/app.js";

/* PANEL - js/orders.js */
import { $, $$, inr, esc, fmtDate, timeAgo, statusBadge, ORDER_STATUS, PAY_STATUS } from "../core/app.js";
import { toast } from "../components/toast.js";
import { skRows, emptyState } from "../components/ui.js";
import { openModal, closeModal, confirmBox } from "../components/modal.js";
import { getOrders, setOrderStatus, setPaymentStatus, deleteOrder } from "../services/order-service.js";
import { requireAdmin } from "../core/auth.js";
import { updateDoc, doc, increment } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db, COL } from "../core/db.js";
import { icon } from "../components/icons.js";

let ALL = [];
let filter = "";
let query = "";
let target = null;

const PER = 20;
let page = 1;

async function load() {
  try {
    ALL = await getOrders({ limitN: 500 });
    render();
    paintClear();
  } catch (e) {
    console.error(e);
    $("#rows").innerHTML = '<tr><td colspan="8"><div class="alert alert-err">' + icon("alert") +
      "<div><b>Could not load orders</b><br>" + esc(e.message || "Check your Firestore rules.") + "</div></div></td></tr>";
  }
}

function filtered() {
  let l = ALL.slice();
  if (filter) l = l.filter((o) => o.status === filter);
  if (query) {
    const v = query.toLowerCase();
    l = l.filter((o) => ((o.orderNo || "") + " " + (o.userName || "") + " " + (o.userEmail || "") + " " + (o.userPhone || "")).toLowerCase().includes(v));
  }
  return l;
}

const mini = (icName, label, val, bg, fg) =>
  '<div class="card card-pad"><div class="stat">' +
  '<div class="stat-ic" style="background:' + bg + ";color:" + fg + '">' + icon(icName) + "</div>" +
  '<div style="min-width:0"><div class="stat-v" style="font-size:1.3rem">' + val + "</div>" +
  "<div class='stat-l'>" + label + "</div></div></div></div>";

function render() {
  const revenue = ALL.filter((o) => o.status !== "cancelled").reduce((s, o) => s + Number(o.total || 0), 0);
  const pend = ALL.filter((o) => o.status === "pending").length;
  const done = ALL.filter((o) => o.status === "delivered").length;

  $("#mini").innerHTML =
    mini("box", "Total orders", ALL.length, "var(--brand-50)", "var(--brand-600)") +
    mini("wallet", "Revenue", inr(revenue), "var(--ok-50)", "var(--ok-600)") +
    mini("clock", "Pending", pend, "var(--warn-50)", "var(--accent-600)") +
    mini("gift", "Completed", done, "var(--ink-900)", "var(--accent-400)");

  const sp = $("#sidePend");
  if (sp) { sp.textContent = pend; sp.classList.toggle("hidden", !pend); }

  const list = filtered();
  const pages = Math.max(1, Math.ceil(list.length / PER));
  page = Math.min(page, pages);
  const slice = list.slice((page - 1) * PER, page * PER);

  $("#count").textContent = list.length + " order(s)";

  if (!slice.length) {
    $("#rows").innerHTML = '<tr><td colspan="8">' + emptyState({
      icon: query ? "search" : "box",
      title: query ? "No results for \"" + query + "\"" : "No orders yet",
      text: query ? "Try a different search term." : "New orders will appear here.",
      action: '<a class="btn btn-primary" href="' + pageUrl("pages/dashboard.html") + '">Go to dashboard</a>'
    }) + "</td></tr>";
    $("#pager").innerHTML = "";
    return;
  }

  $("#rows").innerHTML = slice.map((o) => `
    <tr data-id="${esc(o.id)}">
      <td><b class="fs-sm">${esc(o.orderNo || o.id.slice(-8).toUpperCase())}</b></td>
      <td>
        <div class="flex gap-2 center">
          <span class="avatar avatar-sm">${esc((o.userName || "U")[0].toUpperCase())}</span>
          <div style="min-width:0">
            <b class="fs-sm" style="display:block">${esc(o.userName || "Guest")}</b>
            <small class="text-muted">${esc(o.userEmail || "")}</small>
          </div>
        </div>
      </td>
      <td class="num">${o.itemCount}</td>
      <td class="num fw-7">${inr(o.total)}</td>
      <td>
        ${statusBadge(PAY_STATUS, o.paymentStatus)}
        <br><small class="text-muted">${esc((o.payment || "").toUpperCase())}</small>
      </td>
      <td>${statusBadge(ORDER_STATUS, o.status)}</td>
      <td class="fs-xs text-muted">${timeAgo(o.createdAt)}</td>
      <td>
        <div class="flex gap-1 justify-end">
          <button class="btn btn-ghost btn-xs js-view" data-id="${esc(o.id)}" title="View details">${icon("eye", "ic ic-sm")}</button>
          <button class="btn btn-primary btn-xs js-status" data-id="${esc(o.id)}" title="Update status">${icon("edit", "ic ic-sm")}</button>
          <button class="btn btn-danger btn-xs js-del" data-id="${esc(o.id)}" title="Delete">${icon("trash", "ic ic-sm")}</button>
        </div>
      </td>
    </tr>`).join("");

  $$(".js-view").forEach((b) => b.addEventListener("click", () => detail(b.dataset.id)));
  $$(".js-status").forEach((b) => b.addEventListener("click", () => openStatus(b.dataset.id)));
  $$(".js-del").forEach((b) => b.addEventListener("click", () => del(b.dataset.id)));

  $("#pager").innerHTML = pages > 1
    ? '<div class="pagination">' +
      '<button ' + (page === 1 ? "disabled" : "") + ' data-go="' + (page - 1) + '">Prev</button>' +
      '<span class="btn btn-ghost" style="pointer-events:none">Page ' + page + " of " + pages + "</span>" +
      '<button ' + (page === pages ? "disabled" : "") + ' data-go="' + (page + 1) + '">Next</button></div>'
    : "";
  $$("#pager [data-go]").forEach((b) => b.addEventListener("click", () => {
    page = Number(b.dataset.go);
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }));
}

function detail(id) {
  const o = ALL.find((x) => x.id === id);
  if (!o) return;
  target = o;

  $("#odBody").innerHTML = `
    <div class="flex between wrap gap-2 mb-2">
      <div>
        <b class="fs-lg">${esc(o.orderNo || o.id.slice(-8).toUpperCase())}</b>
        <div class="fs-sm text-muted">${fmtDate(o.createdAt)} &middot; ${timeAgo(o.createdAt)}</div>
      </div>
      <div class="flex gap-1">${statusBadge(ORDER_STATUS, o.status)}${statusBadge(PAY_STATUS, o.paymentStatus)}</div>
    </div>

    <div class="divider"></div>
    <h4 class="mb-1">Customer</h4>
    <div class="card card-pad" style="background:var(--ink-50)">
      <b>${esc(o.userName || "Guest")}</b>
      <div class="fs-sm text-muted">${esc(o.userEmail || "")}</div>
      <div class="fs-sm text-muted">Phone: ${esc(o.userPhone || o.address?.phone || "—")}</div>
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
        <h4 class="mb-1">Customer</h4>
        <p class="fs-sm text-muted mb-0">${esc(o.userName || "")}<br>
        ${esc(o.userEmail || "")}<br>
        Phone: ${esc(o.userPhone || "")}</p>
      </div>
      <div>
        <h4 class="mb-1">Payment</h4>
        <p class="fs-sm text-muted mb-0">Method: <b>${esc((o.payment || "").toUpperCase())}</b><br>
        Subtotal ${inr(o.subtotal)} &middot; Discount ${inr(o.discount)}<br>
        Coupon: <b>${esc(o.coupon || "none")}</b></p>
      </div>
    </div>

    ${o.note ? '<div class="alert alert-info mt-2">' + icon("edit", "ic ic-sm") + "<div><b>Customer note:</b> " + esc(o.note) + "</div></div>" : ""}

    <div class="card card-pad mt-3" style="background:var(--grad-brand);color:#fff;border:0">
      <div class="flex between center">
        <span>Total amount</span><b class="fs-lg">${inr(o.total)}</b>
      </div>
    </div>

    <div class="flex gap-2 mt-3 wrap">
      ${["pending", "confirmed"].includes(o.status)
        ? '<button class="btn btn-ok btn-sm" data-quick="ready">' + icon("gift", "ic ic-sm") + " Mark cards ready</button>" : ""}
      ${o.status === "ready"
        ? '<button class="btn btn-ok btn-sm" data-quick="delivered">' + icon("check", "ic ic-sm") + " Mark as completed</button>" : ""}
      ${o.paymentStatus === "unpaid" && o.status !== "cancelled"
        ? '<button class="btn btn-primary btn-sm" data-paid="1">' + icon("wallet", "ic ic-sm") + " Mark as paid</button>" : ""}
    </div>`;

  $$("[data-quick]", $("#odBody")).forEach((b) => b.addEventListener("click", () => quick(b.dataset.quick)));
  $$("[data-paid]", $("#odBody")).forEach((b) => b.addEventListener("click", quickPaid));

  openModal("odModal");
}

async function quick(status) {
  if (!target) return;
  try {
    await setOrderStatus(target.id, status);
    toast("Status updated to " + status + ".", "ok");
    closeModal("odModal");
    await load();
  } catch (e) { console.error(e); toast("Could not update the order.", "err"); }
}

async function quickPaid() {
  if (!target) return;
  try {
    await setPaymentStatus(target.id, "paid");
    toast("Payment marked as received.", "ok");
    closeModal("odModal");
    await load();
  } catch (e) { console.error(e); toast("Could not update the payment.", "err"); }
}

function openStatus(id) {
  const o = ALL.find((x) => x.id === id);
  if (!o) return;
  target = o;
  $("#stOrder").innerHTML = "<b>" + esc(o.orderNo || id.slice(-8).toUpperCase()) + "</b> &mdash; " + esc(o.userName || "");
  $("#stSelect").value = o.status;
  $("#paySelect").value = o.paymentStatus || "unpaid";
  openModal("stModal");
}

async function del(id) {
  const o = ALL.find((x) => x.id === id);
  const ok = await confirmBox({
    title: "Delete this order?",
    text: (o?.orderNo || id) + " will be removed permanently. Stock will not be returned.",
    ok: "Yes, delete it"
  });
  if (!ok) return;
  try {
    await deleteOrder(id);
    toast("Order deleted.", "ok");
    await load();
  } catch (e) { console.error(e); toast("Could not delete the order.", "err"); }
}

/* Canceled orders one at a time is one dialog per row. The same question as with
   the payment requests: a row nobody will act on again is not a record, it is
   something to scroll past. Only `cancelled` is taken — an order that is open,
   paid, packed or delivered is a live thing, and a rule that guessed at "old"
   by date would one day throw away an order the customer is waiting for.

   The card numbers and PINs inside a canceled order go with it. That is the
   point: nothing is served from these rows, and card details are the last thing
   to leave a database. */
async function clearCancelled() {
  const gone = ALL.filter((o) => o.status === "cancelled");
  if (!gone.length) { toast("No cancelled orders to clear.", "info"); return; }
  const ok = await confirmBox({
    title: "Delete " + gone.length + " cancelled order" + (gone.length === 1 ? "?" : "s?"),
    text: "Their rows are removed permanently, including the card numbers and PINs stored in them. " +
      "Any live order is left alone.",
    ok: "Delete them"
  });
  if (!ok) return;
  const btn = $("#clearCancelled");
  try {
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>'; }
    for (const o of gone) await deleteOrder(o.id);
    toast(gone.length + " order" + (gone.length === 1 ? "" : "s") + " removed.", "ok");
    await load();
  } catch (e) {
    console.error(e);
    toast("Could not remove those orders.", "err");
    if (btn) { btn.disabled = false; btn.innerHTML = icon("trash", "ic ic-sm") + " Clear cancelled"; }
  }
}

/* keeps the button's count honest after every reload and every filter change */
function paintClear() {
  const btn = $("#clearCancelled");
  if (!btn) return;
  const n = ALL.filter((o) => o.status === "cancelled").length;
  btn.hidden = !n;
  btn.innerHTML = icon("trash", "ic ic-sm") + " Clear " + n + " cancelled";
}

function bind() {
  let t;
  $("#q").addEventListener("input", (e) => {
    clearTimeout(t);
    t = setTimeout(() => { query = e.target.value.trim(); page = 1; render(); }, 240);
  });

  $("#refresh").addEventListener("click", async () => {
    $("#refresh").innerHTML = '<span class="spinner"></span>';
    await load();
    $("#refresh").innerHTML = icon("refresh");
    toast("Orders refreshed.", "ok");
  });

  $("#clearCancelled")?.addEventListener("click", clearCancelled);

  $("#chips").addEventListener("click", (e) => {
    const c = e.target.closest(".chip");
    if (!c) return;
    filter = c.dataset.f;
    page = 1;
    syncChips();
    render();
  });

  $("#stSave").addEventListener("click", async () => {
    const s = $("#stSelect").value, p = $("#paySelect").value;
    try {
      if (s === "cancelled" && target.status !== "cancelled") {
        const sure = await confirmBox({
          title: "Cancel this order?",
          text: "The stock will be returned to inventory.",
          ok: "Yes, cancel it"
        });
        if (!sure) return;
        await setOrderStatus(target.id, s);
        await Promise.allSettled((target.items || []).map((i) =>
          updateDoc(doc(db, COL.products, i.id), { stock: increment(i.qty), sold: increment(-i.qty) })));
      } else {
        await setOrderStatus(target.id, s);
      }
      await setPaymentStatus(target.id, p);
      toast("Order updated.", "ok");
      closeModal("stModal");
      await load();
    } catch (e) { console.error(e); toast("Could not update the order.", "err"); }
  });

  $("#odPrint").addEventListener("click", () => window.print());
}

const syncChips = () => $$("#chips .chip").forEach((c) => c.classList.toggle("active", (c.dataset.f || "") === filter));

document.addEventListener("DOMContentLoaded", async () => {
await requireAdmin();

  const p = new URLSearchParams(location.search);
  if (p.get("status")) { filter = p.get("status"); syncChips(); }

  $("#rows").innerHTML = skRows(8, 8);
  await load();
  bind();
});
