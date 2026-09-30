import { login } from "../core/auth.js";
import { auth } from "../core/firebase-config.js";
import { pageUrl } from "../core/app.js";

/* /register.js */
import { $, strength, field, formData, setError, isEmail, esc } from "../core/app.js";
import { register, errText, guestOnly } from "../core/auth.js";
import { icon } from "../components/icons.js";

const form = $("#regForm");

if (window.matchMedia("(max-width: 940px)").matches) {
  $("#mobileBrand")?.style.setProperty("display", "inline-flex");
}

guestOnly("../../pages/dashboard.html");

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-peek]");
  if (!b) return;
  const inp = b.previousElementSibling;
  const show = inp.type === "password";
  inp.type = show ? "text" : "password";
  b.textContent = show ? "Hide" : "Show";
});

const HINTS = [
  "Too weak - use at least 6 characters",
  "Acceptable - try to make it stronger",
  "Good password",
  "Strong password"
];

form.password.addEventListener("input", (e) => {
  const s = strength(e.target.value);
  [...$("#meter").children].forEach((b, i) => (b.className = i < s ? "on" + s : ""));
  const hint = $("#pwHint");
  hint.textContent = HINTS[s];
  hint.className = "field-hint " + (s >= 3 ? "text-ok" : s === 2 ? "" : "text-danger");
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const d = formData(form);
  let ok = true;

    if (!d.name || d.name.length < 3) { setError(field(form, "name"), "Please enter your full name."); ok = false; } else setError(field(form, "name"));
  if (!/^[6-9]\d{9}$/.test(d.phone)) { setError(form.phone, "Enter a valid 10-digit Indian mobile number."); ok = false; } else setError(form.phone);
  if (!isEmail(d.email)) { setError(form.email, "Please enter a valid email address."); ok = false; } else setError(form.email);
  if (d.password.length < 6) { setError(form.password, "Password must be at least 6 characters."); ok = false; } else setError(form.password);
  if (d.password !== d.confirm) { setError(form.confirm, "The two passwords do not match."); ok = false; } else setError(form.confirm);
  if (!form.terms.checked) { setError(form.terms, "You must accept the terms to continue."); ok = false; } else setError(form.terms);
  if (!ok) return;

  const btn = $("#btn");
  btn.disabled = true;
  btn.querySelector(".btn-txt").innerHTML = '<span class="spinner"></span> Creating your account&hellip;';

  try {
    await register(d);
    location.replace(pageUrl("pages/dashboard.html"));
  } catch (err) {
    console.error(err);
    $("#alertBox").innerHTML = '<div class="alert alert-err mb-2"><span>!</span><div>' + esc(errText(err)) + "</div></div>";
    if (err?.code === "auth/email-already-in-use") {
      $("#alertBox").innerHTML += '<div class="fs-sm mt-1">Try <a href="' + pageUrl("pages/login.html") + '">logging in</a> or ' +
        '<a href="../../pages/forgot-password.html">reset your password</a>.</div>';
    }
    btn.disabled = false;
    btn.querySelector(".btn-txt").innerHTML = icon("rocket") + " Create account";
  }
});

form.querySelectorAll("input").forEach((i) => i.addEventListener("input", () => setError(i)));
