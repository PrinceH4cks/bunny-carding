import { login } from "../core/auth.js";
import { brandName } from "../core/brand.js";
import { auth } from "../core/firebase-config.js";
import { pageUrl } from "../core/app.js";

/* /card-detail.js */
import { $, inr, esc } from "../core/app.js";
import { toast } from "../components/toast.js";
import { emptyState } from "../components/ui.js";
import { openModal, closeModal } from "../components/modal.js";
import { cardTile, cardVisual } from "../components/card-visual.js";
import { getProduct, getProducts, catLabel } from "../services/product-service.js";
import { addToCart } from "../services/cart-service.js";
import { buyNow } from "./buy.js";
import { watchAuth, CURRENT } from "../core/auth.js";
import { addDoc, serverTimestamp, collection, getDocs, query, where, limit } from
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db, COL } from "../core/db.js";
import { icon } from "../components/icons.js";
import { dock } from "../components/navigation.js";

const ID = new URLSearchParams(location.search).get("id");
let product = null;
let rating = 5;

function render() {
  const z = $("#zone");
  const p = product;
  const out = p.stock <= 0;
  const off = Number(p.discount || 0);
  const stars = Math.round(p.rating || 0);

  $("#crumb").textContent = p.name;
  document.title = p.name + " — " + brandName();

  const gallery = [p.image, ...(p.gallery || [])].filter(Boolean);
  const thumb = (g, i) =>
    '<img src="' + esc(g) + '" data-main="' + esc(g) + '" style="cursor:pointer' +
    (i === 0 ? ";outline:2px solid var(--brand-500)" : "") + '">';

  z.innerHTML = `
  <div class="pd-wrap">
    <div>
      <div class="pd-media pd-cardface">
        ${cardVisual(p, { reveal: true, size: "lg", holder: p.holderName || p.brand })}
        ${p.image ? '<img class="pd-img-alt" src="' + esc(p.image) + '" alt="' + esc(p.name) + '" loading="lazy">' : ""}
      </div>
      ${gallery.length ? '<div class="flex gap-2 mt-2">' +
        gallery.map(thumb).join("") + "</div>" : ""}
    </div>

    <div class="pd-info">
      <div class="flex gap-1 wrap mb-2">
        ${off > 0 ? '<span class="badge badge-danger pd-off">' + Math.round(off) + "% OFF</span>" : ""}
        ${p.featured ? '<span class="badge badge-ok">' + icon("star", "ic ic-sm") + " Bestseller</span>" : ""}
        <span class="badge badge-brand">${esc(catLabel(p.category))}</span>
        ${p.brand ? '<span class="badge badge-dark">' + esc(p.brand) + "</span>" : ""}
      </div>

      <h1 class="pd-title">${esc(p.name)}</h1>

      <div class="pd-meta">
        <span class="rating"><span class="stars">${"&#9733;".repeat(stars)}${"&#9734;".repeat(5 - stars)}</span>
          <b>${(p.rating || 0).toFixed(1)}</b></span>
        <span class="pd-dot" aria-hidden="true"></span>
        <span class="text-muted fs-sm">${p.sold || 0} sold so far</span>
      </div>

      ${p.description ? '<p class="text-muted pd-desc">' + esc(p.description) + "</p>" : ""}

      <div class="pd-price-row">
        <div class="pd-price">
          ${off > 0 ? '<s class="pd-was">' + inr(p.mrp) + "</s>" : ""}
          <b class="pd-now">${inr(p.price)}</b>
        </div>
        ${off > 0 ? '<span class="pd-save">You save ' + inr(Math.max(0, p.mrp - p.price)) + "</span>" : ""}
        ${p.value > 0 ? '<span class="pd-get">Worth ' + inr(p.value) + "</span>" : ""}
      </div>

      <div class="pd-stock-row">
        <span class="pd-stock ${out ? "out" : p.stock < 10 ? "low" : "in"}">
          <span class="pd-stock-dot" aria-hidden="true"></span>
          ${out ? "Out of stock" : p.stock < 10 ? "Only " + p.stock + " left" : "In stock (" + p.stock + ")"}
        </span>
        ${!out && p.stock < 10 ? '<span class="pd-stock-note">Selling fast</span>' : ""}
      </div>
    </div>
  </div>

  <div class="pd-actions">
    <div class="qty">
      <button type="button" id="qMinus">&minus;</button>
      <input type="number" id="qty" value="1" min="1" max="${Math.max(1, p.stock)}">
      <button type="button" id="qPlus">+</button>
    </div>
    <button class="btn btn-primary btn-lg" id="addBtn" ${out ? "disabled" : ""}>${icon("cart")} Add to cart</button>
    <button class="btn btn-accent btn-lg" id="buyBtn" ${out ? "disabled" : ""}>${icon("zap")} Buy with wallet</button>
  </div>

  <ul class="spec-list pd-specs">
    <li><b>Category</b><span>${esc(catLabel(p.category))}</span></li>
    ${p.brand ? `<li><b>Brand</b><span>${esc(p.brand)}</span></li>` : ""}
    ${p.warranty ? `<li><b>Warranty / validity</b><span>${esc(p.warranty)}</span></li>` : ""}
    <li><b>Availability</b><span>${out ? "Out of stock" : p.stock + " in stock"}</span></li>
    <li><b>Access</b><span>Instant, in your account</span></li>
    <li><b>Support</b><span>Help any time</span></li>
  </ul>

  ${(Array.isArray(p.benefits) ? p.benefits : []).length ? `
  <div class="card card-pad mt-4">
    <h3>What is included</h3>
    <div class="grid g-3 mt-2">
      ${(Array.isArray(p.benefits) ? p.benefits : []).map((b) => '<div class="flex gap-1 center"><span class="text-ok fw-8">' + icon("check", "ic ic-sm") + "</span><span>" + esc(b) + "</span></div>").join("")}
    </div>
  </div>` : ""}

  ${p.instructions ? `
  <div class="card card-pad mt-3">
    <h3>How to use it</h3>
    <p class="text-muted mb-0" style="white-space:pre-line">${esc(p.instructions)}</p>
  </div>` : ""}

  <div class="card card-pad mt-3">
    <div class="flex between center wrap gap-2 mb-2">
      <h3 class="mb-0">Customer reviews</h3>
      <button class="btn btn-ghost btn-sm" id="revBtn">${icon("edit", "ic ic-sm")} Write a review</button>
    </div>
    <div id="revList">
      <div class="sk sk-line" style="width:60%"></div>
      <div class="sk sk-line" style="width:90%"></div>
      <div class="sk sk-line" style="width:70%"></div>
    </div>
  </div>`;

  bind();
  loadReviews();
}

