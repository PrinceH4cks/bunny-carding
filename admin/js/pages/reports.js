import { auth } from "../core/firebase-config.js";
import { db } from "../core/db.js";
import { totals } from "../services/cart-service.js";

/* =========================================================
   /reports.js
   Store totals plus CSV export.

   The CSV is generated in the browser from the same records the page already
   shows, so what you download is exactly what you can see. Anything that starts
   with = + - @ is prefixed with a quote, otherwise a spreadsheet would treat
   that cell as a formula.
   ========================================================= */

import { $, $$, esc, inr, fmtDate } from "../core/app.js";
import { toast } from "../components/toast.js";
import { emptyState, skRows } from "../components/ui.js";
import { getStats, getOrders } from "../services/order-service.js";
import { getProducts } from "../services/product-service.js";
import { getAllUsers } from "../services/user-service.js";
import { requireAdmin } from "../core/auth.js";
import { icon } from "../components/icons.js";
import { ORDER_STATUS, statusBadge } from "../core/app.js";

let stats = null;
let orders = [];
let products = [];
let users = [];
let days = 0;   /* 0 = all time */

/* ---------- the date an order was placed, in ms ---------- */
const when = (o) => (o.createdAt && typeof o.createdAt.toDate === "function" ? o.createdAt.toDate().getTime() : 0);

function inWindow(o) {
  if (!days) return true;
  const t = when(o);
  return t ? t >= Date.now() - days * 864e5 : false;
}

/* ---------- CSV ---------- */
const cell = (v) => {
  let s = v === null || v === undefined ? "" : String(v);
  /* neutralise spreadsheet formula injection */
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
};

function download(name, rows) {
  const csv = rows.map((r) => r.map(cell).join(",")).join("\r\n");
  const blob = new Blob(["ï»¿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportCsv(kind) {
  const stamp = new Date().toISOString().slice(0, 10);
  if (kind === "orders") {
    const rows = [["Order no", "Date", "Customer", "Email", "Items", "Total", "Status", "Payment"]];
    orders.filter(inWindow).forEach((o) => rows.push([
      o.no || o.id, fmtDate(o.createdAt, true), o.name || "", o.email || "",
      (o.items || []).length, Number(o.total || 0), o.status || "", o.paymentStatus || o.payStatus || ""
    ]));
    if (rows.length === 1) return toast("No orders in this range.", "warn");
    download(`bunny-orders-${stamp}.csv`, rows);
  } else if (kind === "products") {
    const rows = [["Name", "Brand", "Category", "Price", "MRP", "Stock", "Sold", "Active"]];
    products.forEach((p) => rows.push([
      p.name || "", p.brand || "", p.category || "",
      Number(p.price || 0), Number(p.mrp || 0), Number(p.stock || 0), Number(p.sold || 0),
      p.active === false ? "no" : "yes"
    ]));
    if (!products.length) return toast("No products to export.", "warn");
    download(`bunny-products-${stamp}.csv`, rows);
  } else if (kind === "users") {
    const rows = [["Name", "Email", "Phone", "Orders", "Spent", "Joined", "Active"]];
    users.forEach((u) => rows.push([
      u.name || "", u.email || "", u.phone || "",
      Number(u.orders || 0), Number(u.spent || 0), fmtDate(u.createdAt), u.active === false ? "no" : "yes"
    ]));
    if (!users.length) return toast("No users to export.", "warn");
    download(`bunny-users-${stamp}.csv`, rows);
  }
  toast("CSV downloaded.", "ok");
}

/* ---------- rendering ---------- */
function paintKpis() {
  const scoped = orders.filter(inWindow);
  const revenue = scoped.filter((o) => o.status !== "cancelled").reduce((s, o) => s + Number(o.total || 0), 0);
  const units = scoped.reduce((s, o) => s + (o.items || []).length, 0);
  const kpis = [
    { l: "Revenue", v: inr(revenue), i: "wallet" },
    { l: "Orders", v: scoped.length, i: "layers" },
    { l: "Items sold", v: units, i: "box" },
    { l: "Average order", v: inr(scoped.length ? Math.round(revenue / scoped.length) : 0), i: "chart" }
  ];
  $("#kpis").innerHTML = kpis.map((k) =>
    '<div class="card card-pad flex gap-2 center">' +
      '<span class="stat-ic">' + icon(k.i) + "</span>" +
      '<div style="min-width:0"><div class="fs-xs text-muted">' + k.l + "</div><b class='fs-lg'>" + esc(k.v) + "</b></div>" +
    "</div>"
  ).join("");
}

function paintTrend() {
  const box = $("#trend");
  const scoped = orders.filter(inWindow).filter((o) => o.status !== "cancelled");

  /* bucket by day for short ranges, by month for long ones */
  const buckets = new Map();
  scoped.forEach((o) => {
    const d = new Date(when(o));
    if (isNaN(d)) return;
    const key = days && days <= 90
      ? d.toDateString()
      : d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    buckets.set(key, (buckets.get(key) || 0) + Number(o.total || 0));
  });

  if (!buckets.size) {
    box.innerHTML = emptyState({ icon: "chart", title: "No revenue in this range", text: "Widen the range or check back once orders start coming in." });
    return;
  }

  const rows = [...buckets.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-14);
  const max = Math.max(...rows.map((r) => r[1]), 1);

  box.innerHTML = rows.map(([k, v]) => {
    const label = /^\d{4}-\d{2}$/.test(k)
      ? new Date(k + "-01").toLocaleDateString("en-IN", { month: "short", year: "2-digit" })
      : new Date(k).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    const pct = Math.max(2, Math.round((v / max) * 100));
    return '<div class="flex gap-2 center mb-2">' +
      '<span class="fs-xs text-muted" style="width:74px;flex:0 0 auto">' + esc(label) + "</span>" +
      '<span style="flex:1 1 auto;height:10px;border-radius:99px;background:var(--ink-100);overflow:hidden">' +
        '<span style="display:block;height:100%;width:' + pct + "%;background:var(--grad-brand);border-radius:99px\"></span>" +
      "</span>" +
      '<b class="fs-xs" style="width:76px;flex:0 0 auto;text-align:right;font-family:var(--ff-mono)">' + esc(inr(v)) + "</b>" +
    "</div>";
  }).join("");
}

function paintStatus() {
  const scoped = orders.filter(inWindow);
  const box = $("#byStatus");
  if (!scoped.length) {
    box.innerHTML = emptyState({ icon: "layers", title: "No orders in this range" });
    return;
  }
  const counts = {};
  scoped.forEach((o) => { const k = o.status || "pending"; counts[k] = (counts[k] || 0) + 1; });
  const max = Math.max(...Object.values(counts), 1);
  box.innerHTML = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, n]) =>
    '<div class="flex gap-2 center mb-2">' +
      '<span style="width:96px;flex:0 0 auto">' + statusBadge(ORDER_STATUS, k) + "</span>" +
      '<span style="flex:1 1 auto;height:10px;border-radius:99px;background:var(--ink-100);overflow:hidden">' +
        '<span style="display:block;height:100%;width:' + Math.max(3, Math.round((n / max) * 100)) + "%;background:var(--grad-mint);border-radius:99px\"></span>" +
      "</span>" +
      '<b class="fs-xs" style="width:34px;flex:0 0 auto;text-align:right">' + n + "</b>" +
    "</div>"
  ).join("");
}

