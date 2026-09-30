import { auth } from "../core/firebase-config.js";

/* PANEL - js/products.js */
import { $, $$, inr, esc, field, formData, setError, timeAgo } from "../core/app.js";
import { toast } from "../components/toast.js";
import { skCards, emptyState } from "../components/ui.js";
import { openModal, closeModal, confirmBox } from "../components/modal.js";
import { getProducts, upsertProduct, removeProduct, setProductFlag, seedIfEmpty, CATEGORIES } from "../services/product-service.js";
import { requireAdmin } from "../core/auth.js";
import { updateDoc, writeBatch, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db, COL } from "../core/db.js";
import { icon } from "../components/icons.js";
import { cardVisual, NETWORKS } from "../components/card-visual.js";

let ALL = [];
let filter = "all";
let sort = "manual";
let query = "";
let editing = null;
let stockTarget = null;
let delTarget = null;

async function load() {
  try {
    await seedIfEmpty();
    ALL = await getProducts({ onlyActive: false, limitN: 500 });
    /* the owner's own order, so the first card they see is the first card they
       put at the top */
    if (sort === "manual") ALL = ordered(ALL);
    render();
  } catch (e) {
    console.error(e);
    const grid = $("#grid");
    if (grid) {
      grid.innerHTML = '<div class="alert alert-err">' + icon("alert") +
        "<div><b>Could not load products</b><br>" + esc(e.message || "Check your Firestore rules.") + "</div></div>";
    }
    toast("Could not load products.", "err");
  }
}

function filtered() {
  let l = ALL.slice();
  if (filter === "low") l = l.filter((p) => p.stock > 0 && p.stock < 10);
  if (filter === "out") l = l.filter((p) => p.stock <= 0);
  if (filter === "active") l = l.filter((p) => p.active);
  if (filter === "hidden") l = l.filter((p) => !p.active);
  if (filter === "featured") l = l.filter((p) => p.featured);
  if (query) {
    const v = query.toLowerCase();
    l = l.filter((p) => (p.name + " " + p.brand + " " + p.category + " " + p.description).toLowerCase().includes(v));
  }
  const s = {
    /* the order the owner set, which is the order the cards were created until
       they move one */
    manual:   (a, b) => {
      const ra = Number.isFinite(a.rank) ? a.rank : 1e6 + ALL.indexOf(a);
      const rb = Number.isFinite(b.rank) ? b.rank : 1e6 + ALL.indexOf(b);
      return ra - rb;
    },
    new:       (a, b) => ((b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)),
    name:      (a, b) => a.name.localeCompare(b.name),
    lowStock:  (a, b) => a.stock - b.stock,
    highStock: (a, b) => b.stock - a.stock,
    highPrice: (a, b) => b.price - a.price
  };
  l.sort(s[sort] || s.new);
  return l;
}

/* "gift-cards" is what is stored; "Gift cards" is what a person reads. The
   list was showing the stored spelling, which is a detail of the database
   rather than of the shop. Anything not in the table is turned into words
   instead of being passed through, so a category added later still reads
   properly rather than showing as a slug. */
const CATEGORY_WORDS = {
  "gift-cards": "Gift cards",
  "giftcard": "Gift card",
  "subscriptions": "Subscriptions",
  "gaming": "Gaming",
  "food": "Food & dining",
  "travel": "Travel",
  "shopping": "Shopping",
  "entertainment": "Entertainment",
  "utility": "Utility bills",
  "mobile": "Mobile recharge",
  "others": "Others",
  "other": "Others"
};
const catLabel = (k) => {
  const key = String(k || "").trim();
  if (!key) return "Uncategorised";
  if (CATEGORY_WORDS[key]) return CATEGORY_WORDS[key];
  return key.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
};

/* The line under the card's name. It used to be the brand, a middot, and the
   age — so a card with no date yet read "Amazon ·", a dot pointing at nothing.
   Each piece is added only when it is there. */
const cardSub = (p) => {
  const bits = [];
  if (p.brand) bits.push(esc(p.brand));
  const age = timeAgo(p.createdAt);
  if (age) bits.push(esc(age));
  return bits.length ? bits.join(" &middot; ") : "—";
};