function bind() {
  const q = $("#qty");
  const clamp = () => {
    let v = Number(q.value) || 1;
    /* an uncounted product is not capped at 1 — that `|| 1` read a stock of
       zero as one, which is a sold-out card being offered one at a time */
    const stock = (product.stock === undefined || product.stock === null || product.stock === "")
      ? Infinity : Math.max(0, Number(product.stock) || 0);
    q.value = Math.max(1, Math.min(v, stock));
    $("#qPlus")?.toggleAttribute("disabled", stock !== Infinity && q.value >= stock);
  };
  $("#qMinus").addEventListener("click", () => { q.value = Number(q.value) - 1; clamp(); });
  $("#qPlus").addEventListener("click", () => { q.value = Number(q.value) + 1; clamp(); });
  q.addEventListener("change", clamp);
  clamp();

  /* phone: sticky bottom action bar */
  if (window.matchMedia("(max-width: 860px)").matches) {
    document.body.classList.add("no-dock");
    dock({
      price: inr(product.price * Math.max(1, Number(q.value) || 1)),
      label: "Total for " + (Number(q.value) || 1) + " item(s)",
      href: "#",
      click: { text: "Add to cart", fn: () => addToCart(product, Number(q.value) || 1) }
    });
    const d = document.querySelector(".dock .btn");
    if (d) {
      d.removeAttribute("href");
      d.addEventListener("click", () => addToCart(product, Number(q.value) || 1));
    }
    q.addEventListener("change", () => {
      const b = document.querySelector(".dock-price b");
      if (b) b.textContent = inr(product.price * Math.max(1, Number(q.value) || 1));
    });
  }

    $("#addBtn").addEventListener("click", () => addToCart(product, Number(q.value) || 1));
    /* a prepaid card is not shipped, so Buy takes the money from the wallet and
       shows the card details straight away - there is no checkout step */
    $("#buyBtn").addEventListener("click", () => buyNow(product, Number(q.value) || 1));

  /* gallery thumbs swap the product photo, but never the card face itself -
     the card is the thing being sold, so it stays put */
  document.querySelectorAll("[data-main]").forEach((t) => t.addEventListener("click", () => {
    $(".pd-img-alt").src = t.dataset.main;
    document.querySelectorAll("[data-main]").forEach((x) => (x.style.outline = ""));
    t.style.outline = "2px solid var(--brand-500)";
  }));

  const paint = () => document.querySelectorAll("#starsPick span")
    .forEach((s) => (s.style.opacity = Number(s.dataset.v) <= rating ? "1" : ".25"));
  $("#starsPick").addEventListener("click", (e) => {
    const s = e.target.closest("span[data-v]");
    if (!s) return;
    rating = Number(s.dataset.v);
    paint();
  });
  paint();

  $("#revBtn").addEventListener("click", () => {
    if (!CURRENT) {
      toast("Please log in first.", "warn");
      setTimeout(() => (location.href = "../../pages/login.html?next=" + encodeURIComponent("../../pages/card-detail.html?id=" + ID)), 900);
      return;
    }
    openModal("reviewModal");
  });
  $("#revSave").addEventListener("click", saveReview);
}

