import { el } from "../core/app.js";
import { initModals } from "./modal.js";
import { register, login } from "../core/auth.js";
import { db } from "../core/db.js";
import { cardTile } from "./card-visual.js";

/* =========================================================
   /site.js
   Applies the admin-editable site content to the user panel.

   Everything here is progressive enhancement: the markup already contains the
   real copy, so if Firestore is unreachable, slow, or an admin has never saved
   anything, the page renders exactly as it always has. No flash of empty
   sections, no layout shift, and never a thrown error on a live page.
   ========================================================= */

import { $, $$, esc, initials } from "../core/app.js";
import { getSiteContent } from "../services/user-service.js";
import { getReviews } from "../services/content-service.js";
import { setCardThemeOverrides } from "./card-visual.js";
import { initBrand, setBrand } from "../core/brand.js";
import { toast } from "./toast.js";

/* ---------- tiny path helpers over the site object ---------- */
const dig = (obj, path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);

/* The hero headline is word-split by motion.js for its reveal animation. Setting
   textContent on it would wipe those spans, so rebuild the identical markup
   instead of losing the animation. */
function setText(nodes, text) {
  if (text == null) return;
  nodes.forEach((el) => {
    const s = String(text);
    if (el.hasAttribute("data-split")) {
      el.innerHTML = s.trim().split(/\s+/)
        .map((w, i) => '<span class="word" style="--i:' + i + '">' + esc(w) + "</span>")
        .join(" ");
    } else {
      el.textContent = s;
    }
  });
}

/* ---------- sections ---------- */
function showSection(key, on) {
  $$(`[data-section="${key}"]`).forEach((el) => el.classList.toggle("hidden", !on));
}

/* ---------- announcement bar ---------- */
function paintAnnouncement(a) {
  const bar = $("[data-announce]");
  if (!bar) return;
  if (!a || !a.on || !String(a.text || "").trim()) {
    bar.classList.add("hidden");
    return;
  }
  const txt = $("[data-announce-text]", bar) || bar;
  txt.textContent = a.text;
  const link = $("[data-announce-link]", bar);
  if (link) {
    const href = String(a.href || "").trim();
    if (href) { link.setAttribute("href", href); link.classList.remove("hidden"); }
    else link.classList.add("hidden");
  }
  bar.classList.remove("hidden");
}

/* ---------- the trust ticker ----------
   motion.js wraps the whole marquee strip in a track and duplicates it for the
   seamless loop, so by the time this runs there can be two copies of the ticker
   in the DOM. They must be rewritten together, otherwise the loop shows one set
   on one pass and a different set on the next. */
function paintTicker(words) {
  if (!Array.isArray(words) || !words.length) return;
  const clean = words.map((w) => String(w).trim()).filter(Boolean);
  if (!clean.length) return;
  const html = clean.map((w) => `<span>${esc(w)}</span><span>&bull;</span>`).join("");
  $$("[data-site='ticker']").forEach((box) => { box.innerHTML = html; });
}

/* ---------- reviews / testimonials ----------
   Only replaced when an admin has actually added reviews, so a fresh install
   keeps the hand-written testimonials that ship in the markup. */
function paintReviews(list) {
  const box = $("[data-site='reviews']");
  if (!box) return;
  if (!Array.isArray(list) || list.length < 3) return;

  const TINTS = [
    "",
    "background:linear-gradient(135deg,#ea580c,#f97316)",
    "background:linear-gradient(135deg,#0f766e,#10b981)",
    "background:linear-gradient(135deg,#7c3aed,#a855f7)"
  ];

  box.innerHTML = list.slice(0, 6).map((r, i) => {
    const stars = Math.max(0, Math.min(5, Number(r.stars) || 5));
    const tint = TINTS[i % TINTS.length];
    const name = String(r.name || "Customer").trim();
    return '<div class="card card-pad card-hover">' +
      '<div class="stars mb-1">' + "&#9733;".repeat(stars) + "</div>" +
      '<p class="text-muted">"' + esc(String(r.text || "").trim()) + '"</p>' +
      '<div class="flex gap-2 center mt-2">' +
        '<span class="avatar avatar-sm"' + (tint ? ' style="' + tint + '"' : "") + ">" + esc(initials(name)) + "</span>" +
        '<div><b class="fs-sm">' + esc(name) + "</b>" +
        (r.place ? '<div class="fs-xs text-muted">' + esc(r.place) + "</div>" : "") +
        "</div></div></div>";
  }).join("");
}

/* ---------- store details (footer + contact page) ---------- */
function paintStore(store) {
  if (!store) return;
  Object.keys(store).forEach((k) => {
    const v = String(store[k] ?? "").trim();
    setText($$(`[data-site="store.${k}"]`), v);
  });
}

