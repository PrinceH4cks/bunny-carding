import { brandName, initBrand } from "../core/brand.js";
import { logout } from "../core/auth.js";
import { app } from "../core/firebase-config.js";
import { pageUrl } from "../core/app.js";

/* =========================================================
   PANEL - js/appbar.js
   Phone shell: a compact app header plus a sticky action dock.
   There is deliberately NO bottom tab bar — the account sidebar
   (.side) is the only navigation, on phones and on desktop alike.
   On a phone it is an off-canvas drawer opened by the menu button
   in the app header, so nothing sits along the bottom edge.
   ========================================================= */

import { $, $$, esc, markCurrent } from "../core/app.js";
import { icon } from "./icons.js";
import { drawSidebar } from "./sidebar.js";
import { initModals } from "./modal.js";

const MOBILE = () => window.matchMedia("(max-width: 860px)").matches;
const NARROW = () => window.matchMedia("(max-width: 940px)").matches;
const ic = (n) => '<svg class="ic" aria-hidden="true"><use href="#i-' + n + '"></use></svg>';

const here = () => (location.pathname.split("/").pop() || "dashboard.html").split("?")[0];

/* The phone menu button that opens the sidebar drawer, and everything that
   closes it again: the backdrop, the X on the drawer itself, and Escape.
   The app bar is hidden on desktop, where the sidebar is always on screen, so
   the button only needs wiring on narrow layouts. It is the single opener.

   The X had no listener at all. Nine page scripts made it visible on a narrow
   screen and none of them closed anything with it, so on a phone the drawer
   opened and then could only be shut by tapping the strip of page beside it. */
function wireDrawerToggle() {
  const btn = $(".app-bar-menu");
  const side = $(".side");
  const back = $(".side-backdrop");
  const shut = $(".side-close");
  if (!btn || !side) return;

  const open = () => {
    side.classList.add("open");
    back?.classList.add("open");
    document.body.classList.add("no-scroll");
  };
  const close = () => {
    side.classList.remove("open");
    back?.classList.remove("open");
    document.body.classList.remove("no-scroll");
  };

  btn.addEventListener("click", open);
  back?.addEventListener("click", close);
  shut?.addEventListener("click", close);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && side.classList.contains("open")) close();
  });
  /* a link tapped inside the drawer is a journey, not a place to linger */
  side.addEventListener("click", (e) => {
    if (e.target.closest("a") && side.classList.contains("open")) close();
  });
  /* the X only makes sense while the drawer is the way in */
  const fit = () => {
    if (shut) shut.style.setProperty("display", NARROW() ? "block" : "none");
  };
  fit();
  window.addEventListener("resize", fit, { passive: true });
  window.addEventListener("orientationchange", () => setTimeout(fit, 120));
}

function appHeader() {
  if ($(".app-bar")) return;
  const header = $(".site-header");
  if (!header) return;
  const titleNode = header.querySelector(".brand-text");
  const title = titleNode ? titleNode.childNodes[0].textContent.trim() : brandName();

  const bar = document.createElement("div");
  bar.className = "app-bar";
  /* The two addresses below are built with pageUrl and then dropped into the
     markup as values. They were once written as a piece of source code that sat
     inside the string — the href came out as the text of a pageUrl call rather
     than as an address — so on a phone the top bar's two buttons went nowhere. */
  bar.innerHTML =
    '<div class="app-bar-in">' +
      '<button class="app-bar-btn app-bar-menu" type="button" aria-label="Open menu">' +
        ic("menu") + "</button>" +
      '<a class="app-bar-brand" href="' + esc(pageUrl("pages/dashboard.html")) + '">' +
        '<span class="app-bar-mark">' + ic("store") + "</span>" +
        '<span class="app-bar-title">' + esc(title) + "</span>" +
      "</a>" +
      '<div class="app-bar-act">' +
        '<a class="app-bar-btn" href="#" data-site-link aria-label="View store">' + ic("external") + "</a>" +
        '<button class="app-bar-btn" type="button" data-logout aria-label="Log out">' + ic("logout") + "</button>" +
      "</div>" +
    "</div>";
  header.prepend(bar);

  /* a real sign-out, rather than a link to the sign-in page that leaves the
     session alive behind it */
  bar.querySelector("[data-logout]")?.addEventListener("click", (e) => {
    e.preventDefault();
    logout();
  });
}