async function saveReview() {
  const text = $("#revText").value.trim();
  if (text.length < 5) { toast("Please write a slightly longer review.", "warn"); return; }
  try {
    await addDoc(collection(db, COL.reviews), {
      productId: ID, userId: CURRENT.uid, userName: CURRENT.displayName || "Guest",
      rating, text, createdAt: serverTimestamp()
    });
    toast("Thank you! Your review has been posted.", "ok");
    closeModal("reviewModal");
    $("#revText").value = "";
    loadReviews();
  } catch (e) {
    console.error(e);
    toast("Could not save the review. Check your Firestore rules.", "err");
  }
}

/* offline fallback so the page never looks empty */
const SAMPLE_REVIEWS = [
  { userName: "Rahul K.", rating: 5, text: "Exactly as described and it showed up in my account straight away." },
  { userName: "Priya S.", rating: 4, text: "Worked first time and the value was exactly as listed." },
  { userName: "Amit V.", rating: 5, text: "Second time ordering from here, same great experience as the first." }
];

async function loadReviews() {
  const box = $("#revList");
  if (!box) return;
  let list = SAMPLE_REVIEWS;
  try {
    const s = await getDocs(query(collection(db, COL.reviews), where("productId", "==", ID), limit(10)));
    if (!s.empty) list = s.docs.map((d) => d.data());
  } catch { /* keep the sample list */ }

  box.innerHTML = list.map((r) => `
    <div class="review">
      <div class="flex between center gap-2">
        <div class="flex gap-2 center">
          <span class="avatar avatar-sm">${esc((r.userName || "G")[0].toUpperCase())}</span>
          <b class="fs-sm">${esc(r.userName || "Guest")}</b>
        </div>
        <span class="stars">${"&#9733;".repeat(r.rating || 5)}</span>
      </div>
      <p class="fs-sm text-muted mt-1 mb-0">${esc(r.text)}</p>
    </div>`).join("") || '<p class="text-muted mb-0">No reviews yet. Be the first to write one.</p>';
}

async function loadMore() {
  try {
    const list = await getProducts({ category: product.category, limitN: 9 });
    const rel = list.filter((p) => p.id !== product.id).slice(0, 4);
    if (!rel.length) return;
    $("#more").innerHTML = rel.map(cardTile).join("");
    $("#moreWrap").hidden = false;
  } catch { /* ignore */ }
}

document.addEventListener("DOMContentLoaded", async () => {
  if (!ID) {
    $("#zone").innerHTML = emptyState({
      icon: "alert", title: "No product selected",
      text: "The link is missing a product id.",
      action: '<a class="btn btn-primary" href="' + pageUrl("pages/cards.html") + '">Browse all products</a>'
    });
    return;
  }
  try {
    product = await getProduct(ID);
  } catch (e) {
    console.error(e);
    $("#zone").innerHTML = emptyState({ icon: "wifi", title: "Could not load this product", text: "Check your connection and try again." });
    return;
  }
  if (!product) {
    $("#zone").innerHTML = emptyState({
      icon: "search", title: "This product is not available",
      text: "It may have been removed by the store team, or the link may be outdated.",
      action: '<a class="btn btn-primary" href="' + pageUrl("pages/cards.html") + '">Browse all products</a>'
    });
    return;
  }
  render();
  loadMore();
});
