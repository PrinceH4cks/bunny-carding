import { field } from "../core/app.js";
import { auth } from "../core/firebase-config.js";
import { db } from "../core/db.js";
import { brandName, setBrand } from "../core/brand.js";

/* =========================================================
   /content.js
   Site content, customer reviews and FAQ.

   The storefront copy lives in one document (settings/site) so the whole
   homepage can be re-pointed from here. Reviews and FAQ are their own
   collections because shoppers filter and order them.
   ========================================================= */

import { $, $$, esc, initials } from "../core/app.js";
import { toast } from "../components/toast.js";
import { emptyState } from "../components/ui.js";
import { confirmBox } from "../components/modal.js";
import { DEFAULT_SITE, getSiteContent, saveSiteContent } from "../services/user-service.js";
import { getReviews, saveReview, removeReview, getFaqs, saveFaq, removeFaq } from "../services/content-service.js";
import { requireAdmin } from "../core/auth.js";
import { icon } from "../components/icons.js";
import { CARD_THEMES, THEME_KEYS, NETWORKS, cardVisual, setCardThemeOverrides, getCardThemeOverrides } from "../components/card-visual.js";

const SECTIONS = [
  { key: "categories",  label: "Shop by category" },
  { key: "bestsellers", label: "Bestsellers" },
  { key: "reviews",     label: "Customer reviews" },
  { key: "quote",       label: "Closing quote" }
];

/* ---------- card look ---------- */
let themes = {};          /* network -> theme key */
const NET_KEYS = Object.keys(NETWORKS);
const SAMPLE = {
  cardNo: "4111111111111111", expiry: "09/29", pin: "1234", cvv: "987",
  holderName: "PRINCE KUMAR", isCard: true, nfc: true
};

function paintThemeRows() {
  $("#themeRows").innerHTML = NET_KEYS.map((k) => {
    const cur = themes[k] || "";
    return '<div class="theme-row" data-net="' + k + '">' +
      '<div style="min-width:0">' +
        '<b class="fs-sm">' + esc(NETWORKS[k].label) + "</b>" +
        '<div class="fs-xs text-muted">key: ' + esc(k) + "</div>" +
      "</div>" +
      '<div class="theme-picks">' +
        '<button class="theme-pick' + (cur ? "" : " on") + '" data-theme="">Default</button>' +
        THEME_KEYS.map((t) =>
          '<button class="theme-pick' + (cur === t ? " on" : "") + '" data-theme="' + t + '" title="' + esc(CARD_THEMES[t].label) + '"' +
          ' style="--sw:' + CARD_THEMES[t].from + ';' + CARD_THEMES[t].to + '"></button>'
        ).join("") +
      "</div>" +
    "</div>";
  }).join("");
}

function paintCardPreview() {
  const net = $("#pvNet").value || NET_KEYS[0];
  setCardThemeOverrides({ [net]: themes[net] || "" });
  $("#pvCard").innerHTML = cardVisual(
    { ...SAMPLE, id: "preview", name: "Sample card", brand: NETWORKS[net].label, network: net, value: 0 },
    { reveal: true, size: "md" }
  );
  $("#pvSwatches").innerHTML = THEME_KEYS.map((t) =>
    '<button class="swatch" data-sw="' + t + '" title="' + esc(CARD_THEMES[t].label) + '" style="background:linear-gradient(135deg,' + CARD_THEMES[t].from + ',' + CARD_THEMES[t].to + ')">' +
      "<span></span><small>" + esc(CARD_THEMES[t].label) + "</small></button>"
  ).join("");
}

