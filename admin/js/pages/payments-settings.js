import { auth } from "../core/firebase-config.js";
import { db } from "../core/db.js";

/* =========================================================
   PANEL - js/payments-settings.js
   Every payment setting on one page.

   Each deposit method has its own page for the requests that came through it,
   but the settings themselves all live here, together, so an admin can see the
   whole picture and save it in one go rather than hopping between three pages
   and pressing save on each.

   The fields are built from METHODS in js/deposits.js, the same list the
   customer's "Add money" popup is built from, so a method can never be
   described one way here and another way to the customer.
   ========================================================= */
import { $, $$, inr, esc, timeAgo, setError } from "../core/app.js";
import { toast } from "../components/toast.js";
import { emptyState } from "../components/ui.js";
import { getDeposits } from "../services/user-service.js";
import { getPaymentSettings, savePaymentSettings, DEFAULT_PAYMENT } from "../services/payment-service.js";
import { requireAdmin } from "../core/auth.js";
import { icon } from "../components/icons.js";
import { METHODS, methodByKey, validateMethod } from "../services/payment-service.js";

let DEPS = [];
let cfg = { ...DEFAULT_PAYMENT };

/* the short name used on buttons and toasts */
const SHORT = { zap: "AutoPay", upi: "Manual UPI", crypto: "Crypto" };

/* nothing is saved until its own button is pressed, so one method being
   half-finished can never be committed by saving another */
let saved = { methods: {}, shared: null };

/* the settings that belong to no single method */
const SHARED = [
  { name: "payeeName", label: "Store name on the payment screen", type: "text" },
  { name: "qrMinutes", label: "UPI QR valid for (minutes)", type: "number", min: 1, max: 120 },
  { name: "notes", label: "Note shown to customers", type: "area" }
];

const badge = (cls, text) => '<span class="badge badge-' + cls + '">' + esc(text) + "</span>";

/* ---------- one method's card ---------- */
function methodCard(m, saved) {
  const on = !!saved.on;
  const fields = m.fields.map((f) => field(m.key, f, saved[f.name])).join("");
  return `
  <div class="card card-pad pm-card" data-key="${m.key}"${on ? "" : " data-off"}>
    <div class="flex between center gap-2 wrap mb-2">
      <div class="flex gap-2 center" style="min-width:0">
        <span class="gw-method-ic">${icon(m.icon)}</span>
        <b>${esc(m.title)}</b>
      </div>
      <label class="switch" title="Offer this method">
        <input type="checkbox" data-on="${m.key}"${on ? " checked" : ""}>
        <span></span><em class="pm-state">${on ? "On" : "Off"}</em>
      </label>
    </div>

    <div class="pm-fields" data-fields="${m.key}">
      ${fields}
    </div>

    <div class="pm-foot">
      <span class="pm-verdict" data-verdict="${m.key}"></span>
      <div class="flex gap-2">
        <a class="btn btn-ghost btn-sm" href="payments-${m.key === "zap" ? "autopay" : m.key === "upi" ? "manual" : "crypto"}.html">${icon("list", "ic ic-sm")} Requests</a>
        <button class="btn btn-primary btn-sm" type="button" data-save="${m.key}"><span class="btn-txt">${icon("save", "ic ic-sm")} Save</span></button>
      </div>
    </div>
  </div>`;
}

function field(key, f, v) {
  /* The method's own name is part of the id, because two of the three methods
     both have a "notes" field. With the method left out they shared one id, so
     getElementById could only ever reach the first of them: the crypto note was
     never read back, and saving wrote the UPI note into both methods. */
  const id = "m_" + key + "_" + f.name;
  let input;
  if (f.type === "area") {
    input = '<textarea class="textarea" id="' + id + '" rows="2">' + esc(v ?? "") + "</textarea>";
  } else if (f.type === "select") {
    input = '<select class="select" id="' + id + '">' +
      f.options.map(([ov, ol]) =>
        '<option value="' + esc(ov) + '"' + (String(v ?? "") === String(ov) ? " selected" : "") + ">" + esc(ol) + "</option>").join("") +
      "</select>";
  } else {
    const type = f.type === "number" ? "number" : f.type === "secret" ? "password"
      : f.type === "url" ? "url" : "text";
    const extra = [];
    if (f.type === "number") { extra.push('min="' + (f.min ?? 0) + '"'); if (f.max != null) extra.push('max="' + f.max + '"'); }
    if (f.type === "url") extra.push('inputmode="url" autocomplete="off" spellcheck="false"');
    input = '<input class="input' + (f.mono ? " mono" : "") + '" id="' + id + '" type="' + type +
      '" value="' + esc(v ?? "") + '" placeholder="' + esc(f.placeholder || "") + '"' +
      (extra.length ? " " + extra.join(" ") : "") + ">";
  }
  /* the label names its own input, so a screen reader says "UPI ID" and not
     just "edit text" */
  return '<div class="field">' +
    '<label for="' + id + '">' + esc(f.label) + (f.required ? ' <span class="req">*</span>' : "") + "</label>" +
    input +
    (f.hint ? '<div class="field-hint">' + esc(f.hint) + "</div>" : "") +
    '<div class="field-error"></div></div>';
}

