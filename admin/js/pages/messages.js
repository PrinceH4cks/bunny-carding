import { brandName } from "../core/brand.js";
import { auth } from "../core/firebase-config.js";
import { db } from "../core/db.js";

/* =========================================================
   /messages.js
   Inbox for the storefront contact form.

   The form has been writing to the messages collection all along but nothing
   ever read it back, so enquiries were going nowhere. This is that missing view.
   ========================================================= */

import { $, $$, esc, timeAgo, fmtDate, initials } from "../core/app.js";
import { toast } from "../components/toast.js";
import { emptyState, skRows } from "../components/ui.js";
import { confirmBox } from "../components/modal.js";
import { getMessages, setMessageRead, setAllMessagesRead, removeMessage, removeHandledMessages } from "../services/content-service.js";
import { requireAdmin } from "../core/auth.js";
import { icon } from "../components/icons.js";

let all = [];
let filter = "all";

/* The contact form writes: name, email, phone, topic, message, handled,
   createdAt. These two helpers keep that shape in one place so the flag and the
   subject line cannot drift apart again. */
const isHandled = (m) => !!(m.handled ?? m.read);

const subjectOf = (m) =>
  String(m.topic || m.subject || "").trim() || String(m.message || "").trim().slice(0, 60) || "(no message)";

const mailto = (m) =>
  "mailto:" + encodeURIComponent(m.email || "") +
  "?subject=" + encodeURIComponent("Re: your " + brandName() + " enquiry" + (subjectOf(m) ? " — " + subjectOf(m) : "")) +
    "&body=" + encodeURIComponent((m.message || "") + "\n\n— sent from the " + brandName() + " contact form");

function paintStats() {
  const unread = all.filter((m) => !isHandled(m)).length;
  const week = Date.now() - 7 * 864e5;
  const recent = all.filter((m) => {
    const t = m.createdAt && typeof m.createdAt.toDate === "function" ? m.createdAt.toDate().getTime() : null;
    return t ? t >= week : false;
  }).length;
  const latest = all[0];

  $("#kTotal").textContent = all.length;
  $("#kUnread").textContent = unread;
  $("#kWeek").textContent = recent;
  $("#kLatest").textContent = latest ? timeAgo(latest.createdAt) : "—";

  const pill = $("#sideMsg");
  if (pill) {
    pill.textContent = unread;
    pill.classList.toggle("hidden", !unread);
  }
}

/* keeps the button's count honest after every load */
function paintClear() {
  const btn = $("#clearHandled");
  if (!btn) return;
  const n = all.filter((m) => isHandled(m)).length;
  btn.hidden = !n;
  btn.innerHTML = icon("trash", "ic ic-sm") + " Clear " + n + " handled";
}

async function clearHandled() {
  const gone = all.filter((m) => isHandled(m));
  if (!gone.length) { toast("Nothing handled to clear.", "info"); return; }
  const go = await confirmBox({
    title: "Delete " + gone.length + " handled message" + (gone.length === 1 ? "?" : "s?"),
    text: "These have already been dealt with. Anything still waiting is kept.",
    ok: "Delete them"
  });
  if (!go) return;
  try {
    await removeHandledMessages(gone.map((m) => m.id));
    toast(gone.length + " message" + (gone.length === 1 ? "" : "s") + " removed.", "ok");
    await load();
  } catch (err) {
    console.error(err);
    toast("Could not delete: " + (err.message || err), "err");
  }
}

