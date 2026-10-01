import { $ } from "./app.js";
import { toast } from "../components/toast.js";

/* =========================================================
  /firebase-config.js
  Firebase init + shared SDK instances
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
export const SITE_ADMIN_URL = new URL("../admin/", import.meta.url).href;

/* Helper used to build the "Admin panel" link. */
export const adminLink = (p = "") => SITE_ADMIN_URL + String(p).replace(/^\//, "");

/* Full public URL of THIS store, e.g. https://yourname.github.io/bunny-card/
   Used to build absolute links (order confirmations, "back to store" etc).
   Empty is fine — helpers fall back to a relative path. */
export const SITE_URL = "";

/* Builds an absolute link when SITE_URL is set, otherwise a relative one. */
export const siteLink = (p = "") =>
  SITE_URL ? SITE_URL.replace(/\/$/, "") + "/" + String(p).replace(/^\//, "") : p;

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
    /* A customer asking to be removed. Read by the owner, written by the
       customer against their own account, and that is all either side can do. */
};