function paintTop() {
  const box = $("#topProducts");
  const top = [...products].sort((a, b) => (Number(b.sold || 0) - Number(a.sold || 0)) || (Number(b.stock || 0) - Number(a.stock || 0))).slice(0, 6);
  if (!top.length || !top.some((p) => Number(p.sold || 0) > 0)) {
    box.innerHTML = emptyState({ icon: "box", title: "No sales recorded yet", text: "Products rank here once they have been sold." });
    return;
  }
  const max = Math.max(...top.map((p) => Number(p.sold || 0)), 1);
  box.innerHTML = top.map((p) =>
    '<div class="flex gap-2 center mb-2">' +
      '<span class="fs-sm" style="flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(p.name || "Untitled") + "</span>" +
      '<span style="width:96px;flex:0 0 auto;height:10px;border-radius:99px;background:var(--ink-100);overflow:hidden">' +
        '<span style="display:block;height:100%;width:' + Math.max(3, Math.round((Number(p.sold || 0) / max) * 100)) + "%;background:var(--grad-gold);border-radius:99px\"></span>" +
      "</span>" +
      '<b class="fs-xs" style="width:30px;flex:0 0 auto;text-align:right">' + (Number(p.sold || 0)) + "</b>" +
    "</div>"
  ).join("");
}

function paintLow() {
  const box = $("#lowStock");
  const low = products.filter((p) => Number(p.stock || 0) <= 10)
    .sort((a, b) => Number(a.stock || 0) - Number(b.stock || 0)).slice(0, 8);
  if (!low.length) {
    box.innerHTML = emptyState({ icon: "check", title: "Stock levels are healthy", text: "Nothing is at or below ten units." });
    return;
  }
  box.innerHTML = low.map((p) => {
    const s = Number(p.stock || 0);
    const cls = s <= 0 ? "badge-danger" : "badge-warn";
    return '<div class="flex between center gap-2" style="padding:8px 0;border-bottom:1px solid var(--border-2)">' +
      '<span class="fs-sm" style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(p.name || "Untitled") + "</span>" +
      '<span class="badge ' + cls + '" style="flex:0 0 auto">' + (s <= 0 ? "Out of stock" : s + " left") + "</span>" +
    "</div>";
  }).join("");
}

async function load() {
  $("#trend").innerHTML = skRows(4, 6);
  $("#byStatus").innerHTML = skRows(3, 5);
  $("#topProducts").innerHTML = skRows(4, 5);
  $("#lowStock").innerHTML = skRows(3, 5);

  [stats, orders, products, users] = await Promise.all([
    getStats(), getOrders({ limitN: 500 }), getProducts({ onlyActive: false, limitN: 500 }), getAllUsers()
  ]);

  paintKpis(); paintTrend(); paintStatus(); paintTop(); paintLow();
}

document.addEventListener("DOMContentLoaded", async () => {
await requireAdmin();

  $("#reloadBtn").addEventListener("click", load);
  $("#range").addEventListener("change", (e) => {
    days = Number(e.target.value) || 0;
    load();
  });
  $$("[data-csv]").forEach((b) => b.addEventListener("click", () => exportCsv(b.dataset.csv)));

  await load();
});