function bindThemes() {
  $("#pvNet").innerHTML = NET_KEYS.map((k) => '<option value="' + k + '">' + esc(NETWORKS[k].label) + "</option>").join("");

  $("#pvNet").addEventListener("change", paintCardPreview);

  $("#themeRows").addEventListener("click", (e) => {
    const b = e.target.closest("[data-theme]");
    if (!b) return;
    const net = b.closest("[data-net]").dataset.net;
    const key = b.dataset.theme;
    if (key) themes[net] = key; else delete themes[net];
    paintThemeRows();
    markDirty(true);
    if ($("#pvNet").value === net) paintCardPreview();
  });

  $("#pvSwatches").addEventListener("click", (e) => {
    const b = e.target.closest("[data-sw]");
    if (!b) return;
    const net = $("#pvNet").value;
    themes[net] = b.dataset.sw;
    paintThemeRows();
    markDirty(true);
    paintPreview();
  });

  $("#themeReset").addEventListener("click", async () => {
    const go = await confirmBox({
      title: "Reset every card colour?",
      text: "All networks go back to their built-in colours.",
      ok: "Reset", danger: true
    });
    if (!go) return;
    themes = {};
    paintThemeRows();
    markDirty(true);
    paintCardPreview();
  });

  paintThemeRows();
  paintCardPreview();
}


let site = null;      /* the saved document, for "discard changes" */
let dirty = false;

/* =========================================================
   HOMEPAGE + STORE DETAILS
   ========================================================= */
function paintStatRows(list) {
  $("#statRows").innerHTML = [0, 1, 2].map((i) => {
    const s = (list && list[i]) || { value: "", label: "" };
    return '<div class="field mb-0">' +
      '<label class="fs-xs">Stat ' + (i + 1) + '</label>' +
      '<input class="input" data-stat="' + i + '" data-k="value" value="' + esc(s.value) + '" placeholder="12,500+">' +
      '<input class="input mt-1" data-stat="' + i + '" data-k="label" value="' + esc(s.label) + '" placeholder="Happy customers">' +
      "</div>";
  }).join("");
}

function paintSecRows(sec) {
  $("#secRows").innerHTML = SECTIONS.map((s) =>
    '<label class="flex gap-2 center" style="cursor:pointer;padding:8px 0">' +
      '<input type="checkbox" data-sec="' + s.key + '" style="width:auto"' + (sec && sec[s.key] !== false ? " checked" : "") + "> " +
      "<span>" + esc(s.label) + "</span></label>"
  ).join("");
}

function fillForm(d) {
  const a = d.announcement || {};
  $("#annOn").checked = !!a.on;
  $("#annText").value = a.text || "";
  $("#annHref").value = a.href || "";

  $("#ticker").value = (d.ticker || []).join("\n");

  const h = d.hero || {};
  $("#hEye").value = h.eyebrow || "";
  $("#hHead").value = h.headline || "";
  $("#hLead").value = h.lead || "";
  $("#hCta1").value = h.ctaPrimary || "";
  $("#hCta2").value = h.ctaSecondary || "";

  paintStatRows(d.heroStats);
  paintSecRows(d.sections);

  const q = d.quote || {};
  $("#qText").value = q.text || "";
  $("#qCta").value = q.cta || "";

  const s = d.store || {};
  $("#sPhone").value = s.phone || "";
  $("#sEmail").value = s.email || "";
  $("#sAddr").value = s.address || "";
  $("#sHours").value = s.hours || "";

  /* The shop's own name. Shown as the placeholder when it has never been set, so
     the field says what will appear rather than sitting empty. */
  const nm = $("#siteName");
  if (nm) nm.placeholder = brandName();
  $("#siteName").value = d.name || "";
  $("#siteTagline").value = d.tagline || "";
  $("#siteDesc").value = d.description || "";

  paintPreview();
}

