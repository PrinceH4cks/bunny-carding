import { field } from "../core/app.js";
import { auth } from "../core/firebase-config.js";
import { db } from "../core/db.js";

/* PANEL - js/payments.js
   Gateway settings, wallet deposit approvals, order payment verification. */
import { $, $$, inr, esc, fmtDate, timeAgo, setError, formData } from "../core/app.js";
import { toast } from "../components/toast.js";
import { skRows, emptyState } from "../components/ui.js";
import { confirmBox } from "../components/modal.js";
import { getDeposits, approveDeposit, rejectDeposit } from "../services/user-service.js";
import { getOrders, approveOrderPayment, rejectOrderPayment } from "../services/order-service.js";
import { getPaymentSettings, savePaymentSettings, DEFAULT_PAYMENT } from "../services/payment-service.js";
import { requireAdmin } from "../core/auth.js";
import { icon } from "../components/icons.js";
import { METHODS, methodByKey, validateMethod } from "../services/payment-service.js";

let DEPS = [];
let ORDS = [];
let depFilter = "";
let cfg = { ...DEFAULT_PAYMENT };

const DEP_STATUS = {
  pending:   { label: "Created",   cls: "badge-warn"   },
  submitted: { label: "Awaiting",  cls: "badge-info"   },
  approved:  { label: "Approved",  cls: "badge-ok"     },
  rejected:  { label: "Rejected",  cls: "badge-danger" }
};
const PAY_STATUS = {
  awaiting:  { label: "Awaiting",  cls: "badge-warn"   },
  submitted: { label: "Submitted", cls: "badge-info"   },
  paid:      { label: "Paid",      cls: "badge-ok"     },
  failed:    { label: "Failed",    cls: "badge-danger" },
  none:      { label: "No payment needed", cls: "badge-dark" }
};

const badge = (map, key) => {
  const s = map[key] || { label: key || "—", cls: "badge-dark" };
  return '<span class="badge ' + s.cls + ' badge-dot">' + esc(s.label) + "</span>";
};

const mini = (icName, label, val, bg, fg) =>
  '<div class="card card-pad"><div class="stat">' +
  '<div class="stat-ic" style="background:' + bg + ";color:" + fg + '">' + icon(icName) + "</div>" +
  '<div style="min-width:0"><div class="stat-v" style="font-size:1.3rem">' + val + "</div>" +
  "<div class='stat-l'>" + label + "</div></div></div></div>";

/* ---------- load ---------- */
async function load() {
  try {
    [DEPS, ORDS, cfg] = await Promise.all([
      getDeposits({ limitN: 200 }),
      getOrders({ limitN: 200 }),
      getPaymentSettings()
    ]);
    paint();
    paintMethods();
  } catch (e) {
    console.error(e);
    $("#depRows").innerHTML = '<tr><td colspan="7"><div class="alert alert-err">' + icon("alert") +
      "<div><b>Could not load payments</b><br>" + esc(e.message || "Check your Firestore rules.") + "</div></div></td></tr>";
  }
}

function paint() {
  const awaiting = DEPS.filter((d) => d.status === "submitted").length;
  const approved = DEPS.filter((d) => d.status === "approved");
  const paidOrders = ORDS.filter((o) => o.payStatus === "paid");
  const ordAwait = ORDS.filter((o) => o.payStatus === "submitted").length;

  $("#mini").innerHTML =
    mini("hourglass", "Deposits awaiting", DEPS.filter((d) => d.status === "submitted").length, "var(--warn-50)", "var(--warn-600)") +
    mini("coins", "Wallet credited", inr(approved.reduce((s, d) => s + Number(d.amount || 0), 0)), "var(--ok-50)", "var(--ok-600)") +
    mini("box", "Orders to verify", ordAwait, "var(--brand-50)", "var(--brand-600)") +
    mini("banknote", "Paid orders", paidOrders.length, "var(--ink-900)", "var(--gold-400)");

  const sd = $("#sideDep");
  if (sd) { sd.textContent = awaiting + ordAwait; sd.classList.toggle("hidden", !(awaiting + ordAwait)); }

  renderDeposits();
  renderOrders();
}

