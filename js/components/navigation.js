import { login, logout } from "../core/auth.js";
import { brandName } from "../core/brand.js";
import { app, auth } from "../core/firebase-config.js";
import { pageUrl } from "../core/app.js";

/* =========================================================
   /appbar.js
   Native-app shell for phones:
     - bottom tab bar (Home / Shop / Wallet / Cart / Account)
     - compact app header that replaces the desktop nav
     - sticky bottom action dock
   Desktop is untouched — everything is injected only on phones.
   ========================================================= */

import { $, $$, esc } from "../core/app.js";
import { icon } from "./icons.js";
import { paintCount } from "../services/cart-service.js";

const MOBILE = () => window.matchMedia("(max-width: 860px)").matches;

/* ---------- tab definitions ---------- */
const ic = (n) => '<svg class="ic" aria-hidden="true"><use href="#i-' + n + '"></use></svg>';

/* The five places a phone customer goes, in the order a thumb reaches them: the
   account dashboard, the wallet, the card list, what they have bought, and
   their profile. Cart is not one of them — the cart is not somewhere you go, it
   is something you finish — so it lives in the top bar beside the wallet and
   keeps its count there. Account stays separate from the dashboard because the
   dashboard is the everyday screen and the profile is the settings.

   Shop sits in the middle and is drawn as a raised button rather than as one of
   four equals. It is the one place on this list you go to do something — look
   at what there is to buy — while the other four are where you check on
   something you already have. The shop's mark is a store, drawn as a shop; it
   was a grid, which is the mark for a category list and read as a fourth option
   rather than as the main one. */
const TABS = [
  { id: "home",    href: pageUrl("pages/dashboard.html"), label: "Home",    ic: "home"  },
  { id: "wallet",  href: pageUrl("pages/wallet.html"),    label: "Wallet",  ic: "wallet" },
  { id: "shop",    href: pageUrl("pages/cards.html"),     label: "Shop",    ic: "store" },
  { id: "orders",  href: pageUrl("pages/orders.html"),    label: "Orders",  ic: "box"   },
  { id: "account", href: pageUrl("pages/profile.html"),   label: "Profile", ic: "user"  }
];

const here = () => {
  const f = location.pathname.split("/").pop() || "index.html";
  return f.split("?")[0];
};

/* =====================================================================
   BOTTOM TAB BAR
   ===================================================================== */
function tabBar() {
  if ($(".tab-bar")) return;

  const bar = document.createElement("nav");
  bar.className = "tab-bar";
  bar.setAttribute("aria-label", "Primary");
  /* The name is written out as well as spoken. An icons-only bar reads as a set
     of marks rather than as five places to go, and the name is what tells a
     visitor which one is the wallet. The label is real text, so it is read by a
     screen reader too, and the link keeps its aria-label for the same reason. */
  bar.innerHTML = TABS.map((t) =>
    '<a class="tab" data-tab-id="' + t.id + '" href="' + t.href + '" aria-label="' + t.label + '">' +
      '<span class="tab-ic">' + ic(t.ic) +
      (t.badge ? '<span class="tab-badge" data-tab-cart hidden>0</span>' : "") +
      "</span>" +
      '<span class="tab-label">' + t.label + "</span>" +
    "</a>").join("");

  document.body.appendChild(bar);
  syncTabs();
  paintCount();
}

/* active state + cart badge.
   Scoped to .tab-bar on purpose: content panels also use .tab for their own
   tab strips (profile, orders…), and those have data-tab, not data-tab-id.
   Matching them made TABS.find() return undefined and threw on t.href, which
   killed the rest of boot() — so the whole mobile shell never initialised. */
