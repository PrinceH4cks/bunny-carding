import { auth } from "../core/firebase-config.js";
import { db } from "../core/db.js";

/* PANEL - js/index.js  (dashboard) */
import { $, inr, esc, timeAgo, statusBadge, ORDER_STATUS, PAY_STATUS } from "../core/app.js";
import { emptyState } from "../components/ui.js";
import { toast } from "../components/toast.js";
import { getStats } from "../services/order-service.js";
import { requireAdmin } from "../core/auth.js";
import { icon } from "../components/icons.js";

function kpi(icName, label, value, bg, fg, sub) {
  return '<div class="card card-pad"><div class="stat">' +
    '<div class="stat-ic" style="background:' + bg + ";color:" + fg + '">' + icon(icName) + "</div>" +
    '<div style="min-width:0"><div class="stat-v">' + value + "</div>" +
    "<div class='stat-l'>" + label + "</div></div></div>" +
    '<div class="fs-xs text-muted mt-2">' + sub + "</div></div>";
}

function alertBox(icName, label, n, tone, link) {
  const cls = { ok: "alert-ok", warn: "alert-warn", err: "alert-err" }[tone];
  return '<a href="' + link + '" class="alert ' + cls + '" style="text-decoration:none">' +
    '<span style="font-size:1.2rem">' + icon(icName) + "</span>" +
    '<div style="flex:1"><b>' + n + " " + label + "</b>" +
    "<small style='display:block;opacity:.8'>Click to review &rarr;</small></div></a>";
}

function drawChart(data, total) {
  const max = Math.max(...data.map((d) => d.value), 1);
  $("#chartTotal").textContent = inr(total);
  $("#chart").innerHTML = data.map((d) => {
    const h = Math.max(6, Math.round((d.value / max) * 165));
    return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:8px;height:100%;justify-content:flex-end">' +
      '<b class="fs-xs tnum" style="color:' + (d.value ? "var(--ink-700)" : "var(--ink-400)") + '">' +
        (d.value ? inr(d.value) : "—") + "</b>" +
      '<div title="' + d.label + ": " + inr(d.value) + '" style="width:100%;height:' + h + "px;border-radius:8px 8px 3px 3px;background:" +
        (d.value ? "linear-gradient(180deg,#818cf8,#4f46e5)" : "var(--ink-200)") +
        ';transition:height .6s cubic-bezier(.4,0,.2,1)"></div>' +
      '<small class="fs-xs text-muted">' + esc(d.label) + "</small></div>";
  }).join("");
}

async function load() {
  let s;
  try {
    s = await getStats();
  } catch (e) {
    console.error(e);
    $("#kpis").innerHTML = '<div class="card card-pad" style="grid-column:1/-1">' +
      '<div class="alert alert-err">' + icon("alert") + "<div><b>Could not load data</b><br>" +
      esc(e.message || "Check your Firestore rules and connection.") + "</div></div></div>";
    return;
  }

  $("#sub").textContent = "Today is " + new Date().toLocaleDateString("en-IN",
    { day: "numeric", month: "long", year: "numeric" }) + " &middot; everything is live";

  $("#kpis").innerHTML =
    kpi("wallet", "Total revenue", inr(s.revenue), "var(--brand-50)", "var(--brand-600)", "Average order " + inr(s.avgOrder)) +
    kpi("box", "Total orders", s.orders, "var(--warn-50)", "var(--accent-600)", s.pending + " pending") +
    kpi("users", "Registered users", s.users, "var(--ok-50)", "var(--ok-600)", "All members") +
    kpi("cart", "Live products", s.products, "var(--ink-900)", "var(--accent-400)", s.lowStock + " low on stock");

  $("#alerts").innerHTML =
    alertBox("clock", "pending orders", s.pending, s.pending > 0 ? "warn" : "ok", "../../pages/orders.html?status=pending") +
    alertBox("trending-down", "low on stock", s.lowStock, s.lowStock > 0 ? "warn" : "ok", "../../pages/products.html?stock=low") +
    alertBox("ban", "out of stock", s.outStock, s.outStock > 0 ? "err" : "ok", "../../pages/products.html?stock=out");

  const sp = $("#sidePend");
  if (sp) { sp.textContent = s.pending; sp.classList.toggle("hidden", !s.pending); }
  const ss = $("#sideStock");
  if (ss) { ss.textContent = s.lowStock + s.outStock; ss.classList.toggle("hidden", !(s.lowStock + s.outStock)); }

  drawChart(s.chart, s.revenue);

  $("#topProd").innerHTML = s.topProducts.length
    ? s.topProducts.map((p, i) => `
      <div class="flex between center" style="padding:10px 0;border-bottom:1px dashed var(--ink-200)">
        <div class="flex gap-2 center" style="min-width:0">
          <span class="avatar avatar-sm" style="background:${i === 0 ? "var(--grad-brand)" : "var(--ink-100)"};color:${i === 0 ? "#fff" : "var(--ink-600)"}">${i + 1}</span>
          <div style="min-width:0">
            <b class="fs-sm truncate" style="display:block;max-width:180px">${esc(p.name)}</b>
            <small class="text-muted">${p.sold || 0} sold &middot; ${p.stock} in stock</small>
          </div>
        </div>
        <b class="fs-sm">${inr(p.price)}</b>
      </div>`).join("")
    : '<p class="text-muted mb-0">No products yet.</p>';

  $("#recent").innerHTML = s.recent.length
    ? s.recent.map((o) => `
      <tr>
        <td><a href="../../pages/orders.html" class="fw-7">${esc(o.orderNo)}</a></td>
        <td>
          <div class="flex gap-2 center">
            <span class="avatar avatar-sm">${esc((o.userName || "U")[0].toUpperCase())}</span>
            <div>
              <b class="fs-sm" style="display:block">${esc(o.userName || "Guest")}</b>
              <small class="text-muted">${esc(o.userEmail || "")}</small>
            </div>
          </div>
        </td>
        <td class="num">${o.itemCount}</td>
        <td class="num fw-7">${inr(o.total)}</td>
        <td>${statusBadge(PAY_STATUS, o.paymentStatus)}</td>
        <td>${statusBadge(ORDER_STATUS, o.status)}</td>
        <td class="fs-xs text-muted">${timeAgo(o.createdAt)}</td>
      </tr>`).join("")
    : '<tr><td colspan="7">' + emptyState({
        icon: "box", title: "No orders yet",
        text: "Your first order will appear here as soon as it comes in."
      }) + "</td></tr>";
}

document.addEventListener("DOMContentLoaded", async () => {
await requireAdmin();
  await load();

  $("#refresh").addEventListener("click", async () => {
    const b = $("#refresh");
    b.innerHTML = '<span class="spinner"></span>';
    await load();
    b.innerHTML = icon("refresh") + " Refresh";
    toast("Data refreshed.", "ok");
  });

  setInterval(() => { if (!document.hidden) load(true); }, 60000);
});
