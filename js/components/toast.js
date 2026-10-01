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

/* How long a message stays, and the word for it. An error is given longer
   because it is the one a person has to read and act on; a confirmation of
   something they just watched happen does not need to be read slowly. */
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

  const t = el("div", { class: "toast " + kind, role: "status" },
    /* the mark sits in a tinted tile rather than standing on its own, so it
       carries the meaning at a glance instead of only adding a small glyph */
    '<span class="t-mark">' + icon(ic) + "</span>" +
    '<div class="t-body">' +
      /* the label is a quiet uppercase kicker, not a heading. "Success" above
         "Card added to your cart" told the reader nothing they did not know */
      (title || KICKER[kind] ? '<span class="t-kicker">' + esc(title || KICKER[kind]) + "</span>" : "") +
      "<p>" + esc(msg) + "</p>" +
    "</div>" +
    '<button class="t-x" type="button" aria-label="Dismiss">' + icon("x") + "</button>" +
    /* the bar is how long is left, which is the thing a fixed 3.6s wait never
       told anyone. It also means the message cannot sit there looking permanent
       after it has stopped being relevant */
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

  /* Pausing on hover matters more than it looks: a message that disappears
     while it is being read is worse than no message. It costs nothing on a
     phone, where there is no hover, and on a desktop it is the difference
     between reading a long one and losing it halfway. */
  t.addEventListener("mouseenter", () => {
    t.classList.add("held");
    clearTimeout(timer);
  });
  t.addEventListener("mouseleave", () => {
    t.classList.remove("held");
    if (!gone) {
      clearTimeout(timer);
      setTimeout(close, 1400);
    }
  });

  /* more than a few at once and the stack hides the page; the oldest is dropped
     first, and the point at which that starts is where the message would have
     been off the top of a phone screen */
  while (host.children.length > 4) host.firstElementChild.remove();

  return { close };
}

/* ---------- modal ---------- */
