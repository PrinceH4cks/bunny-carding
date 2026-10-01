import { db } from "../core/db.js";
import { pageUrl } from "../core/app.js";

/* /profile.js
   Personal info, password, email verification and account deletion. */
import { $, $$, inr, field, formData, setError, isEmail, strength, fmtDate, initials } from "../core/app.js";
import { toast } from "../components/toast.js";
import { icon } from "../components/icons.js";
import { requireLogin, PROFILE, CURRENT, saveProfile, changePassword, errText, isAdmin } from "../core/auth.js";
import { getUserOrders } from "../services/order-service.js";
import {
  sendEmailVerification, reload, signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { auth } from "../core/firebase-config.js";

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
  /* Auth first, then the document. They normally agree; when the email has just
     been changed it is Auth that knows for certain, because the change is made
     there and the document only catches up. Reading the other way round is what
     put the previous address back in the box straight after it was saved. */
  field(pf, "email").value = u.email || p.email || "";
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

  /* track a real email change — against Auth's copy, for the same reason the
     box is filled from it: that is the address the account actually has */
  const pf = $("#pfForm");
  field(pf, "email")?.addEventListener("input", () => {
    dirtyEmail = field(pf, "email").value.trim().toLowerCase() !==
                 (CURRENT?.email || PROFILE?.email || "").toLowerCase();
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
    busy(btn, true);
    try {
      /* Name and phone only. The email box is readonly and the address on an
         account does not change, so there is nothing to ask a password about —
         the prompt that used to appear here, and the re-authentication behind
         it, were answering a question the form can no longer ask. */
      await saveProfile({ name: d.name, phone: d.phone });
      fill();
      toast("Profile updated.", "ok");
    } catch (err) {
      toast(errText(err), "err");
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

;
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