/* The list, as a grid of cards.

   A seven-column table cannot be read on a phone and cannot be worked in
   either: choosing three cards to hide was three round trips of one at a time,
   and moving a card meant a card that had to be written somewhere by hand. So
   the list is cards now, on every screen, carrying what the table had and three
   things it did not: a checkbox, a position, and a way to move a card up or
   down.

   Everything here is UI. The data calls, the flags and the save paths are the
   ones that were already there.
*/

/* ---------- choosing several cards at once ---------- */
const selected = new Set();

function paintSelection() {
  const n = selected.size;
  const bar = $("#pickBar");
  if (!bar) return;
  /* a card that has been deleted, or filtered out of sight, must not stay
     counted as chosen — it would be included in the next bulk change to a card
     nobody can see */
  for (const id of [...selected]) if (!ALL.some((p) => p.id === id)) selected.delete(id);

  bar.hidden = selected.size === 0;
  $("#pickCount").textContent = selected.size === 1 ? "1 card selected" : selected.size + " cards selected";

  const all = $("#pickAll");
  /* only the cards on screen can be chosen, so only they count towards "all" */
  const shown = $$(".pcard:not([hidden])").length;
  if (all) {
    all.checked = shown > 0 && selected.size === shown;
    all.indeterminate = selected.size > 0 && selected.size < shown;
  }
}

async function bulkSet(flag, value, said) {
  const ids = [...selected];
  if (!ids.length) return;
  const bar = $("#pickBar");
  bar?.setAttribute("aria-busy", "true");
  try {
    for (const id of ids) await setProductFlag(id, flag, value);
    toast(said(ids.length), "ok");
    selected.clear();
    await load();
  } catch (e) {
    console.error(e);
    toast("Could not update " + ids.length + " card(s).", "err");
  } finally {
    /* it has to go on the way out as well as on the way in: the bar is hidden
       when the work is done, so a flag left behind comes back with the next
       pick-up and stops the buttons from being pressed at all */
    bar?.removeAttribute("aria-busy");
  }
}

async function bulkDelete() {
  const ids = [...selected];
  if (!ids.length) return;
  const names = ids.map((id) => (ALL.find((p) => p.id === id) || {}).name).filter(Boolean);
  const ok = await confirmBox({
    title: ids.length === 1 ? "Delete this card?" : "Delete " + ids.length + " cards?",
    text: ids.length === 1
      ? "\"" + (names[0] || "This card") + "\" cannot be brought back."
      : "These cannot be brought back:\n" + names.slice(0, 8).join("\n") + (names.length > 8 ? "\nand " + (names.length - 8) + " more" : ""),
    ok: "Delete " + ids.length
  });
  if (!ok) return;
  const bar = $("#pickBar");
  bar?.setAttribute("aria-busy", "true");
  try {
    for (const id of ids) await removeProduct(id);
    toast(ids.length + " card(s) deleted.", "ok");
    selected.clear();
    await load();
  } catch (e) {
    console.error(e);
    toast("Could not delete them.", "err");
  } finally {
    bar?.removeAttribute("aria-busy");
  }
}

/* ---------- order ---------- */

/* The order the owner put the cards in is kept on the card itself, as `rank`, so
   it survives a reload and reads the same on a phone and a desktop. A card that
   has never been moved has no rank and keeps the order it arrived in. */
const ordered = (list) => list.slice().sort((a, b) => {
  const ra = Number.isFinite(a.rank) ? a.rank : 1e6 + ALL.indexOf(a);
  const rb = Number.isFinite(b.rank) ? b.rank : 1e6 + ALL.indexOf(b);
  return ra - rb;
});

