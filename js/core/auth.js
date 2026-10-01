import { $, uid, pageUrl, pagePath } from "./app.js";
import { icon } from "../components/icons.js";

import { adminLink } from "./firebase-config.js";
/* =========================================================
   /auth.js
   Sign up, log in, log out, profile and role guards
   ========================================================= */

import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, updateProfile, updateEmail, updatePassword,
  sendPasswordResetEmail, onAuthStateChanged,
  GoogleAuthProvider, signInWithPopup, signInWithRedirect
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
  "auth/requires-recent-login":    "For security, please sign in again.",
  "auth/needs-reauth":             "Please confirm your password to change your email address.",
  "auth/missing-password":         "Please enter your password.",
  /* Google, and the pop-up window it needs. The first is the one an owner hits
     on the day they switch the button on and forget the console; the second
     and third are the visitor closing the window on purpose, and the page
     treats them as silence rather than as an error. */
  "auth/operation-not-allowed":    "Google sign-in is not switched on for this shop yet. Please use your email and password.",
  "auth/account-exists-with-different-credential": "An account already exists with that email. Sign in with your password instead.",
  "auth/popup-blocked":            "Your browser blocked the sign-in window. Allow pop-ups for this site, or use your email and password.",
  "auth/popup-closed-by-user":     "",
  "auth/cancelled-popup-request":  "",
  "auth/web-storage-unsupported":  "This browser is blocking sign-in. Turn off private browsing, or use another browser."
};

/* The empty strings in ERRS are deliberate: they are the cases where nothing
   should be said at all, because the visitor closed the Google window on
   purpose. A truthiness check would skip them and fall through to Firebase's
   own wording, which is the one thing nobody asked for — so the code is looked
   up by whether the table has the key, not by whether it has words in it. */
export const errText = (e) =>
  (e?.code && Object.prototype.hasOwnProperty.call(ERRS, e.code)
    ? ERRS[e.code]
    : e?.message?.replace(/^Firebase:\s*/i, "").replace(/\s*\(auth.*\)\.?$/, "")) ||
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
        role: "user",
        createdAt: serverTimestamp()
      }, { merge: true });
      PROFILE = { id: u.uid, name: u.displayName || u.email.split("@")[0], email: u.email, role: "user" };
    }
    return PROFILE;
  } catch (e) {
    console.error("profile load failed", e);
    return null;
  }
}

export const isAdmin = () => PROFILE?.role === "admin";
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

/* resolves once, with the very first auth state — no side effects */
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
    role: "user",
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

/* ---------- sign in with Google ----------
   A window, not a page: Google asks who you are, and comes back with an answer.
   The person who uses this on a phone is not helped by a pop-up, though — mobile
   browsers block them or lose them when the phone rotates — so on a narrow
   screen the same request is sent as a redirect instead, and the browser
   carries the visitor to Google and back. Either way the account ends up the
   same, and the page that called this decides where to go next. */
export async function loginWithGoogle() {
  const provider = new GoogleAuthProvider();
  /* the chooser must not sit on an account the visitor did not pick */
  provider.setCustomParameters({ prompt: "select_account" });

  /* the same shape the email path leaves behind, so everything downstream —
     the wallet, the orders, the profile — cannot tell how the person arrived */
  const settle = async (cred) => {
    const user = cred?.user;
    if (!user) return null;
    await loadProfile(user);
    await updateDoc(doc(db, COL.users, user.uid), { lastLogin: serverTimestamp() });
    toast("Welcome, " + (PROFILE?.name || "shopper") + "!", "ok");
    return user;
  };

  /* a phone gets the redirect, where nothing can block it */
  const narrow = window.matchMedia("(max-width: 860px)").matches ||
    /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

  if (narrow) {
    /* this never returns: the page is on its way to Google */
    await signInWithRedirect(auth, provider);
    return null;
  }

  try {
    return await settle(await signInWithPopup(auth, provider));
  } catch (err) {
    /* The window was shut, or another window was already asking. Neither is a
       fault and neither deserves a message — the visitor simply changed their
       mind, and a red box saying so is noise. Anything else is a real failure
       and is passed on to be explained. */
    if (err?.code === "auth/popup-closed-by-user" || err?.code === "auth/cancelled-popup-request") return null;
    /* a desktop where the pop-up was blocked can still be sent the long way */
    if (err?.code === "auth/popup-blocked") {
      await signInWithRedirect(auth, provider);
      return null;
    }
    throw err;
  }
}

