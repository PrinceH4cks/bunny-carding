import { $ } from "./app.js";
import { toast } from "../components/toast.js";

/* =========================================================
   PANEL - js/firebase-config.js
   Standalone: this project does not import any file
   from the user-facing store, so it can live in its own repo.
   ========================================================= */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth }  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore }  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage }  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

export const firebaseConfig = {
  apiKey: "AIzaSyCQgkZv4wgN5dc2xAgWUBxQF6RByhKEhZU",
  authDomain: "bunny-4466b.firebaseapp.com",
  databaseURL: "https://bunny-4466b-default-rtdb.firebaseio.com",
  projectId: "bunny-4466b",
  storageBucket: "bunny-4466b.firebasestorage.app",
  messagingSenderId: "1003033018727",
  appId: "1:1003033018727:web:9d0959fae1f14996d76fc2",
  measurementId: "G-EY2PP7WK1T"
};

export const app  = initializeApp(firebaseConfig);
export const auth  = getAuth(app);
export const db  = getFirestore(app);
export const storage = getStorage(app);

/* ------------------------------------------------------------------
   ADMIN PANEL URL.

   The panel is the admin/ folder of this same project, so it is found from
   where this file is rather than typed in: that keeps the link right on a
   local server, on the Firebase emulator and on the published site without
   anyone having to edit anything. Set it by hand only if the panel is ever
   published somewhere else.
------------------------------------------------------------------ */
export const SITE_ADMIN_URL = new URL(".", import.meta.url).href;

/* Helper used to build the "Admin panel" link. */
export const adminLink = (p = "") => SITE_ADMIN_URL + String(p).replace(/^\//, "");

/* Public URL of the USER store. The panel sits one folder inside it, so the
   store is one level up from here, and again that is worked out rather than
   typed in. */
export const SITE_URL = new URL("../../", import.meta.url).href;

/* Builds an absolute link to a page of the store. */
export const siteLink = (p = "") =>
  SITE_URL.replace(/\/$/, "") + "/" + String(p).replace(/^\//, "");

/* Firestore collection names */
export const COL = {
  users:      "users",
  products:   "products",
  orders:     "orders",
  reviews:    "reviews",
  messages:   "messages",
  settings:   "settings",
  wallets:    "wallets",
  walletTxns: "wallet_txns",
  deposits:   "deposits",
    faqs:       "faqs",
    coupons:    "coupons",
  /* customers asking to be removed — read in the panel, acted on by the owner */
};
