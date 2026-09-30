import { $, el, esc } from "../core/app.js";
import { icon } from "./icons.js";

/* The stack the messages sit in, created once and then reused. It is kept here
   rather than in the page because the toast is the one piece that has to exist
   before anything else is on screen. */
function toastHost() {
  let w = $(".toast-wrap");
  if (!w) { w = el("div", { class: "toast-wrap" }); document.body.appendChild(w); }
  return w;
}

export function toast(msg, type = "info", title = "") {
  const ic = { ok: "check", err: "x", warn: "alert", info: "info" }[type] || "info";
  const defTitle = { ok: "Success", err: "Error", warn: "Heads up", info: "Info" }[type];
  const t = el("div", { class: "toast " + type },
    icon(ic, "t-ic") +
    "<div><b>" + esc(title || defTitle) + "</b><p>" + esc(msg) + "</p></div>");
  toastHost().appendChild(t);
  setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 300); }, 3600);
}

/* ---------- modal ---------- */