/* ---------- logout ---------- */
export async function logout() {
  await signOut(auth);
  toast("You have been logged out.", "info");
  setTimeout(() => (location.href = pageUrl("index.html")), 500);
}

/* ---------- profile updates ---------- */
/* opts.reauth = the user's current password. Required by Firebase before an
   email address can be changed, otherwise updateEmail throws
   auth/requires-recent-login and the save fails with no useful message.
   Does not toast — the calling page reports the result. */
export async function saveProfile(data, { reauth = null } = {}) {
  if (!CURRENT) throw new Error("Please sign in first.");

  /* compared case-insensitively: the form lower-cases what it sends and
     Firebase keeps the case it was given, so a plain !== said "changed" when
     only the capitalisation differed and asked for a password for nothing */
  const want = String(data.email || "").trim().toLowerCase();
  const have = String(CURRENT.email || "").trim().toLowerCase();
  const emailChanged = !!want && want !== have;

  if (emailChanged) {
    if (!reauth) {
      const err = new Error("Please confirm your password to change your email address.");
      err.code = "auth/needs-reauth";
      throw err;
    }
    await signInWithEmailAndPassword(auth, CURRENT.email, reauth);
  }

  /* name and phone go to Firestore first: if the Auth call below fails, the
     profile is not left half-updated */
  const patch = { ...data };
  delete patch.email;
  await updateDoc(doc(db, COL.users, CURRENT.uid), { ...patch, updatedAt: serverTimestamp() });

  if (data.name) await updateProfile(CURRENT, { displayName: data.name });

  if (emailChanged) {
    await updateEmail(CURRENT, data.email.trim());
    /* And this is the part that was missing, which is why the box kept turning
       the old address back: the profile is read from Firestore, not from Auth.
       updateEmail moved the account, but the document every other part of the
       site looks at still held the address they had typed over. So the change
       appeared to do nothing, and the only way to be sure was to sign out and
       back in — where it then worked, because Auth had it after all. */
    await updateDoc(doc(db, COL.users, CURRENT.uid), { email: data.email.trim().toLowerCase() });
    /* the verification has to go to the new address, and the old one is verified
       while the new one is not, so the state has to be asked for again */
    await CURRENT.reload();
  }

  await loadProfile(CURRENT);
}

export async function changePassword(newPass) {
  if (newPass.length < 6) throw new Error("Password must be at least 6 characters.");
  await updatePassword(CURRENT, newPass);
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

export async function requireLogin(redirect = pageUrl("pages/login.html")) {
  const u = await whenReady();
  if (u) return u;
  bounce(redirect + "?next=" + encodeURIComponent(here()));
  return HALT;
}

export async function requireAdmin() {
  const u = await whenReady();
  if (!u) {
    bounce(pageUrl("pages/login.html") + "?next=../../index.html");
    return HALT;
  }
  if (!isAdmin()) {
    document.body.innerHTML =
      '<div style="min-height:100vh;display:grid;place-items:center;padding:24px">' +
        '<div class="card card-pad text-center" style="max-width:460px">' +
          '<div class="f-icon" style="margin:0 auto 18px;width:80px;height:80px;font-size:2.2rem">' +
            '<svg class="ic ic-xl" aria-hidden="true"><use href="#i-lock"></use></svg></div>' +
          "<h1 style='font-size:1.6rem'>403 &mdash; Access denied</h1>" +
          "<p class='text-muted'>This admin panel is only available to accounts with the admin role.<br>" +
          'If you are an admin, set <b>role: "admin"</b> in your <code>users/&lt;uid&gt;</code> document.</p>' +
          '<div class="flex gap-2 justify-center wrap">' +
            '<a class="btn btn-ghost" href="' + adminLink("null") + '>If you are the owner, run the one-time setup</a>' +
            '<a class="btn btn-primary" href="' + pageUrl("pages/login.html") + '">Back to login</a>' +
          "</div>" +
        "</div>" +
      "</div>";
    return HALT;
  }
  return u;
}

/* Sends a signed-in visitor away from login / register.
   Fires at most once, on the first auth state only. */
export function guestOnly(redirect = pageUrl("index.html")) {
  whenReady().then((u) => {
    if (!u) return;
    if (document.body.dataset.guestHandled === "1") return;
    document.body.dataset.guestHandled = "1";
    location.replace(redirect);
  });
}