function readForm() {
  const heroStats = [0, 1, 2].map((i) => {
    const v = $(`[data-stat="${i}"][data-k="value"]`);
    const l = $(`[data-stat="${i}"][data-k="label"]`);
    return { value: (v?.value || "").trim(), label: (l?.value || "").trim() };
  });

  const sections = {};
  SECTIONS.forEach((s) => {
    const box = $(`[data-sec="${s.key}"]`);
    sections[s.key] = !!box?.checked;
  });

  return {
    /* the shop's name, at the top of the document rather than inside `store`,
       because it is not a contact detail — it is what the shop is called, and it
       is read by the header, the page titles and the payment links as well as by
       the copy below */
    name: $("#siteName").value.trim(),
    tagline: $("#siteTagline").value.trim(),
    description: $("#siteDesc").value.trim(),
    announcement: { on: $("#annOn").checked, text: $("#annText").value.trim(), href: $("#annHref").value.trim() },
    ticker: $("#ticker").value.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 12),
    hero: {
      eyebrow: $("#hEye").value.trim(),
      headline: $("#hHead").value.trim(),
      lead: $("#hLead").value.trim(),
      ctaPrimary: $("#hCta1").value.trim(),
      ctaSecondary: $("#hCta2").value.trim()
    },
    heroStats,
    sections,
    cardThemes: { ...themes },
    quote: { text: $("#qText").value.trim(), cta: $("#qCta").value.trim() },
    store: {
      phone: $("#sPhone").value.trim(),
      email: $("#sEmail").value.trim(),
      address: $("#sAddr").value.trim(),
      hours: $("#sHours").value.trim()
    }
  };
}

function paintPreview() {
  const s = readForm().store;
  $("#pvPhone").textContent = s.phone || "—";
  $("#pvEmail").textContent = s.email || "—";
  $("#pvAddr").textContent = s.address || "—";
  $("#pvHours").textContent = s.hours || "—";
}

function markDirty(on) {
  dirty = on;
  const b = $("#saveBtn");
  b.classList.toggle("btn-primary", !on);
  b.classList.toggle("btn-accent", on);
  b.innerHTML = icon(on ? "alert" : "save") + (on ? " Save all (unsaved)" : " Save all");
}

async function saveAll() {
  const btn = $("#saveBtn");
  const data = readForm();
  if (!data.hero.headline) return toast("The hero headline cannot be empty.", "err");
  btn.disabled = true;
  try {
    await saveSiteContent(data);
    site = { ...site, ...data };
    /* The panel's own wordmark follows the save, rather than waiting for a
       reload to show what was just typed. The storefront still picks it up on
       its next load — it is a separate site and cannot hear about this one. */
    setBrand(data);
    markDirty(false);
    toast("Site content saved. The storefront picks this up on its next load.", "ok");
  } catch (e) {
    toast("Could not save: " + (e.message || e), "err");
  } finally {
    btn.disabled = false;
  }
}

/* =========================================================
   REVIEWS
   ========================================================= */
let editReviewId = null;

function paintReviews(list) {
  $("#revCount").textContent = list.length;
  if (!list.length) {
    $("#revList").innerHTML = emptyState({
      icon: "star",
      title: "No reviews yet",
      text: "Add one on the right, or leave this empty to keep the built-in testimonials."
    });
    return;
  }
  $("#revList").innerHTML = list.map((r) => {
    const stars = Math.max(0, Math.min(5, Number(r.stars) || 5));
    return '<div class="flex between center gap-2" style="padding:12px 0;border-bottom:1px solid var(--border-2)">' +
      '<div class="flex gap-2 center" style="min-width:0">' +
        '<span class="avatar avatar-sm">' + esc(initials(r.name || "?")) + "</span>" +
        '<div style="min-width:0">' +
          '<b class="fs-sm">' + esc(r.name || "Unnamed") + "</b>" +
          '<div class="fs-xs text-muted">' + "&#9733;".repeat(stars) + (r.place ? " &middot; " + esc(r.place) : "") + "</div>" +
          '<div class="fs-xs text-muted mt-1">' + esc(String(r.text || "").slice(0, 90)) + "</div>" +
        "</div>" +
      "</div>" +
      '<div class="flex gap-1" style="flex:0 0 auto">' +
        (r.on === false ? '<span class="pill">hidden</span>' : "") +
        '<button class="btn btn-ghost btn-xs" data-rev-edit="' + esc(r.id) + '">Edit</button>' +
        '<button class="btn btn-ghost btn-xs" data-rev-del="' + esc(r.id) + '">Delete</button>' +
      "</div></div>";
  }).join("");
}

