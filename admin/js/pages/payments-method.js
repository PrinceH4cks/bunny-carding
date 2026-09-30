import { app, auth } from "../core/firebase-config.js";
import { db } from "../core/db.js";

/* =========================================================
   PANEL - js/payments-method.js
   The request page for one deposit method.

   These pages are a list and nothing else: which requests came in through this
   method, and the button to approve or reject each one. Every setting for all
   three methods lives together on payments-settings.html, so an admin is never
   scrolling past a form to reach the requests, and never has to configure the
   same thing in three places.

   Which page this is comes from <body data-method="zap">.
   ========================================================= */
import { $, $$, inr, esc, fmtDate, timeAgo } from "../core/app.js";
import { toast } from "../components/toast.js";
import { emptyState } from "../components/ui.js";
import { confirmBox } from "../components/modal.js";
import { getDeposits, approveDeposit, rejectDeposit } from "../services/user-service.js";
import { requireAdmin } from "../core/auth.js";
import { icon } from "../components/icons.js";

const KEY = document.body.dataset.method || "zap";

/* what the empty list says, and the badge colour for each status. Only the
   message differs per method, so the rest is shared. */
const PAGE = {
  zap: { empty: "No AutoPay deposits yet.", badge: "auto", ref: "Gateway order" },
  upi: { empty: "No manual UPI deposits yet.", badge: "", ref: "UTR" },
  crypto: { empty: "No crypto deposits yet.", badge: "", ref: "Hash" }
}[KEY] || { empty: "No deposits yet.", badge: "", ref: "Reference" };

const STATUS = {
  pending:   { label: "Created",  cls: "badge-warn"   },
  submitted: { label: "Awaiting", cls: "badge-info"   },
  approved:  { label: "Approved", cls: "badge-ok"     },
  rejected:  { label: "Rejected", cls: "badge-danger" }
};
const badge = (key) => {
  const s = STATUS[key] || { label: key || "—", cls: "badge-dark" };
  return '<span class="badge ' + s.cls + ' badge-dot">' + esc(s.label) + "</span>";
};

const mini = (icName, label, val, bg, fg) =>
  '<div class="card card-pad"><div class="stat">' +
  '<div class="stat-ic" style="background:' + bg + ";color:" + fg + '">' + icon(icName) + "</div>" +
  '<div style="min-width:0"><div class="stat-v" style="font-size:1.3rem">' + val + "</div>" +
  "<div class='stat-l'>" + label + "</div></div></div></div>";

let DEPS = [];
let depFilter = "";

/* only this method's deposits, since the page is about this method */
const mine = () => DEPS.filter((d) => (d.method || "upi") === KEY);

/* ---------- load ---------- */
async function load() {
  try {
    DEPS = await getDeposits({ limitN: 300 });
    paint();
    const sd = $("#sideDep");
    if (sd) {
      /* the group header's count covers every method, so an admin sees work
         waiting from whichever page they are on */
      const total = DEPS.filter((d) => d.status === "submitted").length;
      sd.textContent = total;
      sd.classList.toggle("hidden", !total);
    }
  } catch (e) {
    console.error(e);
    $("#depRows").innerHTML = '<tr><td colspan="7"><div class="alert alert-err">' + icon("alert") +
      "<div><b>Could not load these requests</b><br>" + esc(e.message || "Check your Firestore rules.") + "</div></div></td></tr>";
  }
}

function paint() {
  const all = mine();
  $("#mini").innerHTML =
    mini("hourglass", "Waiting for you", all.filter((d) => d.status === "submitted").length, "var(--warn-50)", "var(--warn-600)") +
    mini("coins", "Credited to wallets", inr(all.filter((d) => d.status === "approved").reduce((s, d) => s + Number(d.amount || 0), 0)), "var(--ok-50)", "var(--ok-600)") +
    mini("clock", "Created, not submitted", all.filter((d) => d.status === "pending").length, "var(--ink-100)", "var(--ink-500)") +
    mini("x", "Rejected", all.filter((d) => d.status === "rejected").length, "var(--danger-50)", "var(--danger-600)");
  render();
}

