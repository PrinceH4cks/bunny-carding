import { $ } from "../core/app.js";

import { siteLink } from "../core/firebase-config.js";
/* =========================================================
   /card-visual.js
   Realistic card rendering (gift / prepaid cards)
   One component used by the product grid, detail page,
   order details and the wallet.
   ========================================================= */

import { esc, inr } from "../core/app.js";
import { icon } from "./icons.js";

/* ---------- networks: label + card gradient ---------- */
export const NETWORKS = {
  visa:       { label: "VISA",       from: "#1a1f71", to: "#2f54d8", ink: "#f2f5ff" },
  mastercard: { label: "Mastercard", from: "#161616", to: "#d9261c", ink: "#fff" },
  amex:       { label: "AMEX",       from: "#006fcf", to: "#0a4b8c", ink: "#fff" },
  discover:   { label: "Discover",   from: "#f2761b", to: "#1a1a5e", ink: "#fff" },
  rupay:      { label: "RuPay",      from: "#0e8a3c", to: "#f07d1a", ink: "#fff" },
  paytm:      { label: "Paytm",      from: "#00baf2", to: "#012970", ink: "#fff" },
  google:     { label: "Google",     from: "#ea4335", to: "#4285f4", ink: "#fff" },
  amazon:     { label: "Amazon",     from: "#ff9900", to: "#232f3e", ink: "#fff" },
  netbanking: { label: "Bank",       from: "#0c1222", to: "#3b2a6b", ink: "#fff" },
  prepaid:    { label: "Prepaid",    from: "#5b47e8", to: "#06b6d4", ink: "#fff" },
  other:      { label: "CARD",       from: "#3a4260", to: "#1a1f2e", ink: "#fff" }
};

export const netOf = (n) => NETWORKS[n] || NETWORKS.other;

/* ---------- card colour themes ----------
   Four looks an admin can mix onto any network from Admin > Site content >
   Card look. Each theme is just a gradient plus the ink it needs, so swapping
   one in can never break contrast the way a free-form hex picker would. */
export const CARD_THEMES = {
  midnight: { label: "Midnight", from: "#101a3d", to: "#2b4bd2", ink: "#eef2ff", edge: "#7f9bff" },
  graphite: { label: "Graphite", from: "#14161c", to: "#3d4453", ink: "#f2f4f8", edge: "#8b93a6" },
  royal:    { label: "Royal",    from: "#3b1d8f", to: "#7c3aed", ink: "#f6f1ff", edge: "#c4a6ff" },
  aurora:   { label: "Aurora",   from: "#04364f", to: "#0bbfa8", ink: "#e8fffb", edge: "#6ff0dd" },
  ember:    { label: "Ember",    from: "#4a1206", to: "#e0562a", ink: "#fff2ec", edge: "#ffab8a" },
  sand:     { label: "Sand",     from: "#3b2f22", to: "#b08a52", ink: "#fdf6ea", edge: "#e6cfa4" }
};
export const THEME_KEYS = Object.keys(CARD_THEMES);

const themeOf = (key) => CARD_THEMES[key] || null;

/* Per-network overrides, filled in from the saved site content. A network with
   no override keeps the colour it has always had. */
let OVERRIDES = {};

export function setCardThemeOverrides(map) {
  OVERRIDES = (map && typeof map === "object") ? map : {};
}

export function getCardThemeOverrides() {
  return { ...OVERRIDES };
}

/* Resolves the look for a product: an admin theme wins, otherwise the built-in
   network colour. */
export function lookOf(p) {
  const key = OVERRIDES[p && p.network];
  const t = themeOf(key);
  const base = netOf(p && p.network);
  if (!t) return { ...base, theme: null };
  return { label: base.label, from: t.from, to: t.to, ink: t.ink, edge: t.edge, theme: key };
}

/* ---------- formatting helpers ---------- */
export function groupCardNo(no) {
  const d = String(no || "").replace(/\D/g, "").padEnd(16, "0").slice(0, 16);
  return d.match(/.{1,4}/g).join(" ");
}

export function maskCardNo(no) {
  return "•••• •••• •••• " + String(no || "0000").replace(/\D/g, "").slice(-4).padStart(4, "0");
}

export function fmtExp(exp) {
  const e = String(exp || "").replace(/\D/g, "");
  if (e.length < 4) return e.padEnd(4, "0").replace(/(\d{2})(\d{2})/, "$1/$2");
  return e.slice(0, 2) + "/" + e.slice(2, 4);
}

/* ---------- the card face ---------- */
/**
 * @param {object} p     product
 * @param {object} opts  { reveal:boolean, holder:string, size:'lg'|'md'|'sm', showValue:boolean }
 */