/* ---------- paint ---------- */
function paint() {
  const stored = (cfg && cfg.methods) || {};

  $("#cards").innerHTML = METHODS.map((m) => methodCard(m, stored[m.key] || {})).join("");
  paintShared();

  /* the switch hides a method's fields but keeps their values, so turning a
     method off and on again does not make the admin retype anything */
  $$("[data-on]").forEach((cb) => {
    const key = cb.dataset.on;
    const card = cb.closest(".pm-card");
    const fields = card.querySelector('[data-fields="' + key + '"]');
    const sync = () => {
      const on = cb.checked;
      card.toggleAttribute("data-off", !on);
      fields.hidden = !on;
      card.querySelector(".pm-state").textContent = on ? "On" : "Off";
      paintVerdicts();
    };
    cb.addEventListener("change", sync);
    sync();
  });

  /* the seed for the unsaved comparison is read back out of the form, not out
     of the stored document: the form is what the admin is looking at, and a
     field the stored document happens to spell differently should not look
     like an unsaved change the moment the page opens */
  saved = {
    methods: Object.fromEntries(METHODS.map((m) => [m.key, readMethod(m.key)])),
    shared: readShared()
  };

  $("#cards").querySelectorAll("input,select,textarea").forEach((i) =>
    i.addEventListener("input", () => { setError(i); paintVerdicts(); }));

  $$("[data-save]").forEach((b) => b.addEventListener("click", () => saveMethod(b.dataset.save)));

  paintVerdicts();
}

function paintShared() {
  const one = (f) => {
    const id = "s_" + f.name;
    const v = cfg[f.name] ?? (f.type === "number" ? 10 : "");
    const input = f.type === "area"
      ? '<textarea class="textarea" id="' + id + '" rows="3">' + esc(v) + "</textarea>"
      : '<input class="input" id="' + id + '" type="' + (f.type === "number" ? "number" : "text") + '" value="' + esc(v) + '"' +
        (f.type === "number" ? ' min="' + (f.min ?? 0) + '"' + (f.max != null ? ' max="' + f.max + '"' : "") : "") + ">";
    return '<div class="field"><label for="' + id + '">' + esc(f.label) + "</label>" + input + "</div>";
  };
  const texts = SHARED.filter((f) => f.type === "text");
  const nums = SHARED.filter((f) => f.type === "number");
  const areas = SHARED.filter((f) => f.type === "area");

  $("#sharedForm").innerHTML =
    (texts.length ? '<div class="grid g-2">' + texts.map(one).join("") + "</div>" : "") +
    (nums.length ? '<div class="grid g-2">' + nums.map(one).join("") + "</div>" : "") +
    areas.map(one).join("");

  $("#sharedForm").querySelectorAll("input,textarea").forEach((i) => i.addEventListener("input", paintVerdicts));
}

/* ---------- reading what is on screen ---------- */
function readMethod(key) {
  const m = methodByKey(key);
  const c = { on: !!document.querySelector('[data-on="' + key + '"]')?.checked };
  if (!m) return c;
  for (const f of m.fields) {
    const el = document.getElementById("m_" + key + "_" + f.name);
    if (el) c[f.name] = f.type === "number" || f.type === "select" ? el.value : el.value.trim();
  }
  return c;
}

const readMethods = () => Object.fromEntries(METHODS.map((m) => [m.key, readMethod(m.key)]));

function readShared() {
  const out = {};
  for (const f of SHARED) {
    const el = document.getElementById("s_" + f.name);
    if (el) out[f.name] = f.type === "number" ? Number(el.value) : el.value.trim();
  }
  return out;
}

