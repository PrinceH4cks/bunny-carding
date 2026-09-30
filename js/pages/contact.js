/* /contact.js  (message saved to Firestore) */
import { $, field, formData, setError, isEmail } from "../core/app.js";
import { toast } from "../components/toast.js";
import { addDoc, serverTimestamp, collection } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db, COL } from "../core/db.js";
import { icon } from "../components/icons.js";

const form = $("#contactForm");

document.addEventListener("DOMContentLoaded", () => {
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const d = formData(form);
    let ok = true;

    if (!d.name || d.name.length < 2) { setError(field(form, "name"), "Please enter your name."); ok = false; } else setError(field(form, "name"));
    if (!isEmail(d.email)) { setError(form.email, "Please enter a valid email address."); ok = false; } else setError(form.email);
    if (!d.message || d.message.length < 8) { setError(form.message, "Please write a slightly longer message."); ok = false; } else setError(form.message);
    if (!form.agree.checked) { toast("Please accept the privacy policy.", "warn"); ok = false; }

    if (!ok) return;

    const btn = $("#sendBtn");
    const label = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Sending&hellip;';

    try {
      await addDoc(collection(db, COL.messages), {
        name: d.name, email: d.email, phone: d.phone || "",
        topic: d.topic || "Other", message: d.message,
        handled: false, createdAt: serverTimestamp()
      });
      form.reset();
      toast("Message received. We will reply within 24 hours.", "ok", "Thank you!");
    } catch (err) {
      console.error(err);
      toast("Your message could not be sent. Please try again later.", "err");
    } finally {
      btn.disabled = false;
      btn.innerHTML = label;
    }
  });

  form.querySelectorAll("input, textarea").forEach((i) => i.addEventListener("input", () => setError(i)));
});
