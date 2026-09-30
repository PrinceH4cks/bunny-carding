import { db } from "../core/db.js";

/* js/cards.js  (product listing, filters, sorting) */
import { brandName } from "../core/brand.js";
import { $, $$, esc } from "../core/app.js";
import { emptyState } from "../components/ui.js";
import { getProducts, seedIfEmpty, CATEGORIES, catLabel } from "../services/product-service.js";
import { cardTile, skTiles } from "../components/card-visual.js";
import { icon } from "../components/icons.js";

/* How many cards are shown to begin with, and how many more arrive each time the
   bottom of the list comes into view. The list was cut into pages of twelve with
   a row of numbers under it — Prev, 1, 2, ..., 6, Next — and finding the fourth
   page meant working out which of the numbers was the ellipsis and pressing it
   twice. It then became a button, which was better but still asked the reader to
   decide when to stop. Cards now arrive as the list is scrolled, which is how a
   shopfront is actually looked at. */
const FIRST_SHOWN = 12;
const MORE_EACH_TIME = 12;
const state = { all: [], shown: FIRST_SHOWN, filters: { category: "all", brand: "", q: "", min: "", max: "", sort: "all" } };

const CARD_CATS = [
  { key: "prepaid",    label: "Prepaid cards",  icon: "credit-card" },
  { key: "gift",       label: "Gift cards",     icon: "gift"       },
  { key: "subscribe",  label: "Subscriptions",  icon: "play"       },
  { key: "gaming",     label: "Gaming credit",  icon: "dumbbell"   },
  { key: "travel",     label: "Travel cards",   icon: "map-pin"    },
  { key: "shopping",   label: "Shopping",       icon: "cart"       },
  { key: "utility",    label: "Utility",        icon: "building"   },
  { key: "fuel",       label: "Fuel",           icon: "truck"      }
];

function paintFilterCats() {
  $("#catFilter").innerHTML =
    '<label class="check"><input type="radio" name="cat" value="all" checked> ' + icon("layers", "ic ic-sm") + " All products</label>" +
    CARD_CATS.map((c) =>
      '<label class="check"><input type="radio" name="cat" value="' + c.key + '"> ' +
      icon(c.icon, "ic ic-sm") + " " + esc(c.label) + "</label>").join("");
}

function readURL() {
  const p = new URLSearchParams(location.search);
  const f = state.filters;
  f.category = p.get("category") || "all";
  f.q = p.get("q") || "";
  f.sort = p.get("sort") || "all";
  f.brand = p.get("brand") || "";
}

function filtered() {
  const f = state.filters;
  let list = state.all.filter((p) => {
    if (f.category !== "all" && p.category !== f.category) return false;
    if (f.brand && p.brand !== f.brand) return false;
    if (f.min && p.price < Number(f.min)) return false;
    if (f.max && p.price > Number(f.max)) return false;
    if (f.q) {
      const s = f.q.toLowerCase();
      const hay = (p.name + " " + p.brand + " " + p.network + " " + p.category + " " + p.description).toLowerCase();
      if (!hay.includes(s)) return false;
    }
    return true;
  });

  /* "All" is the order the owner set in the panel, which is what the list
     arrives in — so an untouched shop looks the same as it always did, and a
     card they have moved is where they put it. A card with no position keeps
     the place it came in at rather than jumping to the top. */
  const at = (p) => (Number.isFinite(p.rank) ? p.rank : 1e6 + state.all.indexOf(p));

  const s = {
    all:     (a, b) => at(a) - at(b),
    new:     (a, b) => ((b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)),
    cheap:   (a, b) => a.price - b.price,
    high:    (a, b) => b.price - a.price,
    popular: (a, b) => (b.sold || 0) - (a.sold || 0),
    rating:  (a, b) => (b.rating || 0) - (a.rating || 0)
  };
  list.sort(s[f.sort] || s.all);
  return list;
}

