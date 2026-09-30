/* No import of components/toast.js here. There was one, unused — and it closed
   a circle: app.js -> toast.js -> app.js, because toast.js builds its markup
   with $, el and esc from this file. Whichever of the two the browser entered
   first got a half-built copy of the other, so `inr` was still in its
   temporal dead zone when cart-service called it at the top of its body, and
   the whole module graph stopped loading — no icon sprite, no data, on the
   admin sign-in page. */

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

/* =====================================================================
   THE SIDEBAR

   It lives here, and not in the navigation component, for a reason that cost a
   day to find: it used to be in this file, and when this file was split the
   lines went with the rest of the module and stopped running. A copy was left
   behind in a file the panel never loads, so the sidebar sat dark on nine pages
   out of thirteen. The navigation component draws the sidebar but does not
   decide which of its links is current, because a second copy of this lights up
   every quick-filter link on the page at once.
   ===================================================================== */
const openGroup = (g, open) => {
  if (!g) return;
  g.setAttribute("data-open", open ? "1" : "0");
  g.querySelector(".side-group-btn")?.setAttribute("aria-expanded", open ? "true" : "false");
};

/* Exported so the navigation component can ask for it again once it has drawn
   the sidebar. The two live in different files on purpose — this one decides
   which entry is current, that one draws the entries — and without this call
   the decision would run once against an empty sidebar, on whichever order the
   browser happened to load two unrelated files in. */
export function markCurrent() {
  const page = location.pathname.split("/").pop() || "dashboard.html";
  const query = location.search.replace(/^\?/, "");
  const links = $$(".side-link");

  /* A link is written as "./dashboard.html" in the markup, so the attribute is
     reduced to the file name and query it points at before anything is
     compared. Reading the attribute as written is what left the sidebar with
     nothing lit at all. */
  const norm = (a) => {
    const h = a.getAttribute("href") || "";
    if (!h || h === "#" || /^(https?:|mailto:|tel:)/.test(h)) return "";
    const q = h.indexOf("?");
    return (q < 0 ? h : h.slice(0, q)).split("/").pop() + (q < 0 ? "" : h.slice(q));
  };

  /* whatever the page was written with is cleared first, so one place decides
     what is current rather than a page guessing about itself */
  for (const a of links) {
    a.classList.remove("active");
    a.removeAttribute("aria-current");
  }
  const want = page + (query ? "?" + query : "");
  const exact = links.filter((a) => norm(a) === want);
  const lit = exact.length ? exact : links.filter((a) => {
    const n = norm(a);
    return n && n.indexOf("?") < 0 && n === page;
  });
  for (const a of lit) {
    a.classList.add("active");
    a.setAttribute("aria-current", "page");
  }

  /* a group header is a button, so it is in the tab order already and Enter or
     Space fires a click on its own. Without the type the listener below would
     fire twice and shut the group again straight after opening it. */
  $$(".side-group-btn").forEach((b) => b.setAttribute("type", "button"));
  /* the group holding the current page starts open, so the highlight is not
     hidden behind a shut drawer */
  for (const g of $$(".side-group")) {
    if (g.querySelector(".side-link.active")) openGroup(g, true);
  }
  $$("[data-year]").forEach((n) => (n.textContent = new Date().getFullYear()));
}

document.addEventListener("click", (e) => {
  const head = e.target.closest(".side-group-btn");
  if (!head) return;
  const g = head.closest(".side-group");
  const opening = g.getAttribute("data-open") !== "1";
  /* one group at a time, so a long sidebar does not become a wall of links */
  for (const o of $$(".side-group")) if (o !== g) openGroup(o, false);
  openGroup(g, opening);
});

/* Escape shuts an open group, so a keyboard user is never trapped inside one */
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  for (const g of $$(".side-group[data-open='1']")) openGroup(g, false);
});

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", markCurrent);
else markCurrent();

/* =====================================================================
   TAB STRIPS

   A strip of buttons marked [data-tab] shows one panel at a time, the panel
   being the element whose id matches the button's data-tab. Site content and
   Payments are both built this way.

   This lived in a components/site.js that the panel no longer loads, and
   deleting that file took the tab driver with it: both pages still had their
   five and three buttons, and clicking any of them did nothing, so Store
   details, Card look, Reviews and FAQ were unreachable — you could only ever
   see the first panel. Nothing reported an error, because a missing click
   handler is not an error.

   It belongs in the shell, which every page loads, so that no page-level file
   split can leave a page with buttons that go nowhere again.
   ===================================================================== */
document.addEventListener("click", (e) => {
  const tab = e.target.closest("[data-tab]");
  if (!tab) return;
  const group = tab.closest("[data-tabs]");
  if (!group) return;
  showTab(tab, group);
});

function showTab(tab, group) {
  group.querySelectorAll("[data-tab]").forEach((b) => {
    b.classList.remove("active");
    b.setAttribute("aria-selected", b === tab ? "true" : "false");
  });
  tab.classList.add("active");

  /* the panels are siblings of the strip inside its own wrapper, so the search
     is kept inside the group rather than the whole document */
  const scope = group.parentElement || document;
  scope.querySelectorAll(".tab-panel").forEach((p) => {
    p.classList.remove("active");
    p.hidden = true;
  });
  const panel = scope.querySelector("#" + tab.dataset.tab) || document.getElementById(tab.dataset.tab);
  if (panel) { panel.classList.add("active"); panel.hidden = false; }
}

/* Give the strip the names a screen reader needs, once, and let the left and
   right arrow keys walk along it — which is what a tab strip is expected to do,
   and without it a keyboard user could only ever reach the first tab by
   tabbing through every button in the page after it. */
function dressTabs(group) {
  const strip = group.querySelector(".tabs") || group;
  strip.setAttribute("role", "tablist");
  const tabs = [...group.querySelectorAll("[data-tab]")];
  tabs.forEach((b) => {
    b.setAttribute("role", "tab");
    b.setAttribute("aria-controls", b.dataset.tab);
    if (!b.hasAttribute("aria-selected")) b.setAttribute("aria-selected", b.classList.contains("active") ? "true" : "false");
    const p = document.getElementById(b.dataset.tab);
    if (p) { p.setAttribute("role", "tabpanel"); p.setAttribute("aria-labelledby", b.id || (b.id = "tab-" + b.dataset.tab)); }
  });

  strip.addEventListener("keydown", (e) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    const here = tabs.findIndex((b) => b === document.activeElement);
    if (here < 0) return;
    e.preventDefault();
    const next = tabs[(here + step + tabs.length) % tabs.length];
    next.focus();
    showTab(next, group);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  $$("[data-tabs]").forEach(dressTabs);
});