function syncTabs() {
  const page = here();
  $$(".tab-bar .tab").forEach((a) => {
    const id = a.dataset.tabId;
    const t = TABS.find((x) => x.id === id);
    if (!t) return;
    /* Every tab has its own href, so a plain match lights exactly one of them.
       The pages a tab also stands for are listed in `also` — a product is part
       of Shop, and the sign-in screens are part of Account. Without this the
       shop front and the account pages were each left with no tab lit, which
       reads as a broken bar. The href is a full address from pageUrl, so it is
       compared by the page name it ends with. */
    const also = {
      home: ["index.html", "about.html", "contact.html"],
      shop: ["card-detail.html"],
      account: ["login.html", "register.html", "forgot-password.html"]
    };
    const on = t.href.endsWith("/" + page) || (also[id] || []).includes(page);
    a.classList.toggle("active", on);
    if (on) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
}

function syncTabBadge() {
  const n = parseInt(localStorage.getItem("bc_cart_v1") ? (JSON.parse(localStorage.getItem("bc_cart_v1")) || []).reduce((s, i) => s + i.qty, 0) : 0, 10) || 0;
  $$("[data-tab-cart]").forEach((b) => {
    b.textContent = n > 99 ? "99+" : n;
    b.hidden = !n;
  });
}

/* =====================================================================
   COMPACT APP HEADER  (replaces the desktop nav on phones)
   ===================================================================== */

/* A phone should get the very same profile menu the desktop header has. The
   existing dropdown node is cloned rather than re-typed, so the links, icons and
   data-* hooks can never drift from the desktop copy, and auth.js already paints
   every [data-auth-*] node on the page with querySelectorAll. core.js toggles
   any .dropdown on click, and header.js handles the cloned [data-logout], so
   there is no extra wiring to keep in sync. */
function appProfile(act) {
  if (act.querySelector(".app-profile")) return;
  const src = $$(".site-header .dropdown").find((d) => d.querySelector("[data-logout]"));
  if (!src) return;

  const dd = src.cloneNode(true);
  dd.classList.add("app-profile");

  /* On public pages the desktop dropdown ships as `hidden` + `.hidden` +
     `data-when-login`, so a plain clone would stay invisible. Carry the
     data-when-login hook over instead and drop the hard hiding: auth.js's
     show("[data-when-login]") then reveals or hides the clone exactly as it
     does the desktop copy, with no gating logic of our own. */
  const gated = src.hasAttribute("data-when-login");
  dd.removeAttribute("hidden");
  dd.classList.remove("hidden");
  if (gated) dd.setAttribute("data-when-login", "");

  /* auth.js paints every [data-auth-*] node on the page, but that may already
     have run before this clone existed, so the clone would sit on the static
     "User" placeholder. Mirror the desktop values across now; any later repaint
     still reaches both copies because it uses querySelectorAll. */
  ["[data-auth-name]", "[data-auth-email]", "[data-auth-initial]"].forEach((sel) => {
    const from = src.querySelectorAll(sel);
    dd.querySelectorAll(sel).forEach((n, i) => {
      if (from[i]) n.textContent = from[i].textContent;
    });
  });

  /* the clone's trigger becomes a compact app-bar button: avatar + name, sized
     like its wallet and cart neighbours instead of the tall desktop one */
  const btn = dd.querySelector("button");
  btn.className = "app-bar-btn app-profile-btn";
  btn.setAttribute("aria-haspopup", "true");
  btn.querySelector("[data-auth-name]").classList.add("app-profile-name");

  dd.querySelector(".dropdown-menu").classList.add("app-profile-menu");
  act.appendChild(dd);
}

function appHeader() {
  if ($(".app-bar")) return;
  const header = $(".site-header");
  if (!header) return;

  const sub = (header.querySelector(".brand-text small") || {}).textContent || "";
  const title = (header.querySelector(".brand-text") || {}).childNodes?.[0]?.textContent?.trim() || brandName();

  const bar = document.createElement("div");
  bar.className = "app-bar";
  bar.innerHTML =
    '<div class="app-bar-in">' +
      '<a class="app-bar-brand" href="' + pageUrl("index.html") + '">' +
        '<span class="app-bar-mark">' + ic("store") + "</span>" +
        '<span class="app-bar-title">' + esc(title) + "</span>" +
      "</a>" +
      '<div class="app-bar-act">' +
        '<a class="app-bar-btn app-bar-wallet" href="' + pageUrl("pages/wallet.html") + '" aria-label="Wallet">' + ic("wallet") +
          '<span class="app-bar-amt" data-app-wallet hidden>0</span>' +
        "</a>" +
        '<a class="app-bar-btn" href="' + pageUrl("pages/cart.html") + '" aria-label="Cart">' + ic("cart") +
          '<span class="app-bar-dot" data-tab-cart hidden>0</span></a>' +
      "</div>" +
    "</div>";

  header.prepend(bar);
  header.dataset.sub = sub;

  appProfile($(".app-bar-act"));
}

/* =====================================================================
   STICKY BOTTOM DOCK  (used by the card page and cart)
   ===================================================================== */
export function dock({ price, label, href, click }) {
  const d = document.createElement("div");
  d.className = "dock";
  d.innerHTML =
    '<div class="dock-price"><small>' + esc(label || "Total") + "</small><b>" + price + "</b></div>" +
    (href
      ? '<a class="btn btn-primary btn-lg" href="' + href + '">' + ic("arrow-right") + " Continue</a>"
      : '<button class="btn btn-primary btn-lg" type="button">' + esc(click?.text || "Continue") + "</button>");
  document.body.appendChild(d);

  /* the dock now owns the bottom edge, so the tab-bar padding must go —
     otherwise the page keeps an empty 84px strip under the dock on phones */
  document.body.classList.add("has-dock");
  document.body.classList.remove("pb-safe");
  applyPad();

  if (click?.fn && !href) d.querySelector("button").addEventListener("click", click.fn);
  return d;
}

/* =====================================================================
   RESPONSIVE FIXUPS
   ===================================================================== */

/* bottom padding depends on what is actually pinned to the bottom right now:
   a tab bar, a dock, or nothing */
function applyPad() {
  const m = MOBILE();
  const bar = $(".tab-bar");
  const pinned = !!$(".dock") || document.body.classList.contains("has-dock");
  document.body.classList.toggle("pb-safe", m && !pinned && !AUTH_PAGE());
  /* The tab bar is position:fixed, so the document has to be padded by its
     height or the last thing on a long page sits underneath it. pb-safe is
     removed whenever a dock is present because the dock reserves the space
     itself, and a page can be pinned by both at once. */
  document.body.classList.toggle("pb-dock", m && !pinned && !!bar && !AUTH_PAGE());
}

/* Signing in, signing up and resetting a password are the three screens a person
   meets before they have an account. The bottom bar belongs to the account —
   its five entries are five things inside the account — so putting it under a
   sign-in form offered five doors to rooms the visitor cannot open yet, and on a
   phone it also held a strip of screen open for nothing.

   The same flag also keeps the space that strip occupied from being reserved, so
   the form gets the whole screen and scrolls the way any page does. */
const AUTH_PAGE = () => {
  const f = location.pathname.split("/").pop() || "";
  return ["login.html", "register.html", "forgot-password.html"].includes(f);
};

function responsive() {
  const apply = () => {
    const m = MOBILE();

    /* Set on the body as well as left out of the class list, so the bar cannot
       appear on a signing-in screen even if this runs late or is interrupted:
       the rule in the stylesheet does not depend on JavaScript finishing. */
    document.body.classList.toggle("no-tabs", AUTH_PAGE());

    /* the account's bottom bar, on the account's pages only */
    $$(".tab-bar").forEach((b) => {
      b.classList.toggle("on", m && !AUTH_PAGE());
      b.setAttribute("aria-hidden", AUTH_PAGE() ? "true" : "false");
      /* kept out of the tab order entirely while it is off, so a keyboard user
         is not offered five links that lead nowhere */
      $$("a", b).forEach((a) => a.tabIndex = AUTH_PAGE() ? -1 : 0);
    });

    /* phone: hide the desktop nav list, show the app bar */
    $$(".nav-links").forEach((n) => n.classList.toggle("force-hide", m));
    $$(".nav-toggle").forEach((b) => b.classList.toggle("force-hide", m));
    $$(".app-bar").forEach((b) => b.classList.toggle("on", m));
    $$(".tab-bar").forEach((b) => b.classList.toggle("on", m));

    applyPad();

    /* strip the 3-line dropdown menu, the tab bar covers it */
    $$(".nav-actions .dropdown").forEach((d) => d.classList.toggle("force-hide", m));
    $$(".nav-actions .nav-wallet").forEach((w) => w.classList.toggle("force-hide", m));
    $$(".nav-actions .cart-btn").forEach((c) => c.classList.toggle("force-hide", m));
    /* plain action buttons in the header duplicate the app bar, and on a narrow
       phone they pushed the nav past the viewport edge */
    $$(".nav-actions > a.btn").forEach((a) => a.classList.toggle("force-hide", m));
  };

  apply();
  window.addEventListener("resize", apply, { passive: true });
  window.addEventListener("orientationchange", () => setTimeout(apply, 120));
}

/* =====================================================================
   BOOT
   ===================================================================== */
/* =====================================================================
   THE DESKTOP LINK LIST

   Written out in the page, it drifted: some pages had the list and some did
   not, and the one page that marked an item active was whichever page it was
   copied from. It is built here instead, once, so every page ends up with the
   same list and exactly one item lit. A page that already has the list in its
   markup keeps it, so the navigation is still there if this script never runs.
   ===================================================================== */
const LINKS = [
  { id: "home", page: "index.html", label: "Home" },
  { id: "shop", page: "pages/cards.html", label: "Shop" },
  { id: "wallet", page: "pages/wallet.html", label: "Wallet" },
  { id: "about", page: "pages/about.html", label: "About" },
  { id: "contact", page: "pages/contact.html", label: "Contact" }
];
/* pages that belong to a link without being that link's own page */
const ALSO = { "card-detail.html": "shop", "cart.html": "shop" };

function navLinks() {
  /* the sign-in and sign-up pages have no header to add a list to */
  const nav = $(".nav");
  if (!nav) return;
  let list = $(".nav-links");
  if (!list) {
    const brand = nav.querySelector(".brand");
    list = document.createElement("ul");
    list.className = "nav-links";
    if (brand) brand.after(list);
    else nav.prepend(list);
  }
  const page = here();
  /* the page is a bare file name, so the link is matched on the last part of
     its path rather than on the whole thing */
  const on = ALSO[page] || LINKS.find((l) => l.page.split("/").pop() === page)?.id;
  list.innerHTML = LINKS.map((l) =>
    '<li><a href="' + pageUrl(l.page) + '" data-nav-id="' + l.id + '">' + l.label + "</a></li>"
  ).join("");
  for (const a of $$("a", list)) {
    const lit = a.dataset.navId === on;
    a.classList.toggle("active", lit);
    if (lit) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
}

function boot() {
  appHeader();
  navLinks();
  tabBar();
  responsive();
  syncTabs();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();

/* keep the badges in sync with the cart */
document.addEventListener("cart:change", syncTabBadge);
export { syncTabs, syncTabBadge };