async function move(id, dir) {
  const list = ordered(ALL);
  const at = list.findIndex((p) => p.id === id);
  const to = at + dir;
  if (at < 0 || to < 0 || to >= list.length) return;

  list.splice(to, 0, list.splice(at, 1)[0]);

  /* The whole list is given a position, and written in one batch.

     Swapping the two numbers of the two cards involved was not enough. A rank is
     only ever written on the cards that have been touched, so after one move two
     cards had a position and the rest had none — and the panel and the shop then
     disagree about where the untouched ones go, because the panel sorts them by
     the order they arrived in and the shop sorts them by whatever order the
     database returned. It read as the reorder not having happened.

     Every card now carries its real position, so there is one order, and the
     panel and the shop are looking at the same list. It is a batch rather than a
     few separate writes because a hundred small round trips is how a click turns
     into a wait. */
  const card = document.querySelector('.pcard[data-id="' + id + '"]');
  card?.setAttribute("aria-busy", "true");
  try {
    const batch = writeBatch(db);
    list.forEach((p, i) => {
      p.rank = i;
      batch.update(doc(db, COL.products, p.id), { rank: i, updatedAt: serverTimestamp() });
    });
    await batch.commit();
    ALL = ordered(ALL);
    render();
    toast("Moved to position " + (to + 1) + ".", "ok");
  } catch (e) {
    console.error(e);
    card?.removeAttribute("aria-busy");
    toast("Could not move the card.", "err");
  }
}

/* ---------- the cards ---------- */
/* One card, as markup. Kept on its own so the node can be rebuilt without
   repeating it, and so it is obvious what a card is made of. */
function cardHTML(p, where, total) {
  const stockCls = p.stock <= 0 ? "out" : p.stock < 10 ? "low" : "in";
  const stockWord = p.stock <= 0 ? "Out of stock" : p.stock < 10 ? "Only " + p.stock + " left" : p.stock + " in stock";
  return `
  <article class="pcard ${p.active ? "" : "is-hidden"} ${p.featured ? "is-featured" : ""}" data-id="${esc(p.id)}">
    <div class="pcard-top">
      <label class="pcard-pick" title="Select ${esc(p.name)}">
        <input type="checkbox" class="js-pick" data-id="${esc(p.id)}" aria-label="Select ${esc(p.name)}">
      </label>
      <span class="pcard-pos" title="Position ${where + 1} of ${total}">${where + 1}</span>
      <div class="pcard-face">${cardVisual(p, { size: "sm" })}</div>
    </div>

    <div class="pcard-body">
      <div class="pcard-title">
        <b>${esc(p.name)}</b>
        <small class="text-muted">${cardSub(p)}</small>
      </div>

      <div class="pcard-badges">
        <span class="badge badge-brand">${esc(catLabel(p.category))}</span>
        ${p.active ? '<span class="badge badge-ok badge-dot">Live</span>' : '<span class="badge badge-dark badge-dot">Hidden</span>'}
        ${p.featured ? '<span class="badge badge-warn">Featured</span>' : ""}
      </div>

      <dl class="pcard-facts">
        <div><dt>Price</dt><dd class="num">${inr(p.price)}</dd></div>
        <div><dt>Customer gets</dt><dd class="num ${p.value ? "text-ok" : ""}">${p.value ? inr(p.value) : "—"}</dd></div>
        <div><dt>Stock</dt><dd class="num ${stockCls === "out" ? "text-danger" : stockCls === "low" ? "text-accent" : "text-ok"}" title="${esc(stockWord)}">${p.stock}</dd></div>
        <div><dt>Sold</dt><dd class="num">${p.sold || 0}</dd></div>
      </dl>
    </div>

    <div class="pcard-actions">
      <button class="btn btn-ghost btn-xs js-up" data-id="${esc(p.id)}" title="Move up" aria-label="Move ${esc(p.name)} up" ${where === 0 ? "disabled" : ""}>${icon("chevron-up", "ic ic-sm")}</button>
      <button class="btn btn-ghost btn-xs js-down" data-id="${esc(p.id)}" title="Move down" aria-label="Move ${esc(p.name)} down" ${where === total - 1 ? "disabled" : ""}>${icon("chevron-down", "ic ic-sm")}</button>
      <span class="pcard-gap"></span>
      <button class="btn btn-ghost btn-xs js-toggle" data-id="${esc(p.id)}" title="${p.active ? "Hide from the store" : "Put back in the store"}" aria-label="${p.active ? "Hide" : "Show"} ${esc(p.name)}">${icon(p.active ? "eye" : "eye-off", "ic ic-sm")}</button>
      <button class="btn btn-ghost btn-xs js-feat" data-id="${esc(p.id)}" title="${p.featured ? "Remove featured" : "Mark featured"}" aria-label="${p.featured ? "Remove" : "Make"} ${esc(p.name)} featured">${icon("star", "ic ic-sm")}</button>
      <button class="btn btn-primary btn-xs js-edit" data-id="${esc(p.id)}" title="Edit" aria-label="Edit ${esc(p.name)}">${icon("edit", "ic ic-sm")}</button>
      <button class="btn btn-danger btn-xs js-del" data-id="${esc(p.id)}" title="Delete" aria-label="Delete ${esc(p.name)}">${icon("trash", "ic ic-sm")}</button>
    </div>
  </article>`;
}

