/* =========================================================
   The shop's name, and everything that is written in it.

   The name was written into the markup of every page and into the defaults of
   the payment service — fifty-five files, and changing the shop's name meant
   finding all of them. Worse, the pages could not be re-pointed from the panel:
   the copy editor changed the homepage's words but not the wordmark in the
   header, the tab title, or the name on a UPI payment request.

   So the name lives in settings/site with everything else, and this reads it.
   Three things it has to get right:

   - It must never show nothing. The fallback below is used until Firestore
     answers, so a slow connection sees a name rather than a blank header, and a
     shop that has never saved settings still shows one.
   - It must not depend on the page having loaded. navigation.js reads the
     name out of the header, and toasts are built before anything else runs, so
     the value is cached in localStorage and read synchronously.
   - A payment reference is not decoration. upiLink() puts this name into the
     payee field of a real payment request, so it comes from the panel rather
     than from a constant.
   ========================================================= */

const KEY = "bc_site_v1";

import { pageUrl } from "./app.js";

/* The credit line. Written here, once, on purpose: it is not the shop's name and
   it does not belong in the panel's settings. The shop's name is something an
   owner changes; this is a signature, and a signature that an account holder can
   edit from a settings page is not one.

   Changing it means editing this line and nothing else — every footer, the About
   page and the author tag read it from here. */
export const DEVELOPER = "PRINCE HACKS";

/* Where to reach the same person about work. Here for the same reason: a
   telephone number that a settings page can rewrite is a telephone number that
   somebody will rewrite by accident.

   WhatsApp needs the number in full international form, digits only and no
   plus: 91 is India's country code. The number as a person reads it — 7488739325
   — is kept separately so the two can never disagree about what is displayed
   versus what a tap actually opens. */
export const WHATSAPP = { display: "7488739325", digits: "917488739325" };
export const TELEGRAM = "PRINCE_H4CKS";

/* Named from the site root, never as a relative path written into a page.
   The About page lives one folder down, so a bare "assets/…" there asks the
   browser for pages/assets/… and shows a broken image; the same file on the
   homepage works. Resolving it against the root is what makes one constant
   usable from both. */
export const DEVELOPER_LOGO = "assets/images/developer.jpg";

/* Used only until the panel's name arrives, and whenever the panel has never
   been filled in. Deliberately plain: it is a placeholder, not a brand, and it
   says nothing about who the shop belongs to. */
export const FALLBACK = {
  name: "Store",
  tagline: "Gift cards & prepaid vouchers",
  description: "Gift cards and prepaid vouchers at the best prices, delivered to your wallet instantly."
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

/* The one call most places need: never empty, never undefined. */
export const brandName = () => String(site.name || FALLBACK.name).trim() || FALLBACK.name;

/* ---- writing the name into the page ---- */

export function applyBrand() {
  const name = brandName();

  /* anything marked as the wordmark. data-brand-suffix keeps words that sit
     after the name — "& Admin", "— Orders" — which is why the suffix is a
     separate attribute rather than part of the text. */
  document.querySelectorAll("[data-brand]").forEach((el) => {
    const tail = el.getAttribute("data-brand-suffix");
    el.textContent = tail ? name + tail : name;
  });

  /* the line under the wordmark */
  const tag = site.tagline;
  document.querySelectorAll("[data-brand-tagline]").forEach((el) => {
    if (tag) el.textContent = String(tag);
  });

  /* the credit, and the author tag. Empty the field rather than leaving a bare
     "Developed by" behind, so a cleared credit leaves no trace. */
  document.querySelectorAll("[data-dev]").forEach((el) => {
    el.textContent = DEVELOPER;
  });
  const author = document.querySelector('meta[name="author"]');
  if (author) author.setAttribute("content", DEVELOPER);

  /* the two ways to get in touch, built here so a number typed once cannot end
     up different in the link and in the text beside it */
  document.querySelectorAll("[data-dev-logo]").forEach((img) => {
    if (!img.getAttribute("src")) img.src = pageUrl(DEVELOPER_LOGO);
  });
  document.querySelectorAll("[data-dev-wa]").forEach((el) => {
    el.href = "https://wa.me/" + WHATSAPP.digits;
  });
  document.querySelectorAll("[data-dev-tg]").forEach((el) => {
    el.href = "https://t.me/" + TELEGRAM;
  });
  document.querySelectorAll("[data-dev-wa-text]").forEach((el) => {
    el.textContent = WHATSAPP.display;
  });
  document.querySelectorAll("[data-dev-tg-text]").forEach((el) => {
    el.textContent = "@" + TELEGRAM;
  });

  if (site.description) {
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", String(site.description));
    const og = document.querySelector('meta[property="og:title"]');
    if (og) og.setAttribute("content", name);
  }

  /* Only the pages whose title is just the shop's name get rewritten. A page
     with its own title — "Orders", "Wallet" — keeps it, or the tab would go
     back to saying nothing about where you are. */
  const t = document.title;
  if (!t || !t.trim() || t === FALLBACK.name || t.startsWith(FALLBACK.name)) {
    document.title = name;
  }
}

/* Every page keeps its own part of the title in data-page, so the tab reads
   "Orders — <shop>" without a script and "<shop>" once one has run. Doing this
   by reading the title back would be fragile: the shipped title already ends in
   the placeholder, so where the split falls would depend on the shop's name. */
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

/* ---- reading the panel's copy ---- */

let asked = false;

/* Fire and forget. Called by the shell on every page so the wordmark is right
   early; a failure here changes nothing, because the fallback already stands. */
export async function loadBrand() {
  try {
    const { getSiteContent } = await import("../services/user-service.js");
    const s = await getSiteContent();
    if (!s) return site;
    site = {
      name: String(s.name || "").trim() || FALLBACK.name,
      tagline: String(s.tagline || "").trim(),
      description: String(s.description || "").trim()
    };
    localStorage.setItem(KEY, JSON.stringify(site));
    applyBrand();
    applyTitles();
  } catch {
    /* Firestore unreachable: the fallback name stands. */
  }
  return site;
}

/* The admin panel writes the name here, so saving it and seeing it on the next
   page does not wait for a database round trip. */
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

/* The first call on a page puts the cached name into the markup at once, so
   there is no frame where the header says the fallback after the panel's name
   was already fetched once. */
export function initBrand() {
  if (!asked) { asked = true; applyBrand(); applyTitles(); }
  return site;
}
