import { esc } from "../core/app.js";
import { icon } from "./icons.js";

export const skCards = (n = 8) =>
  Array.from({ length: n }, () =>
    '<div class="card"><div class="sk sk-media"></div><div class="card-pad">' +
    '<div class="sk sk-line" style="width:35%"></div><div class="sk sk-title"></div>' +
    '<div class="sk sk-line" style="width:90%"></div><div class="sk sk-line" style="width:55%"></div>' +
    "</div></div>").join("");

export const skRows = (n = 6, cols = 5) =>
  Array.from({ length: n }, () =>
    "<tr>" + Array.from({ length: cols }, () =>
      '<td><div class="sk sk-line" style="width:70%;margin:0"></div></td>').join("") + "</tr>").join("");

export function emptyState({ icon: ic = "box", title = "Nothing here yet", text = "", action = "" } = {}) {
  return '<div class="empty"><div class="empty-ic">' + icon(ic) + "</div>" +
    "<h3>" + esc(title) + "</h3>" +
    (text ? "<p>" + esc(text) + "</p>" : "") + action + "</div>";
}

export const loaderHtml = (text = "Loading…") =>
  '<div class="loader"><span class="spinner spinner-lg" style="color:var(--brand-500)"></span>' + esc(text) + "</div>";

/* ---------- status maps ---------- */
/* Nothing is packed or shipped here, so there is no Packed or Shipped
   state to show. Orders go received -> confirmed -> ready -> completed. */