/* What a card's own markup depends on. A card is only rebuilt when one of these
   changes — being chosen, filtered out or re-sorted is not one of them. */
const cardSig = (p, where, total) =>
  [p.name, p.brand, p.category, p.price, p.mrp, p.value, p.stock, p.sold,
   p.active, p.featured, p.image, p.network, p.cardNo, p.expiry, p.holderName,
   p.createdAt?.seconds, where, total].join("");

/* The cards already built, by product id.
   Sixty cards is about 229KB of markup, and a search box re-rendered it on every
   keystroke: 150ms of frozen panel per filter click, 700ms to move one card and
   redraw. The picture of a bank card inside each box is most of that weight and
   none of it changes while you type. So the cards are built once and then only
   shown, hidden and put in order. */
const nodes = new Map();
let emptyNode = null;

function paintCard(el, p) {
  el.classList.toggle("is-hidden", !p.active);
  el.classList.toggle("is-featured", !!p.featured);
  const picked = selected.has(p.id);
  el.classList.toggle("is-picked", picked);
  const box = el.querySelector(".js-pick");
  if (box) box.checked = picked;
}

function render() {
  const list = filtered();
  $("#count").textContent = list.length === 1 ? "1 card" : list.length + " cards";

  const grid = $("#grid");
  if (!grid) return;

  const total = ALL.length;
  const where = new Map(ALL.map((p, i) => [p.id, i]));

  /* Clear out anything in the grid that is not a card we are keeping — the
     skeleton placeholders in particular. They used to disappear because
     render() replaced the grid wholesale; now that it no longer does, they
     would sit under the real cards for good. */
  const kept = new Set([...nodes.values()].map((h) => h.el));
  if (emptyNode) kept.add(emptyNode);
  for (const child of [...grid.children]) if (!kept.has(child)) child.remove();

  /* build what is new, and rebuild only the cards whose own details changed */
  for (const p of ALL) {
    const at = where.get(p.id);
    const sig = cardSig(p, at, total);
    const held = nodes.get(p.id);
    if (held && held.sig === sig) continue;
    const tpl = document.createElement("template");
    tpl.innerHTML = cardHTML(p, at, total).trim();
    const el = tpl.content.firstElementChild;
    if (!el) continue;
    if (held) held.el.replaceWith(el);
    else grid.appendChild(el);
    paintCard(el, p);
    nodes.set(p.id, { el, sig });
  }

  /* forget the cards that are no longer there, so their nodes cannot be counted */
  for (const [id, held] of nodes) {
    if (where.has(id)) continue;
    held.el.remove();
    nodes.delete(id);
  }

  /* order and show. A grid lays its children out in `order`, so changing the
     sort or moving a card is a number per node rather than new markup. */
  list.forEach((p, i) => {
    const held = nodes.get(p.id);
    if (!held) return;
    held.el.hidden = false;
    held.el.style.order = String(i);
  });
  const shown = new Set(list.map((p) => p.id));
  for (const [id, held] of nodes) if (!shown.has(id)) { held.el.hidden = true; held.el.style.order = ""; }

  if (!list.length) {
    if (!emptyNode) {
      emptyNode = document.createElement("div");
      emptyNode.className = "pcard-empty";
      grid.appendChild(emptyNode);
    }
    emptyNode.hidden = false;
    const searching = !!query;
    emptyNode.innerHTML = emptyState({
      icon: searching ? "search" : "cart",
      title: searching ? 'No results for "' + query + '"' : "No cards yet",
      text: searching ? "Try a different search term, or clear the filter." : "Add your first card to get started.",
      action: searching ? "" : '<button class="btn btn-primary" id="e1">Add a card</button>'
    });
    emptyNode.querySelector("#e1")?.addEventListener("click", () => openEditor(null));
  } else if (emptyNode) {
    emptyNode.hidden = true;
  }

  paintSelection();
}

