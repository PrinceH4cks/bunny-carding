import { $, pageUrl, pagePath } from "./app.js";
import { icon } from "../components/icons.js";

/* =========================================================
   auth.js
   Independent copy for the standalone admin project.
   Owner-UID gate + shared auth listener.
   ========================================================= */

import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, updateProfile, updateEmail, updatePassword,
  sendPasswordResetEmail, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  doc, getDoc, setDoc, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { auth } from "./firebase-config.js";
import { db, COL } from "./db.js";
import { esc, initials } from "./app.js";
import { toast } from "../components/toast.js";

/* ---------- friendly error messages ---------- */
const ERRS = {
  "auth/invalid-email":            "That email address is not valid.",
  "auth/user-disabled":            "This account has been disabled. Please contact support.",
  "auth/user-not-found":           "No account exists with that email.",
  "auth/wrong-password":           "Incorrect password.",
  "auth/invalid-credential":       "Incorrect email or password.",
  "auth/email-already-in-use":     "An account already exists with that email.",
  "auth/weak-password":            "Password is too weak (minimum 6 characters).",
  "auth/too-many-requests":        "Too many attempts. Please try again in a few minutes.",
  "auth/network-request-failed":   "Check your internet connection.",
  "auth/requires-recent-login":    "For security, please sign in again."
};

export const errText = (e) =>
  ERRS[e?.code] ||
  e?.message?.replace(/^Firebase:\s*/i, "").replace(/\s*\(auth.*\)\.?$/, "") ||
  "Something went wrong.";

/* ---------- current user ---------- */
export let CURRENT = null;   // firebase user
export let PROFILE = null;   // firestore profile

export async function loadProfile(u) {
  if (!u) return null;
  try {
    const snap = await getDoc(doc(db, COL.users, u.uid));
    PROFILE = snap.exists() ? { id: snap.id, ...snap.data() } : null;
    if (!PROFILE) {
      await setDoc(doc(db, COL.users, u.uid), {
        name: u.displayName || u.email.split("@")[0],
        email: u.email,
        phone: u.phoneNumber || "",
        createdAt: serverTimestamp()
      }, { merge: true });
      PROFILE = { id: u.uid, name: u.displayName || u.email.split("@")[0], email: u.email };
    }
    return PROFILE;
  } catch (e) {
    console.error("profile load failed", e);
    return null;
  }
}

/* ==================================================================
   OWNER UID â€” yahan apna Firebase UID paste karo.
   Firebase Console > Authentication > Users > apna account > UID
   Example:  Zx9Kq2Lm7pQrStUvWxYz
   ================================================================== */
  export const OWNER_UID = "Hku49smD1xhjdZn9KybkqREH3of2";

/* Panel sirf usi UID ka hai. Role koi rasta nahi: pehle role 'admin' bhi
   chalti thi, aur Firestore rules bhi role maante the â€” matlab panel ek band
   tha par database khola. Ab dono jagah sirf UID hai, to dono me wahi UID
   honi chahiye. UID paste nahi hui to koi andar nahi aa sakta â€” ye jaan
   boojh kar hai, warna panel khula dikhe aur kuch na kar sake. */
export const isAdmin = () =>
  OWNER_UID.length > 10 && !OWNER_UID.startsWith("PASTE") && CURRENT?.uid === OWNER_UID;

export const strictMode = () => OWNER_UID.length > 10 && !OWNER_UID.startsWith("PASTE");
export const loggedIn = () => !!CURRENT;

/* ------------------------------------------------------------------
   ONE auth listener for the whole page.

   Previously every watchAuth() call registered its own
   onAuthStateChanged, so four listeners each performed their own
   redirect and the page bounced between dashboard and login.
   Now there is a single listener and any number of subscribers.
   ------------------------------------------------------------------ */
const subscribers = new Set();
let listenerStarted = false;
let settled = false;
let onFirstSettle = [];

const firstSettle = new Promise((res) => { onFirstSettle.push(res); });

function startListener() {
  if (listenerStarted) return;
  listenerStarted = true;

  onAuthStateChanged(auth, async (u) => {
    CURRENT = u;
    if (u) await loadProfile(u);
    else PROFILE = null;

    if (!settled) {
      settled = true;
      onFirstSettle.forEach((r) => r(u));
      onFirstSettle = [];
    }

    paintHeader();
    subscribers.forEach((fn) => {
      try { fn(u, PROFILE); } catch (e) { console.error("auth subscriber failed", e); }
    });
  });
}

/* subscribe to every auth change */
export function watchAuth(cb) {
  startListener();
  subscribers.add(cb);
  return () => subscribers.delete(cb);   // returns an unsubscribe fn
}

/* resolves once, with the very first auth state â€” no side effects */
export function whenReady() {
  startListener();
  return firstSettle;
}

export const isLoggedIn = async () => !!(await whenReady());

function paintHeader() {
  const show = (sel, yes) =>
    document.querySelectorAll(sel).forEach((n) => {
      n.hidden = !yes;
      n.classList.toggle("hidden", !yes);
    });

  const name = PROFILE?.name || CURRENT?.displayName || "Guest";
  document.querySelectorAll("[data-auth-name]").forEach((n) => (n.textContent = name));
  document.querySelectorAll("[data-auth-initial]").forEach((n) => (n.textContent = initials(name)));
  document.querySelectorAll("[data-auth-email]").forEach((n) => (n.textContent = PROFILE?.email || CURRENT?.email || ""));

  show("[data-when-login]", !!CURRENT);
  show("[data-when-guest]", !CURRENT);
  show("[data-admin-only]", isAdmin());
}