function paint() {
  paintStats();
  paintClear();

  const rows = filter === "unread" ? all.filter((m) => !isHandled(m)) : all;
  if (!rows.length) {
    $("#list").innerHTML = emptyState({
      icon: "mail",
      title: filter === "unread" ? "Nothing waiting" : "No messages yet",
      text: filter === "unread"
        ? "Every enquiry has been dealt with."
        : "Enquiries sent from the contact page will land here."
    });
    return;
  }

  $("#list").innerHTML = rows.map((m) => {
    const who = String(m.name || m.email || "Anonymous").trim();
    const done = isHandled(m);
    return '<div class="card card-pad mb-2"' + (done ? "" : ' style="border-left:3px solid var(--brand-500)"') + ">" +
      '<div class="flex between center gap-2 wrap">' +
        '<div class="flex gap-2 center" style="min-width:0">' +
          '<span class="avatar avatar-sm">' + esc(initials(who)) + "</span>" +
          "<div style='min-width:0'>" +
            "<b class='fs-sm'>" + esc(who) + "</b>" +
            "<div class='fs-xs text-muted'>" + esc(m.email || "no email") +
              (m.phone ? " &middot; " + esc(m.phone) : "") + "</div>" +
          "</div>" +
        "</div>" +
        '<div class="flex gap-1 center" style="flex:0 0 auto">' +
          (done ? '<span class="badge badge-ok">handled</span>' : '<span class="badge badge-brand">new</span>') +
          '<span class="fs-xs text-muted" title="' + esc(fmtDate(m.createdAt, true)) + '">' + esc(timeAgo(m.createdAt)) + "</span>" +
        "</div>" +
      "</div>" +
      '<p class="fs-sm mt-2 mb-1"><b>' + esc(subjectOf(m)) + "</b></p>" +
      '<p class="fs-sm text-muted" style="white-space:pre-wrap">' + esc(String(m.message || "")) + "</p>" +
      '<div class="flex gap-2 wrap mt-2">' +
        (m.email ? '<a class="btn btn-ghost btn-xs" href="' + esc(mailto(m)) + '">' + icon("mail") + " Reply by email</a>" : "") +
        (m.phone ? '<a class="btn btn-ghost btn-xs" href="tel:' + esc(m.phone) + '">' + icon("phone") + " Call</a>" : "") +
        '<button class="btn btn-ghost btn-xs" data-toggle="' + esc(m.id) + '">' + icon("check") + (done ? " Mark as new" : " Mark handled") + "</button>" +
        '<button class="btn btn-ghost btn-xs" data-del="' + esc(m.id) + '">' + icon("trash") + " Delete</button>" +
      "</div>" +
    "</div>";
  }).join("");
}

async function load() {
  $("#list").innerHTML = skRows(3, 5);
  all = await getMessages();
  /* newest first, regardless of what the query returned */
  all.sort((a, b) => {
    const ta = a.createdAt?.toDate?.().getTime?.() || 0;
    const tb = b.createdAt?.toDate?.().getTime?.() || 0;
    return tb - ta;
  });
  paint();
}

document.addEventListener("DOMContentLoaded", async () => {
await requireAdmin();

  $("#reloadBtn").addEventListener("click", load);

  $("#clearHandled")?.addEventListener("click", clearHandled);

  $("#filter").addEventListener("change", (e) => {
    filter = e.target.value;
    paint();
  });

  $("#readAll").addEventListener("click", async () => {    const open = all.filter((m) => !isHandled(m)).length;
    if (!open) return toast("There is nothing waiting.", "warn");
    const go = await confirmBox({
      title: "Mark every message as handled?",
      text: open + " message(s) will be marked as handled.",
      ok: "Mark all handled", danger: false
    });
    if (!go) return;
    try {
      await setAllMessagesRead(true);
      toast("All messages marked as handled.", "ok");
      await load();
    } catch (e) {
      toast("Could not update: " + (e.message || e), "err");
    }
  });

  $("#list").addEventListener("click", async (e) => {
    const tg = e.target.closest("[data-toggle]");
    const dl = e.target.closest("[data-del]");
    if (!tg && !dl) return;
    const id = (tg || dl).dataset.toggle || (tg || dl).dataset.del;
    const m = all.find((x) => x.id === id);
    if (!m) return;

    if (tg) {
      try {
        await setMessageRead(id, !isHandled(m));
        await load();
      } catch (err) {
        toast("Could not update: " + (err.message || err), "err");
      }
      return;
    }

    const go = await confirmBox({
      title: "Delete this message?",
      text: "From " + (m.name || m.email || "anonymous") + ": " + String(subjectOf(m)).slice(0, 120) + ". This cannot be undone.",
      ok: "Delete", danger: true
    });
    if (!go) return;
    try {
      await removeMessage(id);
      toast("Message deleted.", "ok");
      await load();
    } catch (err) {
      toast("Could not delete: " + (err.message || err), "err");
    }
  });

  await load();
});