const findProduct = (id) => ALL.find((p) => p.id === id);

async function toggleFeatured(id, btn) {
  const p = findProduct(id);
  if (!p) return;
  btn.disabled = true;
  try {
    await setProductFlag(id, "featured", !p.featured);
    toast(!p.featured ? "Added to featured cards." : "Removed from featured cards.", "ok");
    await load();
  } catch (e) {
    console.error(e);
    toast("Could not update the card.", "err");
    btn.disabled = false;
  }
}

/* Hide one card from the store, or put it back. The bulk bar does this for
   several at once; this is the one a single card needs, and it sits last on the
   card because it is the one an owner presses most and least often. */
async function toggleVisible(id, btn) {
  const p = findProduct(id);
  if (!p) return;
  btn.disabled = true;
  try {
    await setProductFlag(id, "active", !p.active);
    toast(p.active ? "Hidden from the store." : "Back in the store.", "ok");
    await load();
  } catch (e) {
    console.error(e);
    toast("Could not update the card.", "err");
    btn.disabled = false;
  }
}

/* ---------- the buttons on a card ---------- */

/* One pair of listeners for the whole grid rather than fourteen for every card.
   With the cards kept in the page, binding per card would mean binding them
   again on every rebuild, which is the other half of why typing felt heavy. */
function bindRows() {
  const grid = $("#grid");
  if (!grid) return;

  grid.addEventListener("click", (e) => {
    const b = e.target.closest("[data-id]");
    if (!b || !grid.contains(b)) return;
    const id = b.dataset.id;
    if (b.classList.contains("js-edit")) openEditor(findProduct(id));
    else if (b.classList.contains("js-del")) openDelete(findProduct(id));
    else if (b.classList.contains("js-up")) move(id, -1);
    else if (b.classList.contains("js-down")) move(id, 1);
    else if (b.classList.contains("js-feat")) toggleFeatured(id, b);
    else if (b.classList.contains("js-toggle")) toggleVisible(id, b);
    else if (b.classList.contains("js-stock")) openStock(findProduct(id));
  });

  grid.addEventListener("change", (e) => {
    const c = e.target.closest(".js-pick");
    if (!c) return;
    if (c.checked) selected.add(c.dataset.id); else selected.delete(c.dataset.id);
    c.closest(".pcard")?.classList.toggle("is-picked", c.checked);
    paintSelection();
  });
}

/* ---------- editor ---------- */
function openEditor(p) {
  editing = p;
  const f = $("#pForm");
  f.reset();

  /* Every field is reached through field(), and only written to if it is there.
     Reaching through the form object instead — f.brand, f.value — works for most
     names and quietly does not for the ones that collide with a form's own
     properties, and then the whole function throws on the first of them. Because
     the throw happened before the dialog was opened, the one button an owner
     comes here to press did nothing at all and raised nothing either: a card
     could not be created or edited from the panel. Writing to a field that is
     not on the form is therefore allowed here, and simply skipped. */
  const set = (name, v) => {
    const el = field(f, name);
    if (el) el.value = v ?? "";
  };
  const check = (name, on) => {
    const el = field(f, name);
    if (el) el.checked = !!on;
  };

  $("#mTitle").textContent = p ? "Edit: " + p.name : "Add a new product";
  set("name", p?.name);
  set("brand", p?.brand);
  set("category", p?.category || "other");
  set("mrp", p?.mrp);
  set("price", p?.price);
  set("stock", p?.stock ?? "");
  set("warranty", p?.warranty);
  set("value", p?.value);
  set("network", p?.network || "visa");
  set("instructions", p?.instructions);
  /* stashed on the field so an accidental clear cannot wipe the card */
  set("cardNo", p?.cardNo);
  set("expiry", p?.expiry);
  set("pin", p?.pin);
  set("cvv", p?.cvv);
  for (const n of ["cardNo", "expiry", "pin", "cvv"]) {
    const el = field(f, n);
    if (el) el.dataset.existing = p?.[n] || "";
  }
  set("holderName", p?.holderName || "CARD HOLDER");
  check("nfc", p ? p.nfc !== false : true);
  paintPreview();
  set("description", p?.description);
  set("benefits", (p?.benefits || []).join("\n"));
  check("featured", !!p?.featured);
  check("active", p ? !!p.active : true);

  openModal("pModal");
}

