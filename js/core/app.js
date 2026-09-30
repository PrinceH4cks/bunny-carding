/* No import of components/toast.js here — see the note in admin/js/core/app.js.
   The same unused import was closing a circle with toast.js, which builds its
   markup with $, el and esc from this file. */

export const $  = (sel, root = document) => root.querySelector(sel);

export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function el(tag, attrs = {}, html = "") {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k === "html") n.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  if (html) n.innerHTML = html;
  return n;
}

/* ---------- money ---------- */

export const inr = (n) =>
  "\u20B9" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

export const rupees = (n) => Math.round(Number(n || 0));

/* ---------- dates ---------- */
  /* Accepts a Firestore Timestamp, a plain Date, an epoch number, an ISO
     string, or a serialised { seconds } object - a timestamp that has been
     through JSON (an export, a cache, a copy-paste) has no toDate() left. */
  const toDate = (ts) => {
    if (ts == null) return null;
    if (ts instanceof Date) return isNaN(ts) ? null : ts;
    if (typeof ts.toDate === "function") { const d = ts.toDate(); return d instanceof Date && !isNaN(d) ? d : null; }
    if (typeof ts.seconds === "number") return new Date(ts.seconds * 1000);
    const d = new Date(ts);
    return isNaN(d) ? null : d;
  };

export function fmtDate(ts, withTime = true) {
  if (!ts) return "—";
  const d = toDate(ts);
  if (!d) return "-";
  return d.toLocaleDateString("en-IN",
    withTime
      ? { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }
      : { day: "2-digit", month: "short", year: "numeric" });
}

export function timeAgo(ts) {
  if (!ts) return "";
  const d = toDate(ts);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  if (s < 2592000) return Math.floor(s / 86400) + "d ago";
  return fmtDate(d, false);
}

/* ---------- strings ---------- */

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export function orderNo() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return "BC-" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) +
         "-" + Math.floor(Math.random() * 9000 + 1000);
}

export const initials = (name = "") =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase() || "U";

/* ---------- validation ---------- */

export const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v).trim());

export function strength(pw = "") {
  let s = 0;
  if (pw.length >= 6) s++;
  if (pw.length >= 10 && /[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}

export function setError(input, msg) {
  if (!input) return;
  const field = input.closest(".field");
  if (!field) return;
  const box = field.querySelector(".field-error");
  if (msg) {
    input.classList.add("invalid");
    if (box) { box.textContent = msg; box.style.display = "block"; }
  } else {
    input.classList.remove("invalid");
    if (box) box.style.display = "none";
  }
}

export function formData(form) {
  const o = {};
  new FormData(form).forEach((v, k) => { o[k] = typeof v === "string" ? v.trim() : v; });
  return o;
}

/* ---------- safe form field access ----------
   HTMLFormElement is [LegacyOverrideBuiltIns] in the HTML spec, so a form's own
   IDL properties win over its named controls. That means `form.name` returns the
   FORM's name attribute (usually ""), never <input name="name">. In a module
   (strict mode) `form.name.value = "x"` therefore throws a TypeError, and
   `setError(form.name, …)` silently does nothing. Always go through .elements. */

export function field(form, name) {
  if (!form) return null;
  if (form.elements) {
    const f = form.elements.namedItem(name);
    if (f && typeof f.length !== "number") return f;          // single control
    if (f && f.length === 1) return f[0];
    if (f && f.length > 1) return f[0];                      // RadioNodeList etc.
  }
  return form.querySelector('[name="' + name + '"]');
}

/* Reads every control of a form into a trimmed object, no shadowing surprises. */

export function readForm(form) {
  const o = {};
  if (!form) return o;
  new FormData(form).forEach((v, k) => { o[k] = typeof v === "string" ? v.trim() : v; });
  return o;
}

/* ---------- toast ---------- */

export const ORDER_STATUS = {
  pending:   { label: "Pending",   cls: "badge-warn"   },
  confirmed: { label: "Confirmed", cls: "badge-info"   },
  ready:     { label: "Ready",     cls: "badge-brand"  },
  delivered: { label: "Completed", cls: "badge-ok"     },
  cancelled: { label: "Cancelled", cls: "badge-danger" }
};

export const PAY_STATUS = {
  unpaid:   { label: "Unpaid",   cls: "badge-danger" },
  paid:     { label: "Paid",     cls: "badge-ok"     },
  refunded: { label: "Refunded", cls: "badge-warn"   }
};

export function statusBadge(map, key) {
  const s = map[key] || { label: key || "—", cls: "badge-dark" };
  return '<span class="badge ' + s.cls + ' badge-dot">' + esc(s.label) + "</span>";
}

/* Where a page lives, measured from the site root rather than from this file.
   A module's own address is not where the browser is, so a link that has to be
   written by hand as a relative path will be wrong as soon as the file and the
   page stop sitting in the same folder. Going through here keeps every page
   reachable from every page, and survives the site being served from a
   subfolder. */
const SITE_ROOT = new URL("../../", import.meta.url);
export const pageUrl = (p) => new URL(String(p).replace(/^\.\//, ""), SITE_ROOT).href;

/* The page being viewed, named from the site root, so it can be handed to
   pageUrl and come back to the same place. A bare file name is not enough here:
   there is more than one folder of pages, and "orders.html" alone would not say
   which one was open. */
export const pagePath = () => {
  const here = decodeURIComponent(new URL(".", location.href).pathname);
  const root = SITE_ROOT.pathname;
  if (here.startsWith(root)) return here.slice(root.length) || "index.html";
  return here.split("/").pop() || "index.html";
};
