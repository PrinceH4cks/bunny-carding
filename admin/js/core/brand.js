/* =========================================================
   The shop's name, for the panel.

   Deliberately a separate copy of the store's own module rather than an import
   across into ../../js. The panel is deployed as its own site — the two do not
   necessarily sit under one directory on the server — so a panel that reached
   into the storefront's folder would work locally and 404 in production. It
   also has to fetch its own copy of settings/site, because the panel has no
   storefront page to piggyback on.

   The shape is identical to the store's, on purpose: same four calls, so
   anything that reads the name works in both without asking where it is.
   ========================================================= */

const KEY = "bc_site_v1";

import { pageUrl } from "./app.js";

/* Who built this panel, and how to reach them about it.

   Written here, in code, once — not in the panel's settings. A shopkeeper who
   cannot get in needs somewhere to go, and that somewhere is a person, not a
   field they have to already be able to reach in order to edit. */
export const DEVELOPER = "PRINCE HACKS";

/* WhatsApp needs the number in full international form, digits only: 91 is
   India's country code. Kept apart from the number as it is printed, so the link
   and the label can never disagree. */
export const WHATSAPP = { display: "7488739325", digits: "917488739325" };
export const TELEGRAM = "PRINCE_H4CKS";

/* Named from the site root rather than written into a page, because the panel's
   own folder is one level down from the site root. */
export const DEVELOPER_LOGO = "assets/images/developer.jpg";

/* The Firestore reader, imported here rather than through ../core/db.js.
   db.js deliberately does not hand on the SDK's own tools, and widening its
   exports to add getDoc would pull the storage library into every panel page's
   module graph — a page that never touches storage would then depend on it
   loading before it could run at all. Two names is not worth that. */
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db, COL } from "./firebase-config.js";

/* Used until the panel's saved name arrives, and whenever none has been saved.
   Plain on purpose: a blank wordmark reads as a broken page. */
export const FALLBACK = {
  name: "Store",
  tagline: "Gift cards & prepaid vouchers",
  description: ""
};

const read = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    return raw && typeof raw === "object" ? raw : null;
  } catch {
    return null;
  }
};

let site = read() || { ...FALLBACK };

export const brand = () => site;

export const brandName = () => String(site.name || FALLBACK.name).trim() || FALLBACK.name;

export function applyBrand() {
  const name = brandName();

  document.querySelectorAll("[data-brand]").forEach((el) => {
    const tail = el.getAttribute("data-brand-suffix");
    el.textContent = tail ? name + tail : name;
  });

  const tag = site.tagline;
  document.querySelectorAll("[data-brand-tagline]").forEach((el) => {
    if (tag) el.textContent = String(tag);
  });

  if (site.description) {
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", String(site.description));
  }

  /* The way in for somebody who cannot get in. Built here rather than written
     into the page, so the address a button opens cannot be edited by accident
     or drift away from the button it belongs to.

     Addresses only, never the number written out. A phone number printed on a
     login screen is a number every person standing at that screen can read, and
     the button opens the chat on its own — printing it added exposure and
     nothing else. The shop's About page still shows the number, because that
     page is read by people who came looking for it. */
  document.querySelectorAll("[data-dev-logo]").forEach((img) => {
    if (!img.getAttribute("src")) img.src = pageUrl(DEVELOPER_LOGO);
  });
  document.querySelectorAll("[data-dev-wa]").forEach((el) => {
    el.href = "https://wa.me/" + WHATSAPP.digits;
  });
  document.querySelectorAll("[data-dev-tg]").forEach((el) => {
    el.href = "https://t.me/" + TELEGRAM;
  });
}

/* Every panel page keeps its own part of the title in data-page — "Manage
   Products", "Payments" — so the tab reads "Manage Products — <shop>" before any
   script runs and "<shop>" once one has. */
export function applyTitles() {
  const name = brandName();
  document.querySelectorAll("title[data-page]").forEach((t) => {
    const page = t.getAttribute("data-page") || "";
    t.textContent = page ? page + " — " + name : name;
  });
  const plain = document.querySelector("title:not([data-page])");
  if (plain && (!plain.textContent || !plain.textContent.trim() || plain.textContent === FALLBACK.name)) {
    plain.textContent = name;
  }
}

let asked = false;

export function initBrand() {
  if (!asked) { asked = true; applyBrand(); applyTitles(); }
  return site;
}

/* Read the saved copy. Fire and forget: a failure changes nothing, because the
   fallback already stands in the markup. */
export async function loadBrand() {
  try {
    const snap = await getDoc(doc(db, COL.settings, "site"));
    if (!snap.exists()) return site;
    const d = snap.data() || {};
    site = {
      name: String(d.name || "").trim() || FALLBACK.name,
      tagline: String(d.tagline || "").trim(),
      description: String(d.description || "").trim()
    };
    localStorage.setItem(KEY, JSON.stringify(site));
    applyBrand();
    applyTitles();
  } catch {
    /* unreachable: the name in the markup stands */
  }
  return site;
}

/* Saving the name in the panel updates the header immediately rather than after
   a page reload. */
export function setBrand(next) {
  site = {
    name: String(next?.name || "").trim() || FALLBACK.name,
    tagline: String(next?.tagline || "").trim(),
    description: String(next?.description || "").trim()
  };
  localStorage.setItem(KEY, JSON.stringify(site));
  applyBrand();
  applyTitles();
  return site;
}