/* ---------- the state of each method, and of the page ----------
   Read live from the form, so the words match what the admin is looking at
   rather than what was last saved. A method whose card is dirty says so, because
   its own Save has not been pressed yet. */
function paintVerdicts() {
  const cur = readMethods();
  const live = [];

  for (const m of METHODS) {
    const box = document.querySelector('[data-verdict="' + m.key + '"]');
    if (!box) continue;
    const errs = validateMethod(m.key, cur[m.key]);
    const dirty = !same(cur[m.key], saved.methods[m.key]);

    if (!cur[m.key].on) {
      box.innerHTML = badge("warn", "Turned off") + (dirty ? ' <span class="pm-dirty">unsaved</span>' : "");
    } else if (Object.keys(errs).length) {
      box.innerHTML = badge("warn", "Not ready") + (dirty ? ' <span class="pm-dirty">unsaved</span>' : "");
    } else {
      box.innerHTML = badge("ok", "Live for customers") + (dirty ? ' <span class="pm-dirty">unsaved</span>' : "");
      live.push(m.title);
    }

    /* the card's own save button is the one that saves this method, so it is
       only enabled when that card's own settings need saving */
    const btn = document.querySelector('[data-save="' + m.key + '"]');
    if (btn) btn.disabled = !dirty;
  }

  paintSharedVerdict();

  const top = $("#sharedState");
  if (!top) return;
  if (!live.length) {
    top.className = "alert alert-warn";
    top.innerHTML = "<div>No method is switched on.</div>";
    return;
  }
  top.className = "alert alert-ok";
  top.innerHTML = "<div>" + live.length + " of " + METHODS.length + " methods live.</div>";
}

/* the shared block has its own verdict and its own save, on the same footing as
   the three method cards */
function paintSharedVerdict() {
  const box = $("#sharedVerdict");
  if (!box) return;
  const dirty = !same(readShared(), saved.shared);
  box.innerHTML = dirty ? badge("warn", "Unsaved") : "";
  const btn = $("#sharedSave");
  if (btn) btn.disabled = !dirty;
}

/* what is on screen, against what is stored, so a card can say "unsaved" */
function same(a, b) {
  if (!a || !b) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (String(a[k] ?? "") !== String(b[k] ?? "")) return false;
  }
  return true;
}

/* ---------- save, one method at a time ----------
   Each card saves itself. The other two methods are written back exactly as
   they were read, so pressing one card's Save can never disturb another. */