function render() {
  const list = filtered();
  const box = $("#list");
  const total = list.length;
  /* the filters can leave fewer cards than are already on screen, so the count
     is pulled back to what is actually here rather than left too high */
  state.shown = Math.min(Math.max(FIRST_SHOWN, state.shown || FIRST_SHOWN), Math.max(total, FIRST_SHOWN));
  const slice = list.slice(0, state.shown);

  $("#count").textContent = total + " card" + (total === 1 ? "" : "s");

  box.innerHTML = total ? slice.map(cardTile).join("") : emptyState({
    icon: "search", title: "No cards found",
    text: "Try adjusting your filters, or ask the store team to add what you need.",
    action: '<button class="btn btn-primary" id="clr">Reset filters</button>'
  });

  $("#clr")?.addEventListener("click", resetAll);
  watchForMore();
  renderHead();
}

/* The empty strip under the grid that more cards arrive into. It is watched
   rather than the scroll position, so nothing has to be measured on every frame
   of a scroll — and it fires slightly before the reader reaches the bottom, so
   the next dozen are usually already there by the time they are wanted. */
let moreWatch = null;
function watchForMore() {
  const edge = $("#pager");
  if (!edge || !("IntersectionObserver" in window)) return;
  moreWatch?.disconnect();
  moreWatch = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    const shown = state.shown || FIRST_SHOWN;
    if (shown >= filtered().length) return;
    state.shown = shown + MORE_EACH_TIME;
    render();
  }, { rootMargin: "500px 0px" });
  moreWatch.observe(edge);
}

function renderHead() {
  const label = state.filters.category === "all" ? "All Cards" : (CARD_CATS.find((c) => c.key === state.filters.category)?.label || "All Cards");
  const sub = state.filters.category === "all"
    ? "Prepaid cards, gift cards, subscriptions and gaming credit — pick a card, pay, and the details reach your wallet instantly."
    : "Every card in the " + label + " category, with the value shown up front.";

  /* every one of these is optional — a missing heading must never take the
     product grid down with it */
  const set = (sel, text) => { const n = $(sel); if (n) n.textContent = text; };

  set("#pgTitle", state.filters.q ? '"' + state.filters.q + '"' : label);
  set("#crumb", label);
  set("#pgSub", sub);
  if (state.filters.q) document.title = state.filters.q + " — " + brandName();
}


function fillBrands() {
  const brands = [...new Set(state.all.map((p) => p.brand).filter(Boolean))].sort();
  $("#brandFilter").innerHTML = '<option value="">All brands</option>' +
    brands.map((b) => '<option value="' + esc(b) + '">' + esc(b) + "</option>").join("");
  $("#brandFilter").value = f_brand();
}
const f_brand = () => state.filters.brand;

function resetAll() {
  state.filters = { category: "all", brand: "", q: "", min: "", max: "", sort: "all" };
  state.shown = FIRST_SHOWN;
  syncInputs();
  pushURL();
  render();
}

/* The fade on the right edge is only honest while there is actually more to
   scroll to, so it is toggled from the live scroll position instead of being
   hard-coded for every phone. */
function markOverflow() {
  const box = $("#chips");
  if (!box) return;
  const more = box.scrollWidth - box.clientWidth - box.scrollLeft > 4;
  box.toggleAttribute("data-more", more);
  if (more) box.dataset.more = "1"; else box.removeAttribute("data-more");
}

