import { auth } from "../core/firebase-config.js";

/* PANEL - js/login.js  (standalone admin sign-in) */
import { $, formData, setError, isEmail, esc, pageUrl } from "../core/app.js";
import { toast } from "../components/toast.js";
import { login, errText, whenReady, isAdmin } from "../core/auth.js";
import { icon } from "../components/icons.js";

const form = $("#loginForm");

/* Where to go once signed in.

   This comes from the address bar, so it is not something the panel wrote and
   not something to be obeyed. It is read, checked, and thrown away if it points
   anywhere that is not a page of this panel.

   Without the check, a link like

       /admin/index.html?next=../../pages/dashboard.html

   signs the owner in and then drops them into the *storefront* — which is what
   it actually did — and a link with a full address in it
   (?next=https://somewhere-else) walks them off the site entirely, on the page
   where they were about to type a password.

   Two things are therefore required of it: the same origin, and a path still
   inside the panel's own folder. Anything else falls back to the dashboard. */
const PANEL_ROOT = new URL(pageUrl(""), location.href).pathname;

function safeNext(raw) {
  const fallback = pageUrl("pages/dashboard.html");
  if (!raw) return fallback;

  let to;
  try {
    to = new URL(raw, location.href);
  } catch {
    return fallback;
  }
  if (to.origin !== location.origin) return fallback;          // some other site
  if (!to.pathname.startsWith(PANEL_ROOT)) return fallback;    // the storefront, say

  /* handed to location.replace(), so only the part that identifies a page is
     passed on — never a whole other origin that happened to pass the check */
  return to.pathname + to.search + to.hash;
}

const next = safeNext(new URLSearchParams(location.search).get("next"));

if (window.matchMedia("(max-width: 940px)").matches) {
  $("#mobileBrand")?.style.setProperty("display", "inline-flex");
}

function showAlert(type, text) {
  $("#alertBox").innerHTML = '<div class="alert alert-' + type + ' mb-2"><span>' +
    (type === "err" ? "!" : "i") + "</span><div>" + esc(text) + "</div></div>";
}

/* one check, one redirect — no watcher racing the submit handler */
whenReady().then((u) => {
  if (!u) return;
  if (isAdmin()) location.replace(next);
    else showAlert("err", "This account cannot open the panel. Copy its UID from Firebase Console &rarr; Authentication &rarr; Users into <code>OWNER_UID</code> in <code>admin/js/core/auth.js</code>.");
});

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-peek]");
  if (!b) return;
  const inp = b.previousElementSibling;
  const show = inp.type === "password";
  inp.type = show ? "text" : "password";
  /* swap the glyph rather than the text. This used to write "Show" and "Hide"
     into the button, which threw the eye away on the first tap and left a bare
     word sitting where an icon had been — the one control a person needs when
     they are getting a password wrong. aria-pressed carries the state instead,
     so the button still says what it is doing to a screen reader. */
  const use = b.querySelector("use");
  if (use) use.setAttribute("href", show ? "#i-eye-off" : "#i-eye");
  b.setAttribute("aria-label", show ? "Hide password" : "Show password");
  b.setAttribute("aria-pressed", show ? "true" : "false");
});

/* The password-reset button used to be wired here. The button is gone from the
   page, so this is too: a handler reaching for an element that no longer exists
   throws on load, and on a sign-in page that is the one page where a thrown
   handler means nobody can get in at all. */

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const d = formData(form);
  let ok = true;

  if (!isEmail(d.email)) { setError(form.email, "Please enter a valid email address."); ok = false; } else setError(form.email);
  if (!d.password) { setError(form.password, "Please enter your password."); ok = false; } else setError(form.password);
  if (!ok) return;

  const btn = $("#btn");
  const label = btn.querySelector(".btn-txt");
  const original = label.innerHTML;
  btn.disabled = true;
  /* aria-busy as well as the spinner: a screen reader would otherwise read the
     button's name and stop, with no idea that anything is happening */
  btn.setAttribute("aria-busy", "true");
  label.innerHTML = '<span class="spinner"></span> Signing in…';

  try {
    await login(d);
    setTimeout(() => location.replace(next), 700);
  } catch (err) {
    console.error(err);
    showAlert("err", errText(err));
    btn.disabled = false;
    btn.removeAttribute("aria-busy");
    label.innerHTML = original;
  }
});

form.querySelectorAll("input").forEach((i) => i.addEventListener("input", () => setError(i)));