/* ---------- register ---------- */
export async function register({ name, email, phone, password, confirm }) {
  if (name.length < 3) throw new Error("Please enter your full name.");
  if (password.length < 6) throw new Error("Password must be at least 6 characters.");
  if (password !== confirm) throw new Error("The two passwords do not match.");

  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  await updateProfile(cred.user, { displayName: name.trim() });
  await setDoc(doc(db, COL.users, cred.user.uid), {
    name: name.trim(),
    email: email.trim().toLowerCase(),
    phone: phone.trim(),
    address: "", city: "", state: "", pincode: "",
    createdAt: serverTimestamp(),
    lastLogin: serverTimestamp()
  });
  toast("Your account is ready. Happy shopping!", "ok");
  return cred.user;
}

/* ---------- login ---------- */
export async function login({ email, password }) {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  await updateDoc(doc(db, COL.users, cred.user.uid), { lastLogin: serverTimestamp() });
  await loadProfile(cred.user);
  toast("Welcome back, " + (PROFILE?.name || "shopper") + "!", "ok");
  return cred.user;
}

/* ---------- logout ---------- */
export async function logout() {
  await signOut(auth);
  toast("You have been logged out.", "info");
  setTimeout(() => (location.href = pageUrl("pages/dashboard.html")), 500);
}

/* ---------- profile updates ---------- */
export async function saveProfile(data) {
  if (!CURRENT) throw new Error("Please sign in first.");
  await updateDoc(doc(db, COL.users, CURRENT.uid), { ...data, updatedAt: serverTimestamp() });
  if (data.name) await updateProfile(CURRENT, { displayName: data.name });
  if (data.email && data.email !== CURRENT.email) await updateEmail(CURRENT, data.email);
  await loadProfile(CURRENT);
  toast("Profile updated.", "ok");
}

export async function changePassword(newPass) {
  if (newPass.length < 6) throw new Error("Password must be at least 6 characters.");
  await updatePassword(CURRENT, newPass);
  toast("Password changed.", "ok");
}

export async function resetPassword(email) {
  if (!email) throw new Error("Please enter your email.");
  await sendPasswordResetEmail(auth, email.trim());
  toast("Reset link sent. Please check your inbox.", "ok");
}

/* ---------- guards ---------- */

let lastBounce = 0;
const BOUNCE_GAP = 5000;

function bounce(to) {
  const now = Date.now();
  if (now - lastBounce < BOUNCE_GAP) return false;   // already bouncing, stay put
  lastBounce = now;
  location.replace(to);                              // replace, so login is not in history
  return true;
}

/* Which page asked for the login. It goes into ?next= and the sign-in page
   sends the visitor back to it, so it has to name the page from the site root
   rather than from this file or from the current folder. */
const here = () => pagePath();

/* Waits forever on purpose: the page is navigating away, so the caller
   must not carry on and touch CURRENT while it is null. */
const HALT = new Promise(() => {});

export async function requireLogin(redirect = pageUrl("index.html")) {
  const u = await whenReady();
  if (u) return u;
  bounce(redirect + "?next=" + encodeURIComponent(here()));
  return HALT;
}

export async function requireAdmin() {
  const u = await whenReady();
  if (!u) {
    /* The destination goes in as an absolute address inside the panel. It used
       to be the relative string "../../pages/dashboard.html", which â€” read from
       /admin/index.html â€” resolves to the *storefront's* dashboard: so signing in
       after being bounced landed you in the shop instead of the panel. Build it
       with pageUrl and the mistake cannot be made again. */
    bounce(pageUrl("index.html") + "?next=" + encodeURIComponent(pageUrl("pages/dashboard.html")));
    return HALT;
  }
  if (!isAdmin()) {
    const who = (CURRENT?.email || CURRENT?.uid || "unknown");
    /* One UID, in one place, and the rules have to carry the same one. A panel
       that opens but whose writes are rejected is the state this message exists
       to head off, so both files are named rather than just the JS one. */
    const hint = "Signed in as <b>" + esc(who) + "</b>, but the panel only opens for the owner's UID.<br>" +
      "Copy that account's UID from Firebase Console &rarr; Authentication &rarr; Users, then paste it into " +
      "<code>OWNER_UID</code> in <code>admin/js/core/auth.js</code> <em>and</em> into " +
      "<code>OWNER_UID()</code> in <code>config/firestore.rules</code>.<br>" +
      "The first gets you in; the second lets you save anything.";

    document.body.innerHTML =
      '<div style="min-height:100vh;display:grid;place-items:center;padding:24px">' +
        '<div class="card card-pad text-center" style="max-width:520px">' +
          '<div class="f-icon" style="margin:0 auto 18px;width:80px;height:80px;font-size:2.2rem">' +
            '<svg class="ic ic-xl" aria-hidden="true"><use href="#i-lock"></use></svg></div>' +
          "<h1 style='font-size:1.6rem'>403 &mdash; Access denied</h1>" +
          "<p class='text-muted'>" + hint + "</p>" +
          '<div class="flex gap-2 justify-center wrap">' +
            '<a class="btn btn-primary" href="' + pageUrl("index.html") + '">Back to login</a>' +
          "</div>" +
        "</div>" +
      "</div>";
    return HALT;
  }
  return u;
}

/* Sends a signed-in visitor away from login / register.
   Fires at most once, on the first auth state only. */
export function guestOnly(redirect = pageUrl("pages/dashboard.html")) {
  whenReady().then((u) => {
    if (!u) return;
    if (document.body.dataset.guestHandled === "1") return;
    document.body.dataset.guestHandled = "1";
    location.replace(redirect);
  });
}