function render() {
  const list = depFilter ? mine().filter((d) => d.status === depFilter) : mine();
  const rows = $("#depRows");

  if (!list.length) {
    rows.innerHTML = '<tr><td colspan="7">' + emptyState({
      icon: "coins", title: depFilter ? "Nothing with that status" : "Nothing here yet",
      text: depFilter ? "Try another status above." : PAGE.empty
    }) + "</td></tr>";
    return;
  }

  rows.innerHTML = list.slice(0, 150).map((d) => {
    /* the reference is what the admin types into their bank app, so it is shown
       in full and copyable rather than shortened */
    const ref = String(d.hash || d.utr || "").trim();
    return `
    <tr>
      <td>
        <div class="flex gap-2 center">
          <span class="avatar avatar-sm">${esc((d.userName || "U")[0].toUpperCase())}</span>
          <div style="min-width:0">
            <b class="fs-sm" style="display:block">${esc(d.userName || "Guest")}</b>
            <small class="text-muted">${esc(d.userEmail || "")}</small>
            ${d.userPhone ? '<small class="text-muted" style="display:block">' + esc(d.userPhone) + "</small>" : ""}
          </div>
        </div>
      </td>
      <td class="num fw-7">${inr(d.amount)}</td>
      <td>${ref
        ? '<div class="flex gap-1 center"><code class="mono dep-ref">' + esc(ref) + "</code>" +
          '<button class="btn btn-ghost btn-xs js-copy" data-copy="' + esc(ref) + '" title="Copy ' + esc(PAGE.ref) + '">' + icon("copy", "ic ic-sm") + "</button></div>"
        : '<span class="text-muted">—</span>'}</td>
      <td>${esc(details(d)) || '<span class="text-muted">—</span>'}</td>
      <td>${badge(d.status)}</td>
      <td class="fs-xs text-muted">${timeAgo(d.createdAt)}</td>
      <td>
        <div class="flex gap-1 justify-end">
          ${d.status === "submitted" ? `
            <button class="btn btn-ok btn-xs js-ok" data-id="${esc(d.id)}" data-amt="${d.amount}" title="Approve and credit the wallet">${icon("check", "ic ic-sm")} Approve</button>
            <button class="btn btn-danger btn-xs js-no" data-id="${esc(d.id)}" title="Reject">${icon("x", "ic ic-sm")}</button>
          ` : `<span class="fs-xs text-muted">${d.status === "approved" ? fmtDate(d.updatedAt, false) : "—"}</span>`}
        </div>
      </td>
    </tr>`;
  }).join("");

  $$(".js-ok").forEach((b) => b.addEventListener("click", () => okDeposit(b.dataset.id, Number(b.dataset.amt))));
  $$(".js-no").forEach((b) => b.addEventListener("click", () => noDeposit(b.dataset.id)));
  $$(".js-copy").forEach((b) => b.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(b.dataset.copy);
      toast(PAGE.ref + " copied.", "ok");
    } catch { toast("Copy failed. Select the text and copy it.", "warn"); }
  }));
}

/* the one detail that is specific to this method, and nothing else */
function details(d) {
  if (KEY === "crypto") return [d.cryptoCurrency, d.cryptoNetwork].filter(Boolean).join(" / ");
  if (KEY === "zap" && d.autoApproved) return PAGE.badge;
  return "";
}

/* ---------- actions ---------- */
async function okDeposit(id, amount) {
  const d = mine().find((x) => x.id === id);
  /* the confirm box repeats the two things that decide it: who, and how much */
  const ok = await confirmBox({
    title: "Approve " + inr(amount) + " from " + (d?.userName || d?.userEmail || "this customer") + "?",
    text: (d?.utr || d?.hash ? PAGE.ref + ": " + (d.utr || d.hash) + ". " : "") +
      "Their wallet will be credited " + inr(amount) + ".",
    ok: "Approve", danger: false
  });
  if (!ok) return;
  try {
    await approveDeposit(id, d.userId, amount);
    toast("Wallet credited " + inr(amount) + ".", "ok");
    await load();
  } catch (e) { console.error(e); toast("Could not credit the wallet.", "err"); }
}

async function noDeposit(id) {
  const d = mine().find((x) => x.id === id);
  const ok = await confirmBox({
    title: "Reject " + inr(d?.amount) + " from " + (d?.userName || d?.userEmail || "this customer") + "?",
    text: "Nothing is credited. You can approve it later if it was a mistake.",
    ok: "Reject"
  });
  if (!ok) return;
  try {
    await rejectDeposit(id);
    toast("Deposit rejected.", "info");
    await load();
  } catch (e) { console.error(e); toast("Could not reject the deposit.", "err"); }
}

/* ---------- boot ---------- */
function bind() {
  $("#refresh")?.addEventListener("click", async () => {
    const b = $("#refresh");
    b.innerHTML = '<span class="spinner"></span>';
    await load();
    b.innerHTML = icon("refresh", "ic ic-sm") + " Refresh";
    toast("Page refreshed.", "ok");
  });

  $("#depChips")?.addEventListener("click", (e) => {
    const c = e.target.closest("[data-df]");
    if (!c) return;
    depFilter = c.dataset.df;
    $$("#depChips .chip").forEach((x) => x.classList.toggle("active", x === c));
    render();
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  await requireAdmin();
  bind();
  await load();
});
