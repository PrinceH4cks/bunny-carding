import { $, el, esc } from "../core/app.js";
import { icon } from "./icons.js";

export function openModal(id) {
  const m = typeof id === "string" ? $("#" + id) : id;
  if (!m) return;
  m.classList.add("open");
  document.body.classList.add("no-scroll");
  const f = m.querySelector("input,select,textarea,button:not(.x-btn)");
  if (f) setTimeout(() => f.focus(), 60);
}

export function closeModal(id) {
  const m = typeof id === "string" ? $("#" + id) : id;
  if (!m) return;
  m.classList.remove("open");
  if (!$(".modal-back.open")) document.body.classList.remove("no-scroll");
}

export function initModals() {
  document.addEventListener("click", (e) => {
    const closer = e.target.closest("[data-close]");
    if (closer) { closeModal(closer.closest(".modal-back")); return; }
    if (e.target.classList.contains("modal-back")) closeModal(e.target);
    const opener = e.target.closest("[data-modal]");
    if (opener) { e.preventDefault(); openModal(opener.dataset.modal); return; }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { const o = $(".modal-back.open"); if (o) closeModal(o); }
  });
}

/* ---------- confirm dialog ---------- */

export function confirmBox({ title = "Are you sure?", text = "", ok = "Yes, continue", danger = true } = {}) {
  return new Promise((resolve) => {
    const back = el("div", { class: "modal-back open" },
      '<div class="modal">' +
        '<div class="modal-head"><h3>' + esc(title) + "</h3><button class='x-btn' data-no>" + icon("x") + "</button></div>" +
        '<div class="modal-body"><p class="mb-0">' + esc(text) + "</p></div>" +
        '<div class="modal-foot">' +
          '<button class="btn btn-ghost" data-no>Cancel</button>' +
          '<button class="btn ' + (danger ? "btn-danger" : "btn-primary") + '" data-yes>' + esc(ok) + "</button>" +
        "</div>" +
      "</div>");
    document.body.appendChild(back);
    document.body.classList.add("no-scroll");
    const done = (v) => { back.remove(); document.body.classList.remove("no-scroll"); resolve(v); };
    back.querySelectorAll("[data-no]").forEach((b) => b.addEventListener("click", () => done(false)));
    back.querySelector("[data-yes]").addEventListener("click", () => done(true));
  });
}

/* ---------- placeholders ---------- */