async function saveMethod(key) {
  const m = methodByKey(key);
  if (!m) return;
  const next = readMethod(key);

  const errs = validateMethod(key, next);
  for (const f of m.fields) {
    const el = document.getElementById("m_" + key + "_" + f.name);
    if (el) setError(el, errs[f.name] || "");
  }
  if (next.on && Object.keys(errs).length) {
    toast("Fill in the highlighted fields, or switch " + SHORT[key] + " off.", "warn");
    $(".field-error:not(:empty)")?.closest(".field")?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  const btn = document.querySelector('[data-save="' + key + '"]');
  const label = btn.querySelector(".btn-txt").innerHTML;
  btn.disabled = true;
  btn.querySelector(".btn-txt").innerHTML = '<span class="spinner"></span> Saving&hellip;';

  try {
    const methods = Object.assign({}, cfg.methods, { [key]: next });
    await savePaymentSettings({ methods });
    cfg = Object.assign({}, cfg, { methods });
    saved.methods = Object.assign({}, saved.methods, { [key]: next });
    toast(SHORT[key] + (next.on ? " is live for customers." : " is turned off."), "ok");
    paintVerdicts();
    paintCounts();
  } catch (e) {
    console.error(e);
    toast("Could not save " + SHORT[key] + ".", "err");
    btn.disabled = false;
  } finally {
    btn.querySelector(".btn-txt").innerHTML = label;
  }
}

/* the shared settings save on their own, without touching any method */
async function saveShared() {
  const next = readShared();
  const bad = [];
  for (const f of SHARED) {
    if (f.type !== "number") continue;
    const v = next[f.name];
    if (!Number.isFinite(Number(v)) || Number(v) < (f.min ?? 0)) bad.push(f.label);
  }
  if (bad.length) {
    toast("Check " + bad.join(" and ") + ".", "warn");
    return;
  }

  const btn = $("#sharedSave");
  const label = btn.querySelector(".btn-txt").innerHTML;
  btn.disabled = true;
  btn.querySelector(".btn-txt").innerHTML = '<span class="spinner"></span> Saving&hellip;';

  try {
    await savePaymentSettings(next);
    cfg = Object.assign({}, cfg, next);
    saved.shared = next;
    toast("Shared settings saved.", "ok");
    paintVerdicts();
  } catch (e) {
    console.error(e);
    toast("Could not save the shared settings.", "err");
  } finally {
    btn.querySelector(".btn-txt").innerHTML = label;
    paintVerdicts();
  }
}

/* ---------- the small counts above the cards ---------- */
function paintCounts() {
  const box = $("#mini");
  if (!box) return;
  const on = METHODS.filter((m) => (cfg.methods || {})[m.key]?.on);
  const awaiting = DEPS.filter((d) => d.status === "submitted");
  const credited = DEPS.filter((d) => d.status === "approved");
  const per = METHODS.map((m) => {
    const mine = DEPS.filter((d) => (d.method || "upi") === m.key);
    const badgeCls = (cfg.methods || {})[m.key]?.on ? "ok" : "dark";
    return '<div class="pv-row"><span>' + esc(SHORT[m.key]) + "</span><b>" + badge(badgeCls, mine.length + " deposits") + "</b></div>";
  }).join("");

  box.innerHTML =
    mini("sliders", "Methods live", on.length + " of " + METHODS.length, "var(--brand-50)", "var(--brand-600)") +
    mini("hourglass", "Waiting for you", awaiting.length, "var(--warn-50)", "var(--warn-600)") +
    mini("coins", "Credited to wallets", inr(credited.reduce((s, d) => s + Number(d.amount || 0), 0)), "var(--ok-50)", "var(--ok-600)") +
    mini("list", "Deposits per method", per, "var(--ink-100)", "var(--ink-600)");

  const sd = $("#sideDep");
  if (sd) { sd.textContent = awaiting.length; sd.classList.toggle("hidden", !awaiting.length); }
}

const mini = (icName, label, val, bg, fg) =>
  '<div class="card card-pad"><div class="stat">' +
  '<div class="stat-ic" style="background:' + bg + ";color:" + fg + '">' + icon(icName) + "</div>" +
  '<div style="min-width:0"><div class="stat-v" style="font-size:1.2rem">' + val + "</div>" +
  "<div class='stat-l'>" + label + "</div></div></div></div>";

/* ---------- the latest activity ---------- */
function paintActivity() {
  const list = DEPS.slice(0, 12);
  const box = $("#activity");
  if (!box) return;
  if (!list.length) {
    box.innerHTML = emptyState({ icon: "coins", title: "No deposits yet", text: "Requests appear here as soon as a customer adds money." });
    return;
  }
  box.innerHTML = list.map((d) => {
    const m = METHODS.find((x) => x.key === (d.method || "upi"));
    const ref = String(d.hash || d.utr || "").trim();
    return '<div class="pv-row pv-row-act">' +
      '<span class="pv-ic">' + icon(m ? m.icon : "coins", "ic ic-sm") + "</span>" +
      '<span class="pv-main"><b>' + esc(d.userName || d.userEmail || "Customer") + "</b>" +
      '<small class="text-muted">' + esc(m ? m.title : "UPI") +
      (ref ? " &middot; " + esc(ref.slice(0, 12)) + (ref.length > 12 ? "…" : "") : "") + "</small></span>" +
      '<b class="num">' + inr(d.amount) + "</b>" +
      '<span class="fs-xs text-muted">' + esc(timeAgo(d.createdAt)) + "</span></div>";
  }).join("");
}

/* ---------- load ---------- */
async function load() {
  try {
    [DEPS, cfg] = await Promise.all([getDeposits({ limitN: 300 }), getPaymentSettings()]);
    paint();
    paintCounts();
    paintActivity();
  } catch (e) {
    console.error(e);
    const box = $("#cards");
    if (box) box.innerHTML = '<div class="alert alert-err">' + icon("alert") +
      "<div><b>Could not load payment settings</b><br>" + esc(e.message || "Check your Firestore rules.") + "</div></div>";
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await requireAdmin();
  $("#sharedSave")?.addEventListener("click", saveShared);
  $("#refresh")?.addEventListener("click", async () => {
    const b = $("#refresh");
    b.innerHTML = '<span class="spinner"></span>';
    await load();
    b.innerHTML = icon("refresh", "ic ic-sm") + " Refresh";
    toast("Payment settings refreshed.", "ok");
  });
  await load();
});