function renderDeposits() {
  const list = depFilter ? DEPS.filter((d) => d.status === depFilter) : DEPS;
  const rows = $("#depRows");

  if (!list.length) {
    rows.innerHTML = '<tr><td colspan="7">' + emptyState({
      icon: "coins", title: "No deposit requests",
      text: "Requests appear here as soon as a customer adds money to their wallet."
    }) + "</td></tr>";
    return;
  }

  rows.innerHTML = list.map((d) => {
    const m = methodByKey(d.method);
    const ref = d.hash || d.utr || "";
    return `
    <tr>
      <td>
        <div class="flex gap-2 center">
          <span class="avatar avatar-sm">${esc((d.userName || "U")[0].toUpperCase())}</span>
          <div style="min-width:0">
            <b class="fs-sm" style="display:block">${esc(d.userName || "Guest")}</b>
            <small class="text-muted">${esc(d.userEmail || "")}</small>
          </div>
        </div>
      </td>
      <td>
        <span class="fs-xs" style="display:inline-flex;align-items:center;gap:5px">
          ${icon(m ? m.icon : "coins", "ic ic-sm")} ${esc(d.methodLabel || (m ? m.title : "UPI"))}
        </span>
        ${d.autoApproved ? '<small class="text-muted" style="display:block">auto</small>' : ""}
      </td>
      <td class="num fw-7">${inr(d.amount)}</td>
      <td class="mono fs-xs" title="${esc(ref)}">${esc(ref ? (ref.length > 18 ? ref.slice(0, 10) + "…" + ref.slice(-6) : ref) : "—")}</td>
      <td>${badge(DEP_STATUS, d.status)}</td>
      <td class="fs-xs text-muted">${timeAgo(d.createdAt)}</td>
      <td>
        <div class="flex gap-1 justify-end">
          ${d.status === "submitted" ? `
            <button class="btn btn-ok btn-xs js-dep-ok" data-id="${esc(d.id)}" data-amt="${d.amount}" title="Approve and credit wallet">${icon("check", "ic ic-sm")} Approve</button>
            <button class="btn btn-danger btn-xs js-dep-no" data-id="${esc(d.id)}" title="Reject">${icon("x", "ic ic-sm")}</button>
          ` : `<span class="fs-xs text-muted">${d.status === "approved" ? fmtDate(d.updatedAt, false) : "—"}</span>`}
        </div>
      </td>
    </tr>`;
  }).join("");

  $$(".js-dep-ok").forEach((b) => b.addEventListener("click", () => okDeposit(b.dataset.id, Number(b.dataset.amt))));
  $$(".js-dep-no").forEach((b) => b.addEventListener("click", () => noDeposit(b.dataset.id)));
}

function renderOrders() {
  const list = ORDS.filter((o) => o.payStatus && o.payStatus !== "none");
  const rows = $("#ordRows");

  if (!list.length) {
    rows.innerHTML = '<tr><td colspan="7">' + emptyState({
      icon: "box", title: "No card orders with payments yet",
      text: "Card orders appear here once a customer goes through the QR payment step."
    }) + "</td></tr>";
    return;
  }

  rows.innerHTML = list.slice(0, 120).map((o) => `
    <tr>
      <td><a href="../../pages/orders.html" class="fw-7">${esc(o.orderNo || o.id.slice(-8).toUpperCase())}</a></td>
      <td>
        <div class="flex gap-2 center">
          <span class="avatar avatar-sm">${esc((o.userName || "U")[0].toUpperCase())}</span>
          <div style="min-width:0">
            <b class="fs-sm" style="display:block">${esc(o.userName || "Guest")}</b>
            <small class="text-muted">${esc(o.userEmail || "")}</small>
          </div>
        </div>
      </td>
      <td class="num fw-7">${inr(o.payAmount || o.total)}</td>
      <td class="mono fs-xs">${esc(o.utr || "—")}</td>
      <td>${badge(PAY_STATUS, o.payStatus)}</td>
      <td><span class="badge badge-brand">${esc(o.status)}</span></td>
      <td>
        <div class="flex gap-1 justify-end">
          ${o.payStatus === "submitted" ? `
            <button class="btn btn-ok btn-xs js-ord-ok" data-id="${esc(o.id)}" title="Mark payment received">${icon("check", "ic ic-sm")} Verify</button>
            <button class="btn btn-danger btn-xs js-ord-no" data-id="${esc(o.id)}" title="Reject">${icon("x", "ic ic-sm")}</button>
          ` : `<span class="fs-xs text-muted">${o.payStatus === "paid" ? fmtDate(o.updatedAt, false) : "—"}</span>`}
        </div>
      </td>
    </tr>`).join("");

  $$(".js-ord-ok").forEach((b) => b.addEventListener("click", () => okOrder(b.dataset.id)));
  $$(".js-ord-no").forEach((b) => b.addEventListener("click", () => noOrder(b.dataset.id)));
}