const openStock = (p) => { stockTarget = p; $("#sName").textContent = p.name; $("#sInput").value = p.stock; openModal("sModal"); };
const openDelete = (p) => {
  delTarget = p;
  $("#dMsg").innerHTML = "<b>" + esc(p.name) + "</b> will be removed permanently. Existing orders are not affected.";
  openModal("dModal");
};

/* ---------- bindings ---------- */
const f0 = (name) => $("#pForm").elements[name];

/* live card preview + live pricing summary while the admin types */
  function paintPreview() {
    paintSummary();
    const box = $("#cardPreview");
    if (!box) return;
    const g = (k) => (f0(k)?.value || "").trim();
    const fake = {
      network: g("network") || "visa",
      brand: g("brand") || "",
      name: g("name") || "",
      cardNo: g("cardNo") || "0000000000000000",
      expiry: g("expiry") || "2908",
      pin: g("pin") || "0000",
      cvv: g("cvv") || "000",
      holderName: g("holderName") || "CARD HOLDER",
      instructions: g("instructions") || "",
      nfc: $("input[name=nfc]")?.checked !== false,
      value: Number(g("value") || 0)
    };
    /* full size, not the small one - this is the thing being sold, so it should
       look exactly like the card the customer will receive */
    box.innerHTML =
      '<div class="flex between center mb-2 wrap gap-2">' +
        '<span class="fs-xs text-muted fw-6">Live preview &mdash; the full card number is stored but customers only ever see it masked</span>' +
        (g("cardNo") ? "" : '<span class="badge badge-warn">number auto-generated</span>') +
      "</div>" +
      '<div class="card-preview">' + cardVisual(fake, { reveal: true, size: "md" }) + "</div>";
  }


/* the strip at the top of the editor: what the customer will actually pay */
function paintSummary() {
  const g = (k) => (f0(k)?.value || "").trim();
  const price = Number(g("price") || 0);
  const value = Number(g("value") || 0);
  const mrp = Number(g("mrp") || 0);
  const stock = Number(g("stock") || 0);

  const set = (id, text, tone) => {
    const n = document.getElementById(id);
    if (!n) return;
    n.textContent = text;
    n.className = "mono" + (tone ? " " + tone : "");
  };

  set("sumPay", inr(price), price > 0 ? "" : "text-muted");
  set("sumGet", inr(value), value > 0 ? "text-ok" : "text-muted");

  if (value > price && value > 0) {
    const pct = Math.round(((value - price) / value) * 100);
    set("sumSave", pct + "%", "text-ok");
  } else if (mrp > price && mrp > 0) {
    set("sumSave", Math.round(((mrp - price) / mrp) * 100) + "% off MRP", "text-accent");
  } else {
    set("sumSave", "—", "text-muted");
  }

  set("sumStock", String(stock), stock <= 0 ? "text-danger" : stock < 10 ? "text-accent" : "text-ok");

  const name = document.getElementById("sumName");
  if (name) {
    const n = g("name");
    name.textContent = n || "No product name yet";
    name.className = "p-sum-name" + (n ? "" : " text-muted");
  }
}

