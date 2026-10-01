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

/* How long each kind stays. An error is given longest: it is the one an admin
   has to read and act on, and a message that goes before it has been read is
   worse than no message at all. */
const LIFE = { ok: 2600, info: 3200, warn: 4600, err: 6000 };

const KICKER = { ok: "Done", err: "Something went wrong", warn: "Heads up", info: "" };

/**
 * Shows a short message.
 *
 * @param {string} msg      what happened, in words
 * @param {"ok"|"err"|"warn"|"info"} type
 * @param {string} title    replaces the small label; rarely needed
 * @param {object} opts     { life } to override how long it stays
 */
export function toast(msg, type = "info", title = "", opts = {}) {
  const kind = ["ok", "err", "warn", "info"].includes(type) ? type : "info";
  const ic = { ok: "check", err: "x", warn: "alert", info: "info" }[kind];
  const life = Math.max(1200, Number(opts.life) || LIFE[kind] || 3200);

  /* The mark sits in a tinted tile rather than standing on its own, so what
     kind of message this is survives being read from across the room. The
     heading became a quiet uppercase kicker: "Success" above "Order deleted"
     spent the biggest line on something the reader already knew. */
  const t = el("div", { class: "toast " + kind, role: "status" },
    '<span class="t-mark">' + icon(ic) + "</span>" +
    '<div class="t-body">' +
      (title || KICKER[kind] ? '<span class="t-kicker">' + esc(title || KICKER[kind]) + "</span>" : "") +
      "<p>" + esc(msg) + "</p>" +
    "</div>" +
    '<button class="t-x" type="button" aria-label="Dismiss">' + icon("x") + "</button>" +
    /* the bar is the time left, which a flat 3.6 second wait never said */
    '<span class="t-life" style="--life:' + life + 'ms"></span>');

  const host = toastHost();
  host.appendChild(t);

  let gone = false;
  const close = () => {
    if (gone) return;
    gone = true;
    clearTimeout(timer);
    t.classList.add("out");
    setTimeout(() => t.remove(), 260);
  };

  const timer = setTimeout(close, life);
  t.querySelector(".t-x").addEventListener("click", close);

  /* held while the pointer is on it: reading a long one should not race it */
  t.addEventListener("mouseenter", () => { t.classList.add("held"); clearTimeout(timer); });
  t.addEventListener("mouseleave", () => {
    t.classList.remove("held");
    if (!gone) { clearTimeout(timer); setTimeout(close, 1400); }
  });

  /* a stack that grows past this hides the page it is talking about */
  while (host.children.length > 4) host.firstElementChild.remove();

  return { close };
}

/* ---------- modal ---------- */