function syncInputs() {
  const f = state.filters;
  $("#q").value = f.q;
  $("#pMin").value = f.min;
  $("#pMax").value = f.max;
  $("#sort").value = f.sort;
  $("#brandFilter").value = f.brand;
  const r = $('#catFilter input[value="' + f.category + '"]') || $("#catFilter input");
  if (r) r.checked = true;
  $$("#chips .srt-btn").forEach((c) => {
    const on = c.dataset.quick === f.sort;
    c.classList.toggle("is-on", on);
    c.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function pushURL() {
  const f = state.filters;
  const p = new URLSearchParams();
  if (f.category !== "all") p.set("category", f.category);
  if (f.brand) p.set("brand", f.brand);
  if (f.q) p.set("q", f.q);
  if (f.sort !== "all") p.set("sort", f.sort);
  const q = p.toString();
  history.replaceState(null, "", q ? "../../pages/cards.html?" + q : "../../pages/cards.html");
}

document.addEventListener("DOMContentLoaded", async () => {
  paintFilterCats();
  readURL();
  syncInputs();

  /* The filter rail carries "hidden" in the markup. It has to be resolved before
     the products are fetched, otherwise the grid keeps a different layout for
     the whole loading phase and the page jumps once the data lands.
     The rail only shows when there is room for it beside two card columns; on
     anything narrower the Filters button takes over and opens it in a modal, so
     the two are always swapped together. */
  const mq = window.matchMedia("(max-width: 1199px)");
  const applyMq = () => {
    const narrow = mq.matches;
    $("#filterBox").classList.toggle("hidden", narrow);
    $("#openFilters").classList.toggle("hidden", !narrow);
  };
  applyMq();
  mq.addEventListener("change", applyMq);

  const box = $("#list");
  box.innerHTML = skTiles(9);

  try {
    await seedIfEmpty();
    state.all = await getProducts({ onlyActive: true, limitN: 500 });
    fillBrands();
    render();
  } catch (e) {
    console.error(e);
    box.innerHTML = emptyState({
      icon: "wifi", title: "Could not load products",
      text: "Check your internet connection and your Firestore rules.",
      action: '<button class="btn btn-primary" onclick="location.reload()">Retry</button>'
    });
    $("#count").textContent = "";
  }

  let t;
  $("#q").addEventListener("input", (e) => {
    clearTimeout(t);
    t = setTimeout(() => { state.filters.q = e.target.value.trim(); state.shown = FIRST_SHOWN; pushURL(); render(); }, 280);
  });
  $("#catFilter").addEventListener("change", (e) => { state.filters.category = e.target.value; state.shown = FIRST_SHOWN; pushURL(); render(); });
  $("#brandFilter").addEventListener("change", (e) => { state.filters.brand = e.target.value; state.shown = FIRST_SHOWN; pushURL(); render(); });
  $("#priceBtn").addEventListener("click", () => {
    state.filters.min = $("#pMin").value.trim();
    state.filters.max = $("#pMax").value.trim();
    state.shown = FIRST_SHOWN; render();
  });
  $("#chips").addEventListener("click", (e) => {
    const c = e.target.closest(".srt-btn");
    if (!c) return;
    state.filters.sort = c.dataset.quick;
    state.shown = FIRST_SHOWN; syncInputs(); pushURL(); render();
    /* keep the chosen pill in view when it sits off the right edge */
    c.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  });
  $("#resetFilters").addEventListener("click", resetAll);

  markOverflow();
  $("#chips").addEventListener("scroll", markOverflow, { passive: true });
  let rt;
  window.addEventListener("resize", () => {
    clearTimeout(rt);
    rt = setTimeout(markOverflow, 120);
  });

  $("#openFilters").addEventListener("click", () => {
    const box2 = $("#filterBox");
    const home = box2.parentNode;
    const m = document.createElement("div");
    m.className = "modal-back open";
    m.innerHTML = '<div class="modal">' +
      '<div class="modal-head"><h3>Filters</h3><button class="x-btn" data-x>' + icon("x") + "</button></div>" +
      '<div class="modal-body" id="mFilter"></div>' +
      '<div class="modal-foot"><button class="btn btn-ghost" data-x>Close</button></div></div>';
    document.body.appendChild(m);
    m.querySelector("#mFilter").appendChild(box2);
    box2.classList.remove("hidden");
    const close = () => { home.appendChild(box2); applyMq(); m.remove(); };
    m.querySelectorAll("[data-x]").forEach((b) => b.addEventListener("click", close));
    m.addEventListener("click", (ev) => { if (ev.target === m) close(); });
  });
});