/* ---------- actions ---------- */
async function okDeposit(id, amount) {
  const d = DEPS.find((x) => x.id === id);
  const ok = await confirmBox({
    title: "Approve this deposit?",
    text: "The wallet of " + (d?.userName || d?.userEmail || "this customer") + " will be credited " + inr(amount) + ".",
    ok: "Yes, credit the wallet", danger: false
  });
  if (!ok) return;
  try {
    await approveDeposit(id, d.userId, amount);
    toast("Wallet credited " + inr(amount) + ".", "ok");
    await load();
  } catch (e) { console.error(e); toast("Could not credit the wallet.", "err"); }
}

async function noDeposit(id) {
  const ok = await confirmBox({ title: "Reject this deposit?", text: "The request will be marked as rejected.", ok: "Yes, reject" });
  if (!ok) return;
  try {
    await rejectDeposit(id);
    toast("Deposit rejected.", "info");
    await load();
  } catch (e) { console.error(e); toast("Could not reject the deposit.", "err"); }
}

async function okOrder(id) {
  const ok = await confirmBox({
    title: "Verify this payment?",
    text: "The order will be marked as paid and the card details will be released to the customer.",
    ok: "Yes, mark as paid", danger: false
  });
  if (!ok) return;
  try {
    await approveOrderPayment(id);
    toast("Payment verified.", "ok");
    await load();
  } catch (e) { console.error(e); toast("Could not update the order.", "err"); }
}

async function noOrder(id) {
  const ok = await confirmBox({ title: "Reject this payment?", text: "The customer will be asked to pay again.", ok: "Yes, reject" });
  if (!ok) return;
  try {
    await rejectOrderPayment(id);
    toast("Payment rejected.", "info");
    await load();
  } catch (e) { console.error(e); toast("Could not update the order.", "err"); }
}

/* ---------- the three deposit methods ----------
   The cards are built from METHODS in js/deposits.js, the same list the
   customer's "Add money" popup is built from, so the two can never describe a
   method differently. Nothing about a method is written twice. */
function paintMethods() {
  const box = $("#gwMethods");
  if (!box) return;
  const saved = (cfg && cfg.methods) || {};

  box.innerHTML = METHODS.map((m) => {
    const c = saved[m.key] || {};
    const fields = m.fields.map((f) => {
      const name = "m_" + m.key + "_" + f.name;
      const v = c[f.name] ?? (f.type === "select" ? (f.options?.[0]?.[0] ?? "") : "");
      let input;
      if (f.type === "area") {
        input = '<textarea class="textarea" id="' + name + '" name="' + name + '" rows="2">' + esc(v || "") + "</textarea>";
      } else if (f.type === "select") {
        input = '<select class="select" id="' + name + '" name="' + name + '">' +
          f.options.map(([ov, ol]) =>
            '<option value="' + esc(ov) + '"' + (String(v) === String(ov) ? " selected" : "") + ">" + esc(ol) + "</option>").join("") +
          "</select>";
      } else {
        const type = f.type === "number" ? "number" : f.type === "secret" ? "password" : f.type === "url" ? "url" : "text";
        const extra = [];
        if (f.type === "number") { extra.push('min="' + (f.min ?? 0) + '"'); if (f.max != null) extra.push('max="' + f.max + '"'); }
        input = '<input class="input' + (f.mono ? " mono" : "") + '" id="' + name + '" name="' + name +
          '" type="' + type + '" value="' + esc(v) + '"' + (extra.length ? " " + extra.join(" ") : "") + ">";
      }
      return '<div class="field">' +
        "<label>" + esc(f.label) + (f.required ? ' <span class="req">*</span>' : "") + "</label>" +
        input +
    '<div class="field-error"></div></div>';
    }).join("");

    const on = !!c.on;
    return '<div class="card card-pad gw-method" data-key="' + m.key + '"' + (on ? "" : ' data-off="1"') + ">" +
      '<div class="flex between center gap-2 wrap mb-2">' +
        '<div class="flex gap-2 center" style="min-width:0">' +
          '<span class="gw-method-ic">' + icon(m.icon, "ic ic-sm") + "</span>" +
          "<b>" + esc(m.title) + "</b>" +
        "</div>" +
        '<label class="switch" title="Offer this method"><input type="checkbox" data-on="' + m.key + '"' +
          (on ? " checked" : "") + '><span></span><em>' + (on ? "On" : "Off") + "</em></label>" +
      "</div>" +
      '<div class="grid g-2 gw-method-fields">' + fields + "</div>" +
    "</div>";
  }).join("");

  /* the switch hides a method's fields so the card is readable when it is off,
     but the values are still submitted, so turning it back on keeps them */
  $$("[data-on]").forEach((cb) => {
    const card = cb.closest(".gw-method");
    const sync = () => {
      const on = cb.checked;
      card.toggleAttribute("data-off", !on);
      card.querySelector(".gw-method-fields").hidden = !on;
      const em = card.querySelector(".switch em");
      if (em) em.textContent = on ? "On" : "Off";
      paintSummary();
    };
    cb.addEventListener("change", sync);
    sync();
  });

  $("#gwForm").querySelectorAll("input,select,textarea").forEach((i) => i.addEventListener("input", () => setError(i)));
  paintSummary();
}

