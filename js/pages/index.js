import { db } from "../core/db.js";
import { pageUrl } from "../core/app.js";

/* /index.js  (home page) */
import { $, esc } from "../core/app.js";
import { emptyState } from "../components/ui.js";
  import { cardTile, skTiles } from "../components/card-visual.js";
import { getProducts, seedIfEmpty, CATEGORIES } from "../services/product-service.js";
import { icon } from "../components/icons.js";

/* category grid, driven by CATEGORIES in db.js */
function paintCats(counts) {
  const box = $("#catGrid");
  if (!box) return;
  box.className = "grid g-4";
  box.innerHTML = CATEGORIES.map((c, i) =>
    '<a href="' + pageUrl("pages/cards.html") + '" class="card card-pad card-hover text-center anim-up anim-d' + ((i % 4) + 1) + '">' +
      '<div class="f-icon' + (i % 3 === 1 ? " alt" : i % 3 === 2 ? " ok" : "") + '" style="margin:0 auto 16px">' + icon(c.icon) + "</div>" +
      '<h3 class="mb-1">' + esc(c.label) + "</h3>" +
      '<p class="fs-sm text-muted mb-0">' + ((counts && counts[c.key]) || 0) + " products</p>" +
    "</a>").join("");
}

  /* the real category tile is a centred .f-icon, then a title, then a count.
     Holding that shape keeps the section the same height while the query runs,
     instead of collapsing to a couple of thin lines and snapping back. */
  function skCats(n) {
    const box = $("#catGrid");
    if (!box) return;
    box.className = "grid g-4";
    box.innerHTML = Array.from({ length: n }, () =>
      '<div class="card card-pad text-center" aria-hidden="true">' +
        '<div class="sk sk-cat-icon"></div>' +
        '<div class="sk sk-title" style="width:62%;margin:0 auto 12px"></div>' +
        '<div class="sk sk-line" style="width:40%;height:10px;margin:0 auto"></div>' +
      "</div>").join("");
  }

  /* live "N products" line under the showcase heading */
  function paintCount(n) {
    const el = $("#collectionCount");
    if (!el) return;
    el.textContent = n === 1 ? "1 product" : n + " products";
  }

  async function loadFeatured() {
    const box = $("#featured");
    if (!box) return;
    /* paint the real tile shape first, so the finished grid lands in place
       rather than shoving the rest of the page down when data arrives */
    box.className = "grid g-auto-lg";
    box.innerHTML = skTiles(6);
    skCats(CATEGORIES.length);
    try {
      await seedIfEmpty();
      /* one query feeds both the showcase and the category counts */
      const all = await getProducts({ sort: "popular", limitN: 500 });
      box.className = "grid g-auto-lg";
      box.innerHTML = all.length ? all.map(cardTile).join("") : emptyState({
        icon: "box", title: "No products yet",
        text: "Add your first product from the admin panel to see it here.",
        action: '<a class="btn btn-primary" href="' + pageUrl("pages/cards.html") + '">Browse the store</a>'
      });
      paintCount(all.length);

      const counts = {};
      all.forEach((p) => { counts[p.category] = (counts[p.category] || 0) + 1; });
      paintCats(counts);
  } catch (e) {
    console.error(e);
      box.className = "grid g-auto-lg";
      box.innerHTML = emptyState({
        icon: "wifi", title: "Could not load products",
        text: "Check your internet connection and try again in a moment.",
        action: '<button class="btn btn-primary" onclick="location.reload()">Retry</button>'
      });
      paintCount(0);
      paintCats(null);
  }
}

document.addEventListener("DOMContentLoaded", loadFeatured);