function bind() {
  const f = $("#pForm");

  /* the cards are built once and kept, so the grid's own listeners are bound
     once here and never again */
  bindRows();

  $("#addBtn").addEventListener("click", () => openEditor(null));

  let t;
  $("#q").addEventListener("input", (e) => {
    clearTimeout(t);
    t = setTimeout(() => { query = e.target.value.trim(); render(); }, 220);
  });

  $("#chips").addEventListener("click", (e) => {
    const c = e.target.closest(".chip");
    if (!c) return;
    filter = c.dataset.f;
    syncChips();
    render();
  });
  $("#sort").addEventListener("change", (e) => { sort = e.target.value; render(); });

  /* ---------- choosing several cards, and doing something with them ---------- */
  $("#pickAll").addEventListener("change", (e) => {
    const shown = filtered();
    if (e.target.checked) shown.forEach((p) => selected.add(p.id));
    else shown.forEach((p) => selected.delete(p.id));
    render();
  });
  $("#pickHide").addEventListener("click", () =>
    bulkSet("active", false, (n) => n + (n === 1 ? " card hidden" : " cards hidden") + " from the store."));
  $("#pickShow").addEventListener("click", () =>
    bulkSet("active", true, (n) => n + (n === 1 ? " card is" : " cards are") + " now live."));
  $("#pickFeature").addEventListener("click", () =>
    bulkSet("featured", true, (n) => n + (n === 1 ? " card marked" : " cards marked") + " featured."));
  $("#pickUnfeature").addEventListener("click", () =>
    bulkSet("featured", false, (n) => n + (n === 1 ? " card" : " cards") + " taken off featured."));
  $("#pickDelete").addEventListener("click", bulkDelete);
  $("#pickClear").addEventListener("click", () => { selected.clear(); render(); });

  /* live discount / saving readout next to the price fields */

  f.querySelectorAll("input,textarea,select").forEach((i) => i.addEventListener("input", () => setError(i)));

  $("#saveBtn").addEventListener("click", save);

  $("#sSave").addEventListener("click", async () => {
    const v = Math.max(0, Number($("#sInput").value) || 0);
    try {
      await updateDoc(doc(db, COL.products, stockTarget.id), { stock: v, updatedAt: serverTimestamp() });
      toast("Stock updated to " + v + ".", "ok");
      closeModal("sModal");
      await load();
    } catch (e) { console.error(e); toast("Could not update stock.", "err"); }
  });

  $$("#sModal [data-add]").forEach((b) => b.addEventListener("click", () => {
    $("#sInput").value = Math.max(0, (Number($("#sInput").value) || 0) + Number(b.dataset.add));
  }));
  $$("#sModal [data-set]").forEach((b) => b.addEventListener("click", () => ($("#sInput").value = b.dataset.set)));

  $("#dYes").addEventListener("click", async () => {
    const btn = $("#dYes");
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Deleting…';
    try {
      await removeProduct(delTarget.id);
      toast("Card deleted.", "ok");
      closeModal("dModal");
      await load();
    } catch (e) {
      console.error(e);
      toast("Could not delete the card.", "err");
    } finally {
      btn.disabled = false;
      btn.innerHTML = icon("trash") + " Delete product";
    }
  });
}

const syncChips = () => $$("#chips .chip").forEach((c) => c.classList.toggle("active", c.dataset.f === filter));

