import { db } from "../core/db.js";
import { pageUrl } from "../core/app.js";

/* /profile.js
   Personal info, password, email verification and account deletion. */
import { $, $$, inr, field, formData, setError, isEmail, strength, fmtDate, initials } from "../core/app.js";
import { toast } from "../components/toast.js";
import { confirmBox } from "../components/modal.js";
import { icon } from "../components/icons.js";
import { requireLogin, PROFILE, CURRENT, saveProfile, changePassword, errText, isAdmin } from "../core/auth.js";
import { getUserOrders } from "../services/order-service.js";
import {
  sendEmailVerification, reload, deleteUser, signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { auth } from "../core/firebase-config.js";

/* ---------- confirm-password prompt (needed to change an email) ----------
   Resolves with the password string, or null if the user backs out. */
function askPassword() {
  return new Promise((resolve) => {
    const back = document.createElement("div");
    back.className = "modal-back open";
    back.innerHTML =
      '<div class="modal">' +
        '<div class="modal-head"><h3>Confirm your password</h3>' +
          '<button class="x-btn" data-no>' + icon("x") + "</button></div>" +
        '<div class="modal-body">' +
          '<div class="field">' +
            "<label>Current password</label>" +
            '<input class="input" type="password" id="reauthPw" autocomplete="current-password">' +
            '<div class="field-hint">Firebase asks for your password again before it lets you ' +
              "change the email address on an account.</div>" +
          "</div>" +
        "</div>" +
        '<div class="modal-foot">' +
          '<button class="btn btn-ghost" data-no>Cancel</button>' +
          '<button class="btn btn-primary" data-yes>Confirm</button>' +
        "</div>" +
      "</div>";
    document.body.appendChild(back);
    document.body.classList.add("no-scroll");

    const input = back.querySelector("#reauthPw");
    const done = (v) => {
      back.remove();
      document.body.classList.remove("no-scroll");
      resolve(v);
    };
    back.querySelectorAll("[data-no]").forEach((b) => b.addEventListener("click", () => done(null)));
    back.querySelector("[data-yes]").addEventListener("click", () => {
      const v = input.value;
      if (!v) { toast("Please enter your password.", "warn"); input.focus(); return; }
      done(v);
    });
    back.addEventListener("keydown", (e) => {
      if (e.key === "Enter") back.querySelector("[data-yes]").click();
      if (e.key === "Escape") done(null);
    });
    back.addEventListener("click", (e) => { if (e.target === back) done(null); });
    setTimeout(() => input.focus(), 60);
  });
}

/* ---------- button spinner ----------
   Reads and writes the inner .btn-txt span, but never assumes it exists —
   a missing span used to throw and kill the whole save. */
function busy(btn, on, label = '<span class="spinner"></span> Saving…') {
  if (!btn) return;
  const txt = btn.querySelector(".btn-txt") || btn;
  if (on) {
    btn.dataset.label = txt.innerHTML;
    btn.disabled = true;
    txt.innerHTML = label;
  } else {
    btn.disabled = false;
    txt.innerHTML = btn.dataset.label || txt.innerHTML;
  }
}

/* Fires only when the value actually changed, so we never ask for a password
   when the user just pressed Save with the same email. */
let dirtyEmail = false;

function fill() {
  const p = PROFILE || {};
  const u = CURRENT;
  if (!u) return;

  const pf = $("#pfForm");
  field(pf, "name").value  = p.name  || u.displayName || "";
  field(pf, "email").value = p.email || u.email || "";
  field(pf, "phone").value = p.phone || "";

  const admin = isAdmin();
  const rb = $("#roleBadge");
  rb.textContent = admin ? "Admin" : "Member";
  rb.className = "badge " + (admin ? "badge-warn" : "badge-brand");

  const init = initials(p.name || u.displayName || u.email || "");
  $$("[data-auth-initial]").forEach((n) => (n.textContent = init));

  const since = $("#since");
  if (since) since.textContent = p.createdAt ? fmtDate(p.createdAt, false) : "—";

  paintVerify(u);
  dirtyEmail = false;
}

/* email verification status line + button state */
function paintVerify(u) {
  const badge = $("#verifyBadge");
  const btn = $("#reverify");
  const ok = !!u.emailVerified;
  if (badge) {
    badge.className = "badge " + (ok ? "badge-ok" : "badge-warn");
    badge.innerHTML = ok ? icon("check", "ic ic-sm") + " Verified" : icon("alert", "ic ic-sm") + " Not verified";
  }
  if (btn) {
    btn.disabled = ok;
    btn.classList.toggle("hidden", ok);
  }
}

async function stats() {
  const set = (id, v) => { const n = $("#" + id); if (n) n.textContent = v; };
  try {
    const o = await getUserOrders(CURRENT.uid);
    set("ordCount", String(o.length));
    set("spent", inr(o.filter((x) => x.status !== "cancelled").reduce((s, x) => s + Number(x.total || 0), 0)));
  } catch { /* leave the dashes */ }
}

function bind() {
  /* show / hide password — swaps the icon instead of destroying it */
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-peek]");
    if (!b) return;
    const inp = b.parentElement?.querySelector("input") || b.previousElementSibling;
    if (!inp) return;
    const show = inp.type === "password";
    inp.type = show ? "text" : "password";
    b.setAttribute("aria-label", show ? "Hide password" : "Show password");
    const use = b.querySelector("use");
    if (use) use.setAttribute("href", show ? "#i-eye-off" : "#i-eye");
    else b.textContent = show ? "Hide" : "Show";
  });

  /* clear a field error as soon as the user types */
  $$("input,textarea,select").forEach((i) =>
    i.addEventListener("input", () => setError(i)));

  /* password strength meter */
  const np = field($("#pwForm"), "new");
  const meter = $("#meter");
  const paintMeter = () => {
    if (!meter || !np) return;
    const s = strength(np.value);
    [...meter.children].forEach((b, i) => (b.className = i < s ? "on" + s : ""));
  };
  np?.addEventListener("input", paintMeter);
  paintMeter();

  /* track a real email change */
  const pf = $("#pfForm");
  field(pf, "email")?.addEventListener("input", () => {
    dirtyEmail = field(pf, "email").value.trim().toLowerCase() !==
                 (PROFILE?.email || CURRENT.email || "").toLowerCase();
  });

  /* ---------- personal info ---------- */
  pf.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target, d = formData(f);
    const fName = field(f, "name"), fEmail = field(f, "email"), fPhone = field(f, "phone");

    let ok = true;
    if (!d.name || d.name.length < 3) { setError(fName, "Please enter your full name."); ok = false; } else setError(fName);
    if (!/^[6-9]\d{9}$/.test(d.phone)) { setError(fPhone, "Enter a valid 10-digit mobile number."); ok = false; } else setError(fPhone);
    if (!isEmail(d.email)) { setError(fEmail, "Please enter a valid email address."); ok = false; } else setError(fEmail);
    if (!ok) { toast("Please fix the highlighted fields.", "warn"); return; }

    const btn = $("#pfBtn");
    const current = (PROFILE?.email || CURRENT.email || "");
    const emailChanged = d.email.toLowerCase() !== current.toLowerCase();

    busy(btn, true);
    try {
      let reauth = null;
      if (emailChanged) {
        const typed = await askPassword();
        if (typed === null) { toast("Email address was not changed.", "info"); return; }
        reauth = typed;
      }
      await saveProfile({ name: d.name, phone: d.phone, email: d.email }, { reauth });
      fill();
      toast(emailChanged
        ? "Profile updated. We sent a verification link to your new email."
        : "Profile updated.", "ok");
    } catch (err) {
      toast(err?.code === "auth/wrong-password" || err?.code === "auth/invalid-credential"
        ? "That password is not correct, so the email was not changed."
        : errText(err), "err");
    }
    finally { busy(btn, false); }
  });

  /* ---------- password ---------- */
  $("#pwForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target, d = formData(f);
    const fOld = field(f, "old"), fNew = field(f, "new"), fCon = field(f, "confirm");

    let ok = true;
    if (!d.old) { setError(fOld, "Please enter your current password."); ok = false; } else setError(fOld);
    if (!d.new || d.new.length < 6) { setError(fNew, "Password must be at least 6 characters."); ok = false; } else setError(fNew);
    if (d.new !== d.confirm) { setError(fCon, "The two passwords do not match."); ok = false; } else setError(fCon);
    if (ok && d.old === d.new) { setError(fNew, "The new password must be different from the current one."); ok = false; }
    if (!ok) return;

    const btn = $("#pwBtn");
    busy(btn, true, '<span class="spinner"></span> Verifying…');
    try {
      await signInWithEmailAndPassword(auth, CURRENT.email, d.old);
      await changePassword(d.new);
      f.reset();
      paintMeter();
      $$("#pwForm input").forEach((i) => setError(i));
      toast("Your password has been updated.", "ok");
    } catch (err) {
      toast(err?.code === "auth/wrong-password" || err?.code === "auth/invalid-credential"
        ? "That current password is not correct."
        : errText(err), "err");
    }
    finally { busy(btn, false); }
  });

  /* ---------- email verification ---------- */
  $("#reverify")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    busy(btn, true, '<span class="spinner"></span> Sending…');
    try {
      await sendEmailVerification(CURRENT);
      toast("Verification email sent. Please check your inbox.", "ok");
    } catch (err) { toast(errText(err), "err"); }
    finally { busy(btn, false, ""); paintVerify(CURRENT); }
  });

  /* ---------- delete account ---------- */
  $("#delBtn")?.addEventListener("click", async () => {
    const ok = await confirmBox({
      title: "Delete your account?",
      text: "Your sign-in will stop working straight away and your saved profile will be " +
            "removed. Past orders are kept for our records so we can settle any refunds. " +
            "This cannot be undone.",
      ok: "Yes, delete it"
    });
    if (!ok) return;
    const sure = await confirmBox({
      title: "Are you certain?",
      text: "Confirm once more and your account will be deleted immediately.",
      ok: "Delete my account"
    });
    if (!sure) return;
    try {
      await deleteUser(CURRENT);
      toast("Your account has been deleted.", "info");
      setTimeout(() => (location.href = pageUrl("index.html")), 900);
    } catch {
      toast("Could not delete the account. Please sign out, sign back in and try again.", "err");
    }
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  await requireLogin();
  if (!CURRENT) return;
  fill();
  bind();
  stats();

  /* keep the page honest if the user verifies their email in another tab */
  window.addEventListener("focus", () => {
    reload(CURRENT).then(paintVerify).catch(() => {});
  });
});
