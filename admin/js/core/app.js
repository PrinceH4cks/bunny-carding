/* No import of components/toast.js here. There was one, unused â€” and it closed
   a circle: app.js -> toast.js -> app.js, because toast.js builds its markup
   with $, el and esc from this file. Whichever of the two the browser entered
   first got a half-built copy of the other, so `inr` was still in its
   temporal dead zone when cart-service called it at the top of its body, and
   the whole module graph stopped loading â€” no icon sprite, no data, on the
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
  if (!ts) return "â€”";
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
   `setError(form.name, â€¦)` silently does nothing. Always go through .elements. */

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
  const s = map[key] || { label: key || "â€”", cls: "badge-dark" };
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
   the sidebar. The two live in different files on purpose â€” this one decides
   which entry is current, that one draws the entries â€” and without this call
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
   details, Card look, Reviews and FAQ were unreachable â€” you could only ever
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
   right arrow keys walk along it â€” which is what a tab strip is expected to do,
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

/* =====================================================================
   Fitting a figure that has outgrown its box

   A rupee amount has no maximum length. The number is written in the one place
   that cannot know how large it is going to get: the shop fills a wallet, or a
   year's deposits land at once, and what was a comfortable four figures last
   month is eleven now. It does not fail quietly — it pushes out through its
   cell, over the column beside it and off the card, and whatever was in the next
   column is left sitting under the wrong heading.

   There is no font size that covers every case, so the size is worked out from
   the text in front of it. CSS cannot do this on its own: clamp() and container
   query units answer to the box, not to how many characters are in it, and the
   two only agree until the number gets long. Measuring is the only way to know.

   The measurement is deliberately the narrow one — a figure is fitted against
   its own box and nothing else. Wider answers are available and were tried: how
   much room the parent has, what is left once the siblings have taken theirs,
   how much of the page is left over. Every one of them is wrong in a layout
   whose boxes are sized to their own contents, which is most of these, because
   the thing beside the figure is as wide as the figure beside it and
   subtracting it asks the number to make room for a copy of itself. Those
   answers came back as 5px, and a ten digit phone number was shrunk to 9px by a
   rule that was supposed to be helping it. A figure is fitted only against a box
   that is able to say no. Where nothing can say no, the page is the box — see
   repairPageOverflow, which is blunt on purpose and only runs when the page is
   genuinely scrolling sideways.

   The observer is here because these pages draw their lists after load. A query
   resolves, a card is written into a container, and a pass at startup would find
   an empty page and be finished. It is debounced onto a frame and only looks at
   what was just added.
   ===================================================================== */

/* The element must hold the number in its own text, not merely contain it —
   otherwise a cell with a name in it is shrunk because of a figure inside it, and
   a paragraph with a figure in the middle of it stops being a paragraph. */
const holdsNumber = (el) => {
  let text = "";
  for (const n of el.childNodes) if (n.nodeType === 3) text += n.textContent;
  if (!/[0-9]/.test(text)) return false;
  /* eight digits is a balance or a total. Nothing else on these pages is. */
  return text.replace(/\D/g, "").length >= 8;
};

/* Left at the size the design chose: making these smaller would change a design
   rather than save one, and none of them is ever the thing overflowing. */
const LEAVE_ALONE = ".sr-only, [aria-hidden='true'], .badge, .pill, .chip, .icon, .ic, svg, path, code, pre, .brand, .logo";

export function fitText(el, { min = 9, step = 0.5, guard = 60 } = {}) {
  if (!el) return;

  /* The clipping stays on, which is the point. It is set in order to measure and
     then left in place: a figure that cannot be made small enough is cut with an
     ellipsis rather than let back out to hang over the next column. */
  el.style.whiteSpace = "nowrap";
  el.style.overflow = "hidden";
  el.style.fontSize = "";

  const full = parseFloat(getComputedStyle(el).fontSize) || 16;
  let size = full, n = 0;
  while (el.scrollWidth > el.clientWidth + 1 && size > min && n++ < guard) {
    size = Math.max(min, size - step);
    el.style.fontSize = size.toFixed(2) + "px";
  }

  /* A second pass, because the box is not the same width twice. The list below
     renders, the page grows tall enough to need a scrollbar, the scrollbar comes
     out of the viewport and the grid narrows by its width: the first pass fitted
     the number correctly against the box it could see, and the box then got
     smaller under it. Measuring again from where it landed is cheap next to
     finding out about it later. */
  for (let round = 0; round < 4 && el.scrollWidth > el.clientWidth + 1 && size > min; round++) {
    size = Math.max(min, size - step);
    el.style.fontSize = size.toFixed(2) + "px";
  }

  /* Under about 9px the digits stop being countable, so a figure that still does
     not fit is clipped and the full amount stays in the title, rather than
     shrinking into a smudge. */
  el.dataset.fitted = size < full ? String(Math.round(size * 10) / 10) : "";
  if (!el.title) el.title = el.textContent.trim();
}

/* Every marked element inside a root, in one pass, so the cost is one layout
   rather than one per number. The read and the write are kept apart on purpose:
   reading clientWidth after writing fontSize forces a reflow on every step. */
export function fitAll(root = document, selector = "[data-fit]") {
  for (const el of root.querySelectorAll(selector)) fitText(el);
}

