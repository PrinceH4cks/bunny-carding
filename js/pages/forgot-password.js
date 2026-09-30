import { login } from "../core/auth.js";
import { auth } from "../core/firebase-config.js";
import { pageUrl } from "../core/app.js";

/* /forgot-password.js */
import { $, formData, setError, isEmail, esc } from "../core/app.js";
import { toast } from "../components/toast.js";
import { resetPassword, errText } from "../core/auth.js";
import { icon } from "../components/icons.js";

const form = $("#fpForm");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const d = formData(form);

  if (!isEmail(d.email)) { setError(form.email, "Please enter a valid email address."); return; }
  setError(form.email);

  const btn = $("#btn");
  const label = btn.querySelector(".btn-txt").innerHTML;
  btn.disabled = true;
  btn.querySelector(".btn-txt").innerHTML = '<span class="spinner"></span> Sending&hellip;';

  try {
    await resetPassword(d.email);
    form.innerHTML = '<div class="text-center" style="padding:14px 0">' +
      '<div class="f-icon ok" style="margin:0 auto 16px;width:64px;height:64px;font-size:1.8rem">' + icon("mail") + "</div>" +
      '<h3 class="mb-1">Email sent</h3>' +
      '<p class="text-muted fs-sm">We sent a reset link to <b>' + esc(d.email) + "</b>. Check your inbox and spam folder.</p>" +
      '<a class="btn btn-primary btn-block mt-2" href="' + pageUrl("pages/login.html") + '">Back to login</a></div>';
  } catch (err) {
    console.error(err);
    const alert = document.createElement("div");
    alert.className = "alert alert-err mb-2 mt-1";
    alert.innerHTML = "<span>!</span><div>" + esc(errText(err)) + "</div>";
    form.appendChild(alert);
    btn.disabled = false;
    btn.querySelector(".btn-txt").innerHTML = label;
  }
});

form.email.addEventListener("input", () => setError(form.email));