function resetReviewForm() {
  editReviewId = null;
  $("#revFormTitle").textContent = "Add a review";
  $("#rvName").value = ""; $("#rvPlace").value = ""; $("#rvText").value = "";
  $("#rvStars").value = "5"; $("#rvSort").value = "0"; $("#rvOn").value = "1";
  $("#rvCancel").classList.add("hidden");
}

async function loadReviews() {
  paintReviews(await getReviews());
}

async function submitReview() {
  const data = {
    name: $("#rvName").value.trim(),
    place: $("#rvPlace").value.trim(),
    text: $("#rvText").value.trim(),
    stars: Number($("#rvStars").value) || 5,
    sort: Number($("#rvSort").value) || 0,
    on: $("#rvOn").value === "1"
  };
  if (!data.name) return toast("Customer name is required.", "err");
  if (!data.text) return toast("Review text is required.", "err");
  try {
    await saveReview(data, editReviewId);
    toast(editReviewId ? "Review updated." : "Review added.", "ok");
    resetReviewForm();
    await loadReviews();
  } catch (e) {
    toast("Could not save: " + (e.message || e), "err");
  }
}

/* =========================================================
   FAQ
   ========================================================= */
let editFaqId = null;

function paintFaqs(list) {
  $("#faqCount").textContent = list.length;
  if (!list.length) {
    $("#faqList").innerHTML = emptyState({
      icon: "support",
      title: "No questions yet",
      text: "Add the questions your support team answers most."
    });
    return;
  }
  $("#faqList").innerHTML = list.map((f) =>
    '<div style="padding:12px 0;border-bottom:1px solid var(--border-2)">' +
      '<div class="flex between center gap-2">' +
        "<b class='fs-sm'>" + esc(f.q) + "</b>" +
        '<div class="flex gap-1" style="flex:0 0 auto">' +
          (f.on === false ? '<span class="pill">hidden</span>' : "") +
          '<button class="btn btn-ghost btn-xs" data-faq-edit="' + esc(f.id) + '">Edit</button>' +
          '<button class="btn btn-ghost btn-xs" data-faq-del="' + esc(f.id) + '">Delete</button>' +
        "</div>" +
      "</div>" +
      '<p class="fs-sm text-muted mb-0 mt-1">' + esc(f.a) + "</p>" +
    "</div>"
  ).join("");
}

function resetFaqForm() {
  editFaqId = null;
  $("#faqFormTitle").textContent = "Add a question";
  $("#fqQ").value = ""; $("#fqA").value = ""; $("#fqSort").value = "0"; $("#fqOn").value = "1";
  $("#fqCancel").classList.add("hidden");
}

async function loadFaqs() {
  paintFaqs(await getFaqs());
}

async function submitFaq() {
  const data = {
    q: $("#fqQ").value.trim(),
    a: $("#fqA").value.trim(),
    sort: Number($("#fqSort").value) || 0,
    on: $("#fqOn").value === "1"
  };
  if (!data.q || !data.a) return toast("Both the question and the answer are required.", "err");
  try {
    await saveFaq(data, editFaqId);
    toast(editFaqId ? "Question updated." : "Question added.", "ok");
    resetFaqForm();
    await loadFaqs();
  } catch (e) {
    toast("Could not save: " + (e.message || e), "err");
  }
}

/* =========================================================
   INIT
   ========================================================= */