export function autoFitNumbers(root = document) {
  const scope = root === document ? document.body : root;
  if (!scope) return 0;
  let n = 0;
  for (const el of scope.querySelectorAll("*")) {
    if (el.closest(LEAVE_ALONE)) continue;
    /* Already marked ones are re-fitted whether or not they overflow right now.
       This is the branch the font hook and the ResizeObserver rely on: a figure
       that was right for a box which has since changed size needs doing again, and
       by then it no longer looks like an overflow. */
    if (el.dataset.fit) { fitText(el); n++; continue; }
    if (!holdsNumber(el)) continue;
    if (!el.clientWidth) continue;
    if (el.scrollWidth <= el.clientWidth + 1) continue;
    el.dataset.fit = "";
    fitText(el);
    n++;
  }
  return n;
}

/* The last resort, and the only pass that measures the page rather than a box.

   A box sized to its own contents cannot say no: it grows to the figure, the
   figure reports no overflow, and the page ends up wider than the screen with
   nothing in it willing to admit to being the cause. A row of columns is the
   clearest case — three of them, each as wide as the figure inside it, add up to
   a track that is three times too wide, and every one of them is perfectly
   content-sized, so no amount of asking any single one of them how much room it
   has produces an answer. Measuring the figure inside it does not help either: it
   is not the widest thing on the page, the column around it is.

   So this works from the outside in and does not care what a box thinks its room
   is. While the document is scrolling sideways, whatever reaches past the right
   edge is holding it open, and it is capped to the edge — the outermost first,
   which lets the columns around the figures narrow, which lets the figures
   around the columns narrow, and so on until the page fits. Leaves are fitted as
   well as capped, so a figure that still has too many digits for the space it
   was left with is shrunk rather than cut.

   It repeats, because capping one thing can bring its neighbour inside the edge
   and expose the next, and it stops the moment the page fits. On a page that
   already fits it does nothing at all, which is what makes it safe for it to be
   this blunt. */
function repairPageOverflow() {
  const de = document.documentElement;
  if (!de) return 0;
  let fixed = 0;
  for (let pass = 0; pass < 5; pass++) {
    if (de.scrollWidth <= de.clientWidth + 1) break;
    const edge = de.clientWidth;
    let did = 0;
    /* outermost first, so a container is narrowed before the leaves inside it
       are measured against the space it has just been given */
    const out = [];
    for (const el of de.querySelectorAll("body *")) {
      if (el.closest(LEAVE_ALONE)) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || r.right <= edge + 1) continue;
      out.push({ el, r });
    }
    out.sort((a, b) => a.r.left - b.r.left);
    for (const { el, r } of out) {
      /* max-width is the content box under content-box sizing and the border box
         under border-box. Getting this backwards leaves the element's own padding
         outside the cap, so a card capped to the edge finishes exactly as wide as
         the edge plus its padding and the page still scrolls — the cap was
         applied and the number it was supposed to hold did not move. */
      const cs = getComputedStyle(el);
      const pad = cs.boxSizing === "border-box"
        ? 0
        : (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
      el.style.maxWidth = Math.max(28, Math.floor(edge - Math.max(0, r.left) - pad)) + "px";
      if (!el.children.length && holdsNumber(el)) {
        el.dataset.fit = "";
        fitText(el);
      }
      did++;
    }
    if (!did) break;
    fixed += did;
  }
  return fixed;
}

let queued = 0;
function queueAutoFit() {
  if (queued) return;
  queued = requestAnimationFrame(() => {
    queued = 0;
    try { autoFitNumbers(document); repairPageOverflow(); }
    catch { /* a fit must never break a page */ }
  });
}

/* Started once, and only in a browser: a module is imported by tools as well as
   by pages, and MutationObserver does not exist in the first case. */
if (typeof window !== "undefined" && typeof MutationObserver !== "undefined") {
  const start = () => {
    autoFitNumbers(document);
    repairPageOverflow();
    new MutationObserver((records) => {
      for (const r of records) {
        for (const node of r.addedNodes) {
          if (node.nodeType === 1) { queueAutoFit(); return; }
        }
      }
    }).observe(document.body, { childList: true, subtree: true });

    /* These pages load Inter, JetBrains Mono and Space Grotesk from Google Fonts
       with display=swap, so the first paint is a fallback face and the real one
       arrives after it. The widths differ, so a figure fitted against the
       fallback comes out too large for the face it is actually drawn in and hangs
       over the column beside it. Fitting was correct and then quietly undone by
       a font arriving; this is the other half of the fix. */
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        try { fitAll(document); autoFitNumbers(document); repairPageOverflow(); }
        catch { /* a fit must never break a page */ }
      });
    }

    /* The box is not the same width twice, and the change is invisible from
       inside the page: a list renders, the page grows tall enough to need a
       scrollbar, the scrollbar comes out of the viewport, and the grid narrows by
       its width. No resize event and no added node, so the observer above never
       sees it and the fitting goes stale — the number keeps the size it was given
       for a box that no longer exists. The page is the only thing that knows its
       own width changed, so it is what gets watched. The body is watched as well
       as the document: a list rendering below changes its height, and that is
       the signal that the page has found its final shape and the last pass was
       measured against a page that was not finished yet. */
    if (typeof ResizeObserver !== "undefined") {
      const onResize = () => queueAutoFit();
      let firstDoc = true, firstBody = true;
      new ResizeObserver(() => {
        if (firstDoc) { firstDoc = false; return; }   /* the observer's own first report */
        onResize();
      }).observe(document.documentElement);
      if (document.body) {
        new ResizeObserver(() => {
          if (firstBody) { firstBody = false; return; }
          onResize();
        }).observe(document.body);
      }
    }
    window.addEventListener("resize", queueAutoFit, { passive: true });
    /* images and web fonts finish after the first paint and move everything */
    window.addEventListener("load", queueAutoFit, { once: true });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}
