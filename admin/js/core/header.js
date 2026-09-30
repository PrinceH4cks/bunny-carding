import { auth } from "./firebase-config.js";
import { initBrand, loadBrand } from "./brand.js";

/* =========================================================
   PANEL - js/header.js
   Shared shell: header auth state, log out, store link.
   Standalone: this project imports nothing from the user store,
   and has no cart of its own.
   ========================================================= */

import { $, $$ } from "./app.js";
import { toast } from "../components/toast.js";
import { watchAuth, logout, errText, requireAdmin } from "./auth.js";
import { SITE_URL } from "./firebase-config.js";

watchAuth(() => {});

/* ------------------------------------------------------------------
   THE SHELL ALSO CHECKS WHO YOU ARE

   Every page of the panel asks for itself, at the top of its own script,
   before it draws anything. That is the right place for the check, and it
   stays there — but it left one gap. The check lives in the page's own module,
   so if that module fails to load at all — a bad import, a typo, a browser
   that cannot parse one file — the check never runs, and the visitor is left
   sitting in front of the page's loading skeleton for ever, with nothing to
   click and no word about why.

   header.js is loaded by every page of the panel and depends on almost
   nothing, so the same check is repeated here as a floor under it. The page's
   own check is still the one that matters; this one only catches the day it
   cannot run. Both may fire on the same page, which is harmless: the second
   redirect replaces the first and never comes back.

  ------------------------------------------------------------------ */
  const inPanel = () => /\/admin\/pages\//.test(location.pathname);
  if (inPanel()) {
  window.addEventListener("error", (e) => {
    /* a module that would not load leaves its skeleton on screen; say so rather
       than let the panel look as though it were still working */
    if (!inPanel()) return;
    const sk = $$(".dash-main .sk, .dash-main .spinner");
    if (!sk.length) return;
    sk.forEach((n) => n.remove());
    const host = $(".dash-main") || document.body;
    if (!$(".load-failed")) {
      const box = document.createElement("div");
      box.className = "alert alert-err load-failed";
      box.style.margin = "0 0 16px";
      box.textContent = "This page could not load. Check your connection, then refresh. (" + (e?.message || "script error") + ")";
      host.prepend(box);
    }
  });
  requireAdmin();
}

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-logout]");
  if (!b) return;
  e.preventDefault();
  logout().catch((err) => toast(errText(err), "err"));
});

/* "View store" buttons point to SITE_URL. Delegation keeps the
   dynamically rendered links working too. */
document.addEventListener("click", (e) => {
  const a = e.target.closest("[data-site-link]");
  if (!a) return;
  e.preventDefault();
  if (SITE_URL) window.open(SITE_URL, "_blank", "noopener");
  else toast("Store URL is not set yet - add SITE_URL in js/firebase-config.js.", "warn");
});

document.addEventListener("DOMContentLoaded", () => {
  $$("[data-site-link]").forEach((a) => {
    if (SITE_URL) a.href = SITE_URL;
    else a.title = "Set SITE_URL in js/firebase-config.js";
  });

  /* The shop's name in the panel's own wordmark and tab titles. The cached name
     goes in first so the header is right without waiting for the database, then
     the saved copy is fetched — the panel is a separate site from the storefront
     and gets no help from it. A failure here leaves the placeholder standing,
     which is why nothing else waits on it. */
  initBrand();
  loadBrand();
});