export function dock({ label, href, click }) {
  const d = document.createElement("div");
  d.className = "dock";
  d.innerHTML =
    '<div class="dock-price"><small>' + (label || "") + "</small><b>&nbsp;</b></div>" +
    (href ? '<a class="btn btn-primary btn-lg" href="' + href + '">Continue</a>'
          : '<button class="btn btn-primary btn-lg" type="button">Continue</button>');
  document.body.appendChild(d);

  /* the dock owns the bottom edge now */
  document.body.classList.add("has-dock");

  if (click?.fn && !href) d.querySelector("button").addEventListener("click", click.fn);
  return d;
}

function responsive() {
  const apply = () => {
    const m = MOBILE();
    $$(".nav-links").forEach((n) => n.classList.toggle("force-hide", m));
    $$(".nav-toggle").forEach((b) => b.classList.toggle("force-hide", m));
    $$(".app-bar").forEach((b) => b.classList.toggle("on", m));
    $$(".nav-actions .dropdown").forEach((d) => d.classList.toggle("force-hide", m));
    /* plain action buttons in the header duplicate the app bar, and on a narrow
       phone they pushed the nav past the viewport edge */
    $$(".nav-actions > a.btn").forEach((a) => a.classList.toggle("force-hide", m));
  };
  apply();
  window.addEventListener("resize", apply, { passive: true });
  window.addEventListener("orientationchange", () => setTimeout(apply, 120));
}

function boot() {
  /* The shop's name, and the developer's picture and contact links. This is the
     one file every page of the panel loads, including the sign-in page — which
     does not load core/header.js, so the name was never applied there and the
     sign-in page showed the placeholder wordmark and a support block with no
     picture in it. */
  initBrand();

  /* the sidebar is drawn from one list before anything else runs, so the
     drawer wiring below has a close button to wire to on every page, and the
     "which entry is current" decision is asked for again now that there is
     something for it to decide about */
  drawSidebar();
  markCurrent();
  appHeader();
  wireDrawerToggle();
  responsive();

  /* The dialogs were given a shared handler — close on Escape, on the X, on a
     click outside — and nothing ever called it, so every dialog in the panel
     could be opened but not shut again except by the page scripts that happened
     to wire their own button. It is wired here, in the one file every page of
     the panel loads. */
  initModals();
  wireDropdowns();
}

/* The profile menu in the header.

   The stylesheet only shows a dropdown when its wrapper carries the "open" class,
   and nothing in the panel ever added it. The button in the header therefore did
   nothing at all — and that button is where a person goes to sign out, so it was
   the one control in the header that could not be used.

   The storefront has had this since it was written; the panel never got it.

   One delegated listener rather than one per dropdown, because the sidebar and
   the mobile app bar are drawn at runtime and have to behave the same as the
   header's. Clicking another dropdown closes this one; clicking an item inside
   closes it and lets the link through; Escape closes it and returns focus to the
   button, so the menu can be opened again from the keyboard alone. */
function wireDropdowns() {
  const triggerOf = (dd) => dd.querySelector(":scope > button");

  const setOpen = (dd, on) => {
    dd.classList.toggle("open", on);
    const t = triggerOf(dd);
    if (t) t.setAttribute("aria-expanded", on ? "true" : "false");
  };

  $$(".dropdown").forEach((dd) => {
    const t = triggerOf(dd);
    if (!t) return;
    t.setAttribute("aria-haspopup", "menu");
    setOpen(dd, dd.classList.contains("open"));
  });

  document.addEventListener("click", (e) => {
    const dd = e.target.closest(".dropdown");
    /* Close first, then decide. Bailing out early when the click landed outside
       every dropdown — which is the common case — is what left the menu open
       after a click somewhere else on the page. */
    $$(".dropdown.open").forEach((d) => { if (d !== dd) setOpen(d, false); });
    if (!dd || !triggerOf(dd)) return;
    /* an item inside was pressed: let it navigate, and close on the way out */
    if (e.target.closest(".dropdown-menu a, .dropdown-menu button")) { setOpen(dd, false); return; }
    setOpen(dd, !dd.classList.contains("open"));
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const open = $(".dropdown.open");
    if (!open) return;
    setOpen(open, false);
    triggerOf(open)?.focus();
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();

/* the active sidebar link is handled once, in core.js — duplicating it here
   lit up every quick-filter link on the page at the same time */