/* ---------- main ---------- */
export async function applySite() {
  /* The cached name goes in first, on every page. Several pages (login,
     register, forgot-password, wallet) carry no editable copy at all, so the
     early return that used to sit at the top of this function was also skipping
     the shop's name — those pages would have kept showing the placeholder
     forever, and they are the pages a person first lands on. */
  initBrand();

  /* Whether this page has copy the panel can change. Asking after the fetch is
     deliberate: the name is needed either way. */
  const editable = !!$("[data-site], [data-section], [data-announce]");

  let site = null;
  try {
    site = await getSiteContent();
  } catch {
    return; /* Firestore unreachable: the cached name stands. */
  }
  if (!site) return;

  /* The shop's own name, and everything written in it: the wordmark, the tab
     title, the meta description. It is applied from the same document as the
     rest of the copy, so one save in the panel moves all of it. */
  setBrand({ name: site.name, tagline: site.tagline, description: site.description });

  if (!editable) return;

  const hero = site.hero || {};
  setText($$('[data-site="hero.eyebrow"]'), hero.eyebrow);
  setText($$('[data-site="hero.headline"]'), hero.headline);
  setText($$('[data-site="hero.lead"]'), hero.lead);
  setText($$('[data-site="hero.ctaPrimary"]'), hero.ctaPrimary);
  setText($$('[data-site="hero.ctaSecondary"]'), hero.ctaSecondary);

  const stats = Array.isArray(site.heroStats) ? site.heroStats : [];
  stats.slice(0, 3).forEach((s, i) => {
    setText($$(`[data-site="heroStats.${i}.value"]`), s.value);
    setText($$(`[data-site="heroStats.${i}.label"]`), s.label);
    /* These values are count-up animated: motion.js caches the original string
       in data-raw and writes it back when the animation ends. Update that cache
       too, or the counter would restore the shipped number over the new one. */
    $$(`[data-site="heroStats.${i}.value"]`).forEach((el) => {
      if (s.value != null) el.dataset.raw = String(s.value);
    });
  });

  const head = site.reviewsHead || {};
  setText($$('[data-site="reviewsHead.badge"]'), head.badge);
  setText($$('[data-site="reviewsHead.title"]'), head.title);
  setText($$('[data-site="reviewsHead.rating"]'), head.rating);
  setText($$('[data-site="reviewsHead.count"]'), head.count);

  const q = site.quote || {};
  setText($$('[data-site="quote.text"]'), q.text);
  setText($$('[data-site="quote.cta"]'), q.cta);

  paintAnnouncement(site.announcement);
  paintTicker(site.ticker);
  paintStore(site.store);

  /* The card look has to be in place before any card renders, otherwise the
     first paint uses the built-in network colours and then snaps to the admin's
     choice. Cards already on the page are re-rendered straight after. */
  const themes = site.cardThemes || {};
  if (Object.keys(themes).length) {
    setCardThemeOverrides(themes);
    document.dispatchEvent(new CustomEvent("card:theme"));
  }

  const sec = site.sections || {};
  ["categories", "bestsellers", "reviews", "quote"].forEach((k) => {
    if (typeof sec[k] === "boolean") showSection(k, sec[k]);
  });

  /* Reviews are a separate read so a slow query cannot hold up the copy above. */
  getReviews().then(paintReviews).catch(() => {});
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", applySite, { once: true });
} else {
  applySite();
}

/* The product card lives in card-visual.js as cardTile(), so that the shop
   grid, the home page, the dashboard and the detail page all render the same
   Visa-style card. It used to live here as productCard(), but core.js is the
   base module and card-visual.js imports from it, so a card template here
   would have meant a circular import. */

