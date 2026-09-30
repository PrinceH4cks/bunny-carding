import { register } from "../core/auth.js";
import { auth } from "../core/firebase-config.js";
import { pageUrl } from "../core/app.js";

/* /login.js */
import { $, formData, setError, isEmail, esc } from "../core/app.js";
import { toast } from "../components/toast.js";
import { login, loginWithGoogle, errText, guestOnly, isAdmin } from "../core/auth.js";

const form = $("#loginForm");
const signInBtn = $("#btn");
const next = new URLSearchParams(location.search).get("next") || "";

if (window.matchMedia("(max-width: 940px)").matches) {
  $("#mobileBrand")?.style.setProperty("display", "inline-flex");
}

function showAlert(type, text) {
  /* nothing worth saying is not shown as an empty red box */
  if (!text) { $("#alertBox").innerHTML = ""; return; }
  $("#alertBox").innerHTML = '<div class="alert alert-' + type + ' mb-2"><span>' +
    (type === "err" ? "!" : "i") + "</span><div>" + esc(text) + "</div></div>";
}

/* where to go once someone is in. A next= in the address is only followed when
   it is a path on this site — anything absolute would let a link send a signed-in
   visitor off to somebody else's page. */
const goAfter = () => (next && !next.startsWith("http") && !next.startsWith("//") ? next : pageUrl("pages/dashboard.html"));

/* already signed in? leave immediately (fires once, no side effects later) */
guestOnly(goAfter());

/* the admin panel is a separate project, so an admin signing in here
   still goes to the user dashboard. */
void isAdmin;

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-peek]");
  if (!b) return;
  const inp = b.previousElementSibling;
  const show = inp.type === "password";
  inp.type = show ? "text" : "password";
  /* The eye was drawn inside this button, and setting textContent on it threw
     the icon away — so after one tap the button had a word on it and no eye.
     Only the label beside the icon is changed now, and the name a screen reader
     reads is changed with it, so it says what the next tap will do rather than
     repeating what the last one did. */
  const word = b.querySelector("[data-peek-word]");
  if (word) word.textContent = show ? "Hide" : "Show";
  b.setAttribute("aria-label", show ? "Hide password" : "Show password");
  b.setAttribute("aria-pressed", show ? "true" : "false");
});

/* Caps Lock turns every capital letter into a Shift, and the result looks like a
   typo rather than a locked key — so people type their password twice, in
   capitals, and then cannot get in. Said once, quietly, while it is true. */
const pwField = form.querySelector('input[name="password"]');
if (pwField) {
  const capsNote = document.createElement("div");
  capsNote.className = "field-hint";
  capsNote.hidden = true;
  pwField.closest(".field")?.appendChild(capsNote);

  const capsOn = (e) => {
    const on = e.getModifierState && e.getModifierState("CapsLock");
    capsNote.hidden = !on;
    if (capsNote.textContent !== (on ? "Caps Lock is on. Your password may contain capital letters." : ""))
      capsNote.textContent = on ? "Caps Lock is on. Your password may contain capital letters." : "";
  };
  pwField.addEventListener("keyup", capsOn);
  pwField.addEventListener("keydown", capsOn);
  pwField.addEventListener("blur", () => { capsNote.hidden = true; });
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const d = formData(form);
  let ok = true;

  if (!isEmail(d.email)) { setError(form.email, "Please enter a valid email address."); ok = false; } else setError(form.email);
  if (!d.password) { setError(form.password, "Please enter your password."); ok = false; } else setError(form.password);
  if (!ok) return;

  const btn = $("#btn");
  const txt = btn.querySelector(".btn-txt").innerHTML;
  btn.disabled = true;
  btn.querySelector(".btn-txt").innerHTML = '<span class="spinner"></span> Signing in&hellip;';

  try {
    await login(d);
    location.replace(goAfter());
  } catch (err) {
    console.error(err);
    showAlert("err", errText(err));
    if (["auth/user-not-found", "auth/wrong-password", "auth/invalid-credential"].includes(err?.code)) {
      $("#alertBox").innerHTML += '<div class="fs-sm mt-1">No account? <a href="' + pageUrl("pages/register.html") + '">Create one</a> &middot; ' +
        '<a href="' + pageUrl("pages/forgot-password.html") + '">Reset your password</a></div>';
    }
    btn.disabled = false;
    btn.querySelector(".btn-txt").innerHTML = txt;
  }
});

form.querySelectorAll("input").forEach((i) => i.addEventListener("input", () => setError(i)));

/* ---------- continue with Google ---------- */
const gBtn = $("#googleBtn");
if (gBtn) {
  const busy = (on, label) => {
    gBtn.disabled = on;
    /* the two buttons are the same journey, so they are locked together: a
       double tap on a slow phone was signing the visitor in twice */
    if (signInBtn) signInBtn.disabled = on;
    gBtn.querySelector(".btn-txt").innerHTML = on
      ? '<span class="spinner"></span> ' + label
      : '<svg class="ic" aria-hidden="true"><use href="#i-google"></use></svg> Continue with Google';
  };

  gBtn.addEventListener("click", async () => {
    showAlert("", "");
    busy(true, "Opening Google&hellip;");
    try {
      const user = await loginWithGoogle();
      /* null means the visitor closed the window, or that the page is on its way
         to Google and will come back by itself. Neither is a failure. */
      if (user) location.replace(goAfter());
      else busy(false);
    } catch (err) {
      console.error(err);
      showAlert("err", errText(err));
      busy(false);
    }
  });
}