/* a live read of every switch, so the admin can see at a glance what customers
   will be offered and what is still unfinished */
function readMethods() {
  const out = {};
  for (const m of METHODS) {
    const c = { on: false };
    for (const f of m.fields) {
      const el = document.getElementById("m_" + m.key + "_" + f.name);
      if (!el) continue;
      c[f.name] = f.type === "number" || f.type === "select" ? el.value : el.value.trim();
    }
    c.on = !!document.querySelector('[data-on="' + m.key + '"]')?.checked;
    out[m.key] = c;
  }
  return out;
}

function paintSummary() {
  const box = $("#gwSummary");
  if (!box) return;
  const cur = readMethods();
  const on = METHODS.filter((m) => cur[m.key].on);
  if (!on.length) {
    box.className = "alert alert-warn";
    box.innerHTML = icon("alert") + "<div><b>No method is switched on</b><br>" +
      "Customers will not be able to add money to their wallet.</div>";
    return;
  }
  const broken = on.filter((m) => Object.keys(validateMethod(m.key, cur[m.key])).length);
  if (broken.length) {
    box.className = "alert alert-warn";
    box.innerHTML = icon("alert") + "<div><b>Not ready yet</b><br>" +
      broken.map((m) => esc(m.title)).join(", ") +
      " — fill in the highlighted fields and save.</div>";
    return;
  }
  box.className = "alert alert-ok";
  box.innerHTML = icon("check") + "<div><b>" + on.length + " method" + (on.length > 1 ? "s" : "") +
    " live</b><br>" + on.map((m) => esc(m.title)).join(", ") +
    " will show in the customer's Add money popup.</div>";
}

function bind() {
  $("#refresh").addEventListener("click", async () => {
    $("#refresh").innerHTML = '<span class="spinner"></span>';
    await load();
    $("#refresh").innerHTML = icon("refresh", "ic ic-sm") + " Refresh";
    toast("Payments refreshed.", "ok");
  });

  $("#depChips").addEventListener("click", (e) => {
    const c = e.target.closest("[data-df]");
    if (!c) return;
    depFilter = c.dataset.df;
    $$("#depChips .chip").forEach((x) => x.classList.toggle("active", x === c));
    renderDeposits();
  });

  $("#gwForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const next = readMethods();

    /* validate every switched-on method, and put each message on its own field */
    let ok = true;
    for (const m of METHODS) {
      const errs = validateMethod(m.key, next[m.key]);
      for (const f of m.fields) {
        const el = document.getElementById("m_" + m.key + "_" + f.name);
        if (el) setError(el, errs[f.name] || "");
      }
      if (next[m.key].on && Object.keys(errs).length) ok = false;
    }
    if (!ok) {
      toast("Fill in the highlighted fields, or switch the method off.", "warn");
      $(".gw-method[data-off] input:invalid")?.focus();
      return;
    }

    const btn = $("#gwSave");
    const label = btn.querySelector(".btn-txt").innerHTML;
    btn.disabled = true;
    btn.querySelector(".btn-txt").innerHTML = '<span class="spinner"></span> Saving…';

    try {
      await savePaymentSettings({ methods: next });
      cfg = { ...cfg, methods: next };
      const live = METHODS.filter((m) => next[m.key].on).map((m) => m.title).join(", ");
      toast(live ? "Saved. Live for customers: " + live : "Saved. No method is switched on.", "ok");
      paintMethods();
    } catch (err) {
      console.error(err);
      toast("Could not save the settings.", "err");
    } finally {
      btn.disabled = false;
      btn.querySelector(".btn-txt").innerHTML = label;
    }
  });
}


document.addEventListener("DOMContentLoaded", async () => {
await requireAdmin();

  const p = new URLSearchParams(location.search);
  if (p.get("tab") === "deposits") {
    document.querySelector('[data-tab="t-dep"]').click();
  }

  $("#depRows").innerHTML = skRows(6, 7);
  await load();
  bind();
});