export function cardVisual(p, opts = {}) {
  /* holder stays null by default so p.holderName can win; a truthy default
     here would shadow the real name on every card */
  const { reveal = false, holder = null, size = "md", showValue = true, theme = null } = opts;
  const n = lookOf(p);
  if (theme) { const t = themeOf(theme); if (t) { n.from = t.from; n.to = t.to; n.ink = t.ink; n.edge = t.edge; } }
  const no = reveal ? groupCardNo(p.cardNo) : maskCardNo(p.cardNo);
  const exp = fmtExp(p.expiry);
  const pin = reveal ? (p.pin || "••••") : "••••";
  const cvv = reveal ? (p.cvv || "•••") : "•••";
  const name = String(holder || p.holderName || p.brand || "CARD HOLDER").toUpperCase();

  return `
  <div class="ccard ccard--${esc(p.network || "other")} ccard--${size}" style="--c1:${n.from};--c2:${n.to};--ink:${n.ink};--edge:${n.edge || "rgba(255,255,255,.4)"}">
    <span class="ccard-glow" aria-hidden="true"></span>
    <span class="ccard-band" aria-hidden="true"></span>
    <span class="ccard-gloss" aria-hidden="true"></span>
    <span class="ccard-holo" aria-hidden="true"></span>

    <div class="ccard-row ccard-row--top">
      <span class="ccard-issuer">${esc(p.brand || n.label)}</span>
      <span class="ccard-topright">
        ${(reveal || (showValue && p.value)) ? '<span class="ccard-pills">' +
          (reveal ? '<span class="ccard-live">Activated</span>' : "") +
          (showValue && p.value ? '<span class="ccard-value">' + esc(inr(p.value)) + " value</span>" : "") +
        "</span>" : ""}
        <span class="ccard-net">${esc(n.label)}</span>
      </span>
    </div>

    <div class="ccard-mid">
      <span class="ccard-chip">${icon("chip")}</span>
      ${p.nfc !== false ? '<span class="ccard-nfc" title="Contactless">' + icon("nfc", "ic ic-sm") + "</span>" : ""}
    </div>

    <div class="ccard-num">${esc(no)}</div>

    <div class="ccard-row ccard-row--bottom">
      <span class="ccard-cell ccard-cell--name"><small>Card holder</small><b>${esc(name)}</b></span>
      <span class="ccard-cell"><small>Valid thru</small><b>${esc(exp)}</b></span>
      <span class="ccard-cell"><small>CVV</small><b>${esc(cvv)}</b></span>
      <span class="ccard-cell"><small>PIN</small><b>${esc(pin)}</b></span>
    </div>
  </div>`;
}

/* ---------- product tile that looks like a card ----------
   Used by the shop grid, the home page featured row, the dashboard
   suggestions and the detail page related row, so a card always looks
   like a card wherever it appears. */
export function cardTile(p) {
  const n = lookOf(p);
  const out = Number(p.stock || 0) <= 0;
  const value = Number(p.value || 0);
  const price = Number(p.price || 0);
  const mrp = Number(p.mrp || price);
  const off = mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0;
  const save = value > price ? Math.round(((value - price) / value) * 100) : 0;
  const low = !out && Number(p.stock) < 10;

  return `
  <article class="ctile" data-id="${esc(p.id)}">
    <a class="ctile-face" href="${siteLink("pages/card-detail.html?id=" + encodeURIComponent(p.id))}" aria-label="${esc(p.name)}">
      ${cardVisual(p, { size: "sm" })}
    </a>

    <div class="ctile-body">
      <div class="flex between center gap-2">
        <span class="badge badge-brand">${esc(p.category || "card")}</span>
        ${save > 0 ? `<span class="ctile-save">Save ${save}%</span>`
          : off > 0 ? `<span class="ctile-save">${off}% OFF</span>` : ""}
      </div>

      <h3 class="ctile-title"><a href="${siteLink("pages/card-detail.html?id=" + encodeURIComponent(p.id))}">${esc(p.name)}</a></h3>

      <div class="ctile-nums">
        <div><small>Pay</small><b class="mono">${off > 0 ? "<s>" + esc(inr(mrp)) + "</s> " : ""}${esc(inr(price))}</b></div>
        ${value > 0 ? `
        <span class="ctile-arrow">${icon("arrow-right", "ic ic-sm")}</span>
        <div><small>You get</small><b class="mono ctile-value">${esc(inr(value))}</b></div>` : ""}
      </div>

      <div class="ctile-foot">
        <span class="stock ${out ? "out" : low ? "low" : "in"}">
          ${out ? "Sold out" : low ? "Only " + p.stock + " left" : p.stock + " in stock"}
        </span>
        <button class="btn btn-primary btn-sm js-add" ${out ? "disabled" : ""} data-id="${esc(p.id)}">
          ${out ? "Sold out" : icon("cart", "ic ic-sm") + " Buy"}
        </button>
      </div>
    </div>
  </article>`;
}