async function save() {
  const f = $("#pForm");
  const d = formData(f);
  let ok = true;

    if (!d.name || d.name.length < 3) { setError(field(f, "name"), "Please enter a product name."); ok = false; } else setError(field(f, "name"));
  const mrp = Number(d.mrp), price = Number(d.price), stock = Number(d.stock);
  if (!(price > 0)) { setError(f.price, "Price must be greater than 0."); ok = false; } else setError(f.price);
  if (mrp > 0 && price > mrp) { setError(f.price, "The selling price cannot be higher than the MRP."); ok = false; }
  if (Number.isNaN(stock) || stock < 0) { setError(f.stock, "Stock must be 0 or more."); ok = false; } else setError(f.stock);

  const value = Number(d.value || 0);
  if (value < 0) { setError(f.value, "Card value cannot be negative."); ok = false; } else setError(f.value);

  /* Expiry is stored MMYY. Refusing a month outside 1-12 here is what stops a
     "31/04" or "04/00" from ever reaching a customer's card face, and the
     year is checked against today so an already-expired card cannot be sold. */
  const expRaw = (d.expiry || "").replace(/\D/g, "").slice(0, 4);
  if (expRaw) {
    const mm = Number(expRaw.slice(0, 2));
    const yy = Number(expRaw.slice(2, 4));
    if (expRaw.length !== 4 || mm < 1 || mm > 12) {
      setError(f.expiry, "Use MMYY, for example 2911 for November 2029.");
      ok = false;
    } else {
      /* last second of that month, so a card expiring this month is still valid */
      const end = new Date(2000 + yy, mm, 0, 23, 59, 59);
      if (end < new Date()) {
        setError(f.expiry, "That expiry is already in the past.");
        ok = false;
      } else setError(f.expiry);
    }
  } else setError(f.expiry);

  /* one gate for every validation above, so nothing is checked after the
     button has already been disabled */
  if (!ok) { toast("Please fix the highlighted fields.", "err"); f.querySelector(".invalid")?.focus(); return; }

  const btn = $("#saveBtn");
  const label = btn.querySelector(".btn-txt").innerHTML;
  btn.disabled = true;
  btn.querySelector(".btn-txt").innerHTML = '<span class="spinner"></span> Saving…';

  const mrpV = Number(d.mrp || 0) || Math.round(value * 1.08) || price;

/* The card number is the product. Saving with the field empty wrote "" and left
   every order for that product unable to show a card, so an edit can no longer
   silently wipe what is already there. */
const existingCardNo = () => (f0("cardNo")?.dataset?.existing || "").replace(/\s+/g, "");
const existingPin = () => (f0("pin")?.dataset?.existing || "");
const existingCvv = () => (f0("cvv")?.dataset?.existing || "");

const payload = {
  name: d.name,
  brand: d.brand || "",
  category: d.category,
  price,
  mrp: mrpV,
  value,
  stock,
  /* card fields */
  network: d.network || "visa",
  cardNo: (d.cardNo || "").replace(/\s+/g, "") || existingCardNo(),
  expiry: expRaw,
  pin: d.pin || existingPin(),
  cvv: d.cvv || existingCvv(),
    holderName: d.holderName || "CARD HOLDER",
    nfc: f.nfc.checked,
    isCard: true,
    instructions: d.instructions || "",
    description: d.description || "",
    benefits: (d.benefits || "").split("\n").map((x) => x.trim()).filter(Boolean),
    discount: mrpV > price ? Math.round(((mrpV - price) / mrpV) * 100) : 0,
    featured: f.featured.checked,
    active: f.active.checked
  };

  try {
    await upsertProduct(payload, editing?.id || null);
    toast(editing ? "Card updated." : "New card added.", "ok");
    closeModal("pModal");
    await load();
  } catch (e) {
    console.error(e);
    toast("Could not save the card: " + (e.message || "unknown error"), "err");
  } finally {
    btn.disabled = false;
    btn.querySelector(".btn-txt").innerHTML = label;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
await requireAdmin();

  const p = new URLSearchParams(location.search);
  if (p.get("new")) setTimeout(() => openEditor(null), 300);
  if (p.get("stock")) filter = p.get("stock") === "low" ? "low" : "out";
  syncChips();

  $("#catSelect").innerHTML =
    CATEGORIES.map((c) => '<option value="' + c.key + '">' + icon(c.icon, "ic ic-sm") + " " + c.label + "</option>").join("") +
    '<option value="other">Other</option>';

  $("#netSelect").innerHTML = Object.entries(NETWORKS)
    .filter(([k]) => k !== "other")
    .map(([k, v]) => '<option value="' + k + '">' + v.label + "</option>").join("") +
    '<option value="other">Other</option>';

  /* every field the preview or the summary strip reads from */
  ["network", "brand", "cardNo", "expiry", "holderName", "pin", "cvv", "value",
   "name", "price", "mrp", "stock"].forEach((k) => {
    const n = f0(k);
    if (n) n.addEventListener("input", paintPreview);
  });
  ["category", "network"].forEach((k) => {
    const n = f0(k);
    if (n) n.addEventListener("change", paintPreview);
  });

  $("#grid").innerHTML = skCards(9);
  await load();
  bind();
});
