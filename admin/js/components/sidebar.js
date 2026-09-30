/* The panel's sidebar, written once.

   It used to be a block of markup copied into each of the thirteen pages, and
   the copies did not stay copies: four pages had no quick actions at all, four
   had a different set, and one had a fifth. A sidebar that changes as you move
   between pages is not a map, it is a set of guesses, and no review of the code
   catches it because every page is individually correct.

   So the list below is the only copy. app.js still decides which entry is
   current, from the hrefs it finds here, exactly as before — this file only
   draws the links. The pills keep the ids the page scripts already fill in
   (sideStock, sidePend, sideMsg, sideDep), and the hooks they listen for
   (data-logout, data-site-link) are drawn as before. */
import { $, $$ } from "../core/app.js";
import { icon } from "./icons.js";

const SIDE = [
  { id: "dashboard", href: "./dashboard.html", label: "Dashboard", ic: "chart" },
  { id: "products",  href: "./products.html",  label: "Products",  ic: "cart", pill: "sideStock" },
  { id: "orders",    href: "./orders.html",    label: "Orders",    ic: "box",   pill: "sidePend" },
  { id: "users",     href: "./users.html",     label: "Users",     ic: "users" },

  { group: "payments", label: "Payments", ic: "wallet", pill: "sideDep", sub: [
    { id: "pay-all",     href: "./payments.html",          label: "All payments",      ic: "list" },
    { id: "pay-autopay", href: "./payments-autopay.html",  label: "AutoPay (ZapUPI)",  ic: "zap" },
    { id: "pay-upi",     href: "./payments-manual.html",   label: "Manual UPI",        ic: "wallet" },
    { id: "pay-crypto",  href: "./payments-crypto.html",   label: "Crypto deposits",   ic: "coins" },
    { id: "pay-set",     href: "./payments-settings.html", label: "Payment settings",  ic: "sliders" }
  ] },

  { id: "messages", href: "./messages.html", label: "Messages", ic: "mail", pill: "sideMsg" },
  { id: "content",  href: "./content.html",  label: "Site content", ic: "settings" },
  { id: "coupons",  href: "./coupons.html",  label: "Coupons",  ic: "ticket" },
  { id: "reports",  href: "./reports.html",  label: "Reports",  ic: "chart" }
];

/* The same three from every page. They used to differ per page, which meant the
   thing you reach for most often was missing from the pages you use most. */
const QUICK = [
  { href: "./products.html?new=1",        label: "New product",   ic: "plus-circle" },
  { href: "./orders.html?status=pending", label: "Pending orders", ic: "clock" },
  { href: "./products.html?stock=low",     label: "Low stock",      ic: "trending-down" }
];

const glyph = (n) => '<span class="ic">' + icon(n) + "</span>";
const entry = (l) =>
  '<a class="side-link" data-side="' + l.id + '" href="' + l.href + '">' +
    glyph(l.ic) + "<span>" + l.label + "</span>" +
    (l.pill ? '<span class="pill hidden" id="' + l.pill + '">0</span>' : "") +
  "</a>";

export function drawSidebar() {
  const side = $(".side");
  if (!side) return;

  /* the close button is placed here rather than typed into thirteen pages */
  const close =
    '<button class="x-btn side-close" type="button" aria-label="Close menu" style="display:none">' +
      icon("x") + "</button>";

  side.innerHTML =
    '<div class="flex between center mb-2">' +
      '<span class="badge badge-warn">' + icon("shield") + "Admin</span>" + close +
    "</div>" +

    SIDE.map((l) => l.group
      ? '<div class="side-group" data-group="' + l.group + '" data-open="0">' +
          '<button class="side-link side-group-btn" type="button" aria-expanded="false" aria-controls="sub' +
            l.group.charAt(0).toUpperCase() + l.group.slice(1) + '">' +
            glyph(l.ic) + "<span>" + l.label + "</span>" +
            (l.pill ? '<span class="pill hidden" id="' + l.pill + '">0</span>' : "") +
            '<svg class="ic ic-sm side-caret" aria-hidden="true"><use href="#i-chevron-down"></use></svg>' +
          "</button>" +
          '<div class="side-submenu" id="sub' + l.group.charAt(0).toUpperCase() + l.group.slice(1) + '">' +
            '<div class="side-submenu-in">' + l.sub.map((s) =>
              '<a class="side-link side-sub" data-side="' + s.id + '" href="' + s.href + '">' +
                glyph(s.ic) + "<span>" + s.label + "</span></a>").join("") +
            "</div>" +
          "</div>" +
        "</div>"
      : entry(l)
    ).join("") +

    '<div class="side-title">Quick actions</div>' +
    QUICK.map((l) =>
      '<a class="side-link" href="' + l.href + '">' + glyph(l.ic) + "<span>" + l.label + "</span></a>").join("") +

    '<div class="side-title">Session</div>' +
    '<a class="side-link" href="#" data-site-link target="_blank" rel="noopener">' + glyph("store") + "<span>View store</span></a>" +
    '<a class="side-link" href="#" data-logout>' + glyph("logout") + "<span>Log out</span></a>";
}