document.addEventListener("DOMContentLoaded", async () => {
await requireAdmin();

  /* ---- homepage + store ---- */
  site = await getSiteContent();
  if (!site) site = { ...DEFAULT_SITE };
  themes = (site.cardThemes && typeof site.cardThemes === "object") ? { ...site.cardThemes } : {};
  setCardThemeOverrides(themes);
  fillForm(site);
  markDirty(false);

  /* ---- card look ---- */
  bindThemes();

  $("#saveBtn").addEventListener("click", saveAll);

  $("#reloadBtn").addEventListener("click", async () => {
    if (dirty) {
      const go = await confirmBox({
        title: "Discard your changes?",
        text: "Everything you have typed on this page will be thrown away and the last saved version restored.",
        ok: "Discard changes", danger: true
      });
      if (!go) return;
    }
    site = await getSiteContent();
    themes = (site.cardThemes && typeof site.cardThemes === "object") ? { ...site.cardThemes } : {};
    setCardThemeOverrides(themes);
    fillForm(site);
    paintThemeRows();
    paintCardPreview();
    markDirty(false);
    toast("Reverted to the last saved version.", "ok");
  });

  /* Any edit marks the page dirty, and the store preview follows along. */
  $("#c1").addEventListener("input", () => { markDirty(true); });
  $("#c2").addEventListener("input", () => { markDirty(true); paintPreview(); });

  window.addEventListener("beforeunload", (e) => {
    if (!dirty) return;
    e.preventDefault();
    e.returnValue = "";
  });

  /* ---- reviews ---- */
  $("#rvSave").addEventListener("click", submitReview);
  $("#rvCancel").addEventListener("click", resetReviewForm);
  $("#revList").addEventListener("click", async (e) => {
    const ed = e.target.closest("[data-rev-edit]");
    const del = e.target.closest("[data-rev-del]");
    const all = await getReviews();

    if (ed) {
      const r = all.find((x) => x.id === ed.dataset.revEdit);
      if (!r) return;
      editReviewId = r.id;
      $("#revFormTitle").textContent = "Edit review";
      $("#rvName").value = r.name || "";
      $("#rvPlace").value = r.place || "";
      $("#rvText").value = r.text || "";
      $("#rvStars").value = String(r.stars || 5);
      $("#rvSort").value = String(r.sort || 0);
      $("#rvOn").value = r.on === false ? "0" : "1";
      $("#rvCancel").classList.remove("hidden");
      $("#rvName").focus();
      return;
    }
    if (del) {
      const r = all.find((x) => x.id === del.dataset.revDel);
      const go = await confirmBox({
        title: "Delete this review?",
        text: (r ? '"' + String(r.text || "").slice(0, 120) + '"' : "This review") + " will be removed from the storefront.",
        ok: "Delete", danger: true
      });
      if (!go) return;
      try {
        await removeReview(del.dataset.revDel);
        if (editReviewId === del.dataset.revDel) resetReviewForm();
        toast("Review deleted.", "ok");
        await loadReviews();
      } catch (err) {
        toast("Could not delete: " + (err.message || err), "err");
      }
    }
  });

  /* ---- faq ---- */
  $("#fqSave").addEventListener("click", submitFaq);
  $("#fqCancel").addEventListener("click", resetFaqForm);
  $("#faqList").addEventListener("click", async (e) => {
    const ed = e.target.closest("[data-faq-edit]");
    const del = e.target.closest("[data-faq-del]");
    const all = await getFaqs();

    if (ed) {
      const f = all.find((x) => x.id === ed.dataset.faqEdit);
      if (!f) return;
      editFaqId = f.id;
      $("#faqFormTitle").textContent = "Edit question";
      $("#fqQ").value = f.q || "";
      $("#fqA").value = f.a || "";
      $("#fqSort").value = String(f.sort || 0);
      $("#fqOn").value = f.on === false ? "0" : "1";
      $("#fqCancel").classList.remove("hidden");
      $("#fqQ").focus();
      return;
    }
    if (del) {
      const f = all.find((x) => x.id === del.dataset.faqDel);
      const go = await confirmBox({
        title: "Delete this question?",
        text: (f ? '"' + f.q + '"' : "This question") + " will be removed from the FAQ.",
        ok: "Delete", danger: true
      });
      if (!go) return;
      try {
        await removeFaq(del.dataset.faqDel);
        if (editFaqId === del.dataset.faqDel) resetFaqForm();
        toast("Question deleted.", "ok");
        await loadFaqs();
      } catch (err) {
        toast("Could not delete: " + (err.message || err), "err");
      }
    }
  });

  await Promise.all([loadReviews(), loadFaqs()]);
});