/* ---------- global listeners ---------- */
document.addEventListener("click", (e) => {
  const add = e.target.closest(".js-add");
  if (add) {
    e.preventDefault();
    if (add.disabled) return;
    const id = add.dataset.id;
    const label = add.innerHTML;
    add.disabled = true;
    add.innerHTML = '<span class="spinner"></span>';
    /* The product is re-read rather than taken off the button, for the same
       reason "Buy" does it two lines down: the grid was rendered a while ago
       and the price, the stock and the card face may all have moved since. It
       also used to pass nothing but the id here, so addToCart was handed a
       string where it expected a product. Every quick add went in as a blank
       line — no name, no price, stock an empty string — and all of them shared
       an empty id, so two different cards merged into one and checkout then
       read the empty stock as zero and refused the order as out of stock. */
    Promise.all([import("../core/db.js"), import("../services/cart-service.js")])
      .then(([db, cart]) => db.getProduct(id).then((p) => {
        if (!p) throw new Error("That card is no longer available.");
        cart.addToCart(p, 1);
      }))
      .catch((err) => {
        console.error(err);
        toast(err.message || "Could not add that to your cart.", "err", "Not added");
      })
      .finally(() => { add.disabled = false; add.innerHTML = label; });
    return;
  }

  /* "Buy" on a card means buy now: it must not fall through to the cart. The
     product is re-read so the price, stock and card details are the current
     ones rather than whatever the grid happened to be rendered with. */
  const buy = e.target.closest(".js-buy");
  if (buy) {
    e.preventDefault();
    if (buy.disabled) return;
    const id = buy.dataset.id;
    const label = buy.innerHTML;
    buy.disabled = true;
    buy.innerHTML = '<span class="spinner"></span>';
    Promise.all([import("../core/db.js"), import("../pages/buy.js")])
      .then(([db, buyMod]) =>
        /* both steps live in this callback: buyMod is not in scope in a later
           .then(), which threw a ReferenceError and only reported the failure */
        db.getProduct(id).then((product) => {
          if (!product) throw new Error("That card is no longer available.");
          return buyMod.buyNow(product, 1);
        })
      )
      .catch((err) => {
        console.error(err);
        import("../pages/buy.js").then((m) => m.explain(err));
      })
      .finally(() => {
        buy.disabled = false;
        buy.innerHTML = label;
      });
  }
});

document.addEventListener("DOMContentLoaded", () => {
  initModals();

  const t = $(".nav-toggle"), l = $(".nav-links");
  if (t && l) t.addEventListener("click", () => l.classList.toggle("open"));

  document.addEventListener("click", (e) => {
    const dd = e.target.closest(".dropdown");
    $$(".dropdown.open").forEach((d) => { if (d !== dd) d.classList.remove("open"); });
    if (dd) dd.classList.toggle("open");
  });

  document.addEventListener("click", (e) => {
    const q = e.target.closest(".faq-q");
    if (q) q.parentElement.classList.toggle("open");
  });

  /* The off-canvas account sidebar used to be opened by a three-line button in
     the page header and closed by an X inside the panel. Both are gone: the
     phone bottom bar and the profile menu cover that navigation, so the sidebar
     is desktop-only and no script needs to drive it. The markup stays for the
     desktop layout. */

  /* Only drives the classic [data-tabs] group that swaps .tab-panel blocks.
     A page whose tabs filter in JS instead (orders.html rebuilds its strip from
     the TABS list) must not be caught here: the group falls back to document,
     group.classList is then undefined, and the handler throws before its own
     page script can react. */
  document.addEventListener("click", (e) => {
    const t2 = e.target.closest("[data-tab]");
    if (!t2) return;
    const group = t2.closest("[data-tabs]");
    if (!group) return;
    group.querySelectorAll("[data-tab]").forEach((b) => b.classList.remove("active"));
    t2.classList.add("active");
    const scope = group.classList.contains("tabs") ? group.parentElement : document;
    scope.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    const panel = document.getElementById(t2.dataset.tab);
    if (panel) panel.classList.add("active");
  });

  /* Highlight the link for the page we are on.
     Matching on the path alone lit up every link at once on cards.html
     (cards.html, cards.html?category=mobile, …), so an exact match including
     the query string wins, and only a link with no query string is allowed to
     match by path. */
  const here = location.pathname.split("/").pop() || "index.html";
  const hereQs = location.search.replace(/^\?/, "");
  const links = $$(".nav-links a, .side-link");

  /* A page that is not itself in the list lights the one it belongs under: a
     product is part of the shop, and the cart belongs there too when it is
     reached as a basket step. */
  const ALIAS = {
    "card-detail.html": "cards.html",
    "cart.html": "cards.html"
  };
  const want = here + (hereQs ? "?" + hereQs : "");

  /* A link is written three ways: "./cards.html" in the markup, and a full
     address once the navigation has been built, so a link is reduced to the
     file name and query it points at before anything is compared. Comparing the
     text of the attribute is what left the sidebar with nothing lit. */
  const norm = (a) => {
    const h = a.getAttribute("href") || "";
    if (!h || h === "#" || /^(https?:|mailto:|tel:)/.test(h)) return "";
    const q = h.indexOf("?");
    const path = (q < 0 ? h : h.slice(0, q)).split("/").pop();
    return q < 0 ? path : path + h.slice(q);
  };

  const exact = links.filter((a) => norm(a) === want);
  const byPath = exact.length ? exact : links.filter((a) => {
    const n = norm(a);
    return n && n.indexOf("?") < 0 && (n === here || n === ALIAS[here]);
  });
  for (const a of byPath) {
    a.classList.add("active");
    a.setAttribute("aria-current", "page");
  }

  $$("[data-year]").forEach((n) => (n.textContent = new Date().getFullYear()));
});
