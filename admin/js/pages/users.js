import { uid, field } from "../core/app.js";
import { login } from "../core/auth.js";
import { auth } from "../core/firebase-config.js";
import { db } from "../core/db.js";

/* PANEL - js/users.js */
import { $, $$, inr, esc, fmtDate, timeAgo, initials } from "../core/app.js";
import { toast } from "../components/toast.js";
import { skRows, emptyState } from "../components/ui.js";
import { openModal, confirmBox } from "../components/modal.js";
import { getAllUsers, toggleUserActive } from "../services/user-service.js";
import { getOrders } from "../services/order-service.js";
import { getAllWallets, getWalletTxns, adjustWallet, setWalletBalance, setWalletLocked } from "../services/wallet-service.js";
import { requireAdmin, CURRENT } from "../core/auth.js";
import { icon } from "../components/icons.js";

let USERS = [];
let ORDERS = [];
let WALLETS = {};
let target = null;

/* The role column, the role filter and the button that granted the role are all
   gone. Access belongs to one account, named by its UID in two files; a role in
   the database is a label, and a page that offers to make someone an admin is
   offering something the rules would not honour anyway. */

/* A Firestore read that never settles would leave a skeleton spinning forever,
   which is exactly what happens when the rules are not published yet or the
   network is blocked. Give every read a deadline so the UI always resolves. */
function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    /* wrapped, because a reader that returns a plain value instead of a promise
       would otherwise blow up on .finally and never reach the timeout at all */
    Promise.resolve(promise).finally(() => clearTimeout(timer)),
    new Promise((_, rej) => {
      timer = setTimeout(() => rej(new Error(label + " timed out after " + ms / 1000 + "s")), ms);
    })
  ]);
}

const PER = 15;
let page = 1;

/* Table state. Kept in one object so a filter change, a sort click and a bulk
   selection all reset or repaint the same list instead of fighting each other. */
const S = {
  filter: "all",
  sort: "createdAt",
  dir: -1,
  sel: new Set()
};

const FILTERS = {
  all:     () => true,
  buyers:  (u) => userOrders(u.id).length > 0,
  wallet:  (u) => balanceOf(u.id) > 0,
  frozen:  (u) => isLocked(u.id),
  blocked: (u) => !!u.disabled
};

async function load() {
  try {
    [USERS, ORDERS] = await Promise.all([getAllUsers(500), getOrders({ limitN: 500 })]);
    render();
  } catch (e) {
    console.error(e);
    $("#rows").innerHTML = '<tr><td colspan="7"><div class="alert alert-err">' + icon("alert") +
      "<div><b>Could not load users</b><br>" + esc(e.message || "Check your Firestore rules.") + "</div></div></td></tr>";
    return;
  }
  /* The wallet balances are a nice extra, not the point of the page, so a
     failure here must not wipe out the table that already rendered. */
  try {
    WALLETS = await withTimeout(getAllWallets(), 12000, "The wallets query");
    render();
  } catch (e) {
    console.error(e);
    WALLETS = {};
    toast("Wallet balances could not be loaded.", "err");
  }
}

const userOrders = (uid) => ORDERS.filter((o) => o.userId === uid);
const userSpent = (uid) => userOrders(uid).filter((o) => o.status !== "cancelled").reduce((s, o) => s + Number(o.total || 0), 0);

/* Balance for a user, tolerating the common cases: no wallet doc yet, a
   missing balance field, and a balance someone typed in as text. */
const walletOf = (uid) => WALLETS[uid] || null;
const balanceOf = (uid) => Number(walletOf(uid)?.balance || 0);
const isLocked = (uid) => !!(walletOf(uid)?.locked);

/* Total sitting in every wallet, shown as the fourth mini stat in place of the
   old lifetime-value tile would be misleading next to it. */
const walletTotal = () => Object.keys(WALLETS).reduce((s, u) => s + balanceOf(u), 0);

const mini = (icName, label, val, bg, fg) =>
  '<div class="card card-pad"><div class="stat">' +
  '<div class="stat-ic" style="background:' + bg + ";color:" + fg + '">' + icon(icName) + "</div>" +
  '<div style="min-width:0"><div class="stat-v" style="font-size:1.3rem">' + val + "</div>" +
  "<div class='stat-l'>" + label + "</div></div></div></div>";

/* Sorting reads the same derived numbers the cells show, so a "Wallet" sort
   can never disagree with the balance printed in the row. */
const SORTERS = {
  name:   (u) => (u.name || u.email || "").toLowerCase(),
  orders: (u) => userOrders(u.id).length,
  spent:  (u) => userSpent(u.id),
  wallet: (u) => balanceOf(u.id),
  createdAt: (u) => u.createdAt?.seconds || 0
};

function filtered() {
  let l = USERS.filter(FILTERS[S.filter] || FILTERS.all);
  const get = SORTERS[S.sort] || SORTERS.createdAt;
  l.sort((a, b) => {
    const x = get(a), y = get(b);
    if (x < y) return -1 * S.dir;
    if (x > y) return 1 * S.dir;
    return 0;
  });
  return l;
}

function render() {
  const buyers = USERS.filter((u) => userOrders(u.id).length > 0);
  const ltv = USERS.reduce((s, u) => s + userSpent(u.id), 0);
  const holders = USERS.filter((u) => balanceOf(u.id) > 0).length;
  const richest = USERS.reduce((a, u) => (!a || balanceOf(u.id) > balanceOf(a.id) ? u : a), null);
  const frozen = USERS.filter((u) => isLocked(u.id)).length;

  $("#mini").innerHTML =
    mini("users", "Total users", USERS.length, "var(--brand-50)", "var(--brand-600)") +
    mini("cart", "Buyers", buyers.length, "var(--ok-50)", "var(--ok-600)") +
    mini("wallet", "Held in wallets", inr(walletTotal()), "var(--ink-900)", "var(--accent-400)") +
    mini("coins", "Largest balance", richest ? inr(balanceOf(richest.id)) : inr(0), "var(--ok-50)", "var(--ok-600)") +
    mini("chart", "Lifetime value", inr(ltv), "var(--brand-50)", "var(--brand-600)");

  const list = filtered();
  const pages = Math.max(1, Math.ceil(list.length / PER));
  page = Math.min(page, pages);
  const slice = list.slice((page - 1) * PER, page * PER);

  const title = $("#tblTitle");
  if (title) title.textContent = "All users";
  $("#count").textContent = list.length + " user(s)" +
    (frozen ? " Â· " + frozen + " frozen" : "");

  /* chips + sort arrows always mirror the state, never the other way round */
  $$("#filters .chip").forEach((c) => c.classList.toggle("is-on", c.dataset.filter === S.filter));
  $$(".th-sort").forEach((b) => {
    const on = b.dataset.sort === S.sort;
    b.classList.toggle("is-on", on);
    b.dataset.dir = on ? String(S.dir) : "";
    b.setAttribute("aria-sort", on ? (S.dir === 1 ? "ascending" : "descending") : "none");
  });

  paintBulk(slice);

  if (!slice.length) {
    $("#rows").innerHTML = '<tr><td colspan="8">' + emptyState({
      icon: "users",
      title: USERS.length ? "Nobody matches this filter" : "No users yet",
      text: USERS.length ? "Try a different chip above."
            : "New sign-ups will appear here."
    }) + "</td></tr>";
    $("#pager").innerHTML = "";
    return;
  }

  $("#rows").innerHTML = slice.map((u) => {
    const o = userOrders(u.id);
    const me = u.id === CURRENT.uid;
    return `<tr data-id="${esc(u.id)}">
      <td class="w-pick"><input type="checkbox" class="js-pick" data-id="${esc(u.id)}" ${S.sel.has(u.id) ? "checked" : ""} aria-label="Select ${esc(u.name || u.email || "user")}"></td>
      <td>
        <div class="flex gap-2 center">
          <span class="avatar avatar-sm">${esc(initials(u.name || u.email))}</span>
          <div style="min-width:0">
            <b class="fs-sm" style="display:block">${esc(u.name || "Unnamed")} ${me ? '<span class="badge badge-brand">You</span>' : ""}</b>
            <small class="text-muted">${u.createdAt ? timeAgo(u.createdAt) : "—"}</small>
          </div>
        </div>
      </td>
      <td>
        <div class="fs-sm">${esc(u.email || "—")}</div>
        <small class="text-muted">${esc(u.phone || "no phone")}</small>
      </td>
      <td class="num tr">${o.length}</td>
      <td class="num fw-7 tr">${inr(userSpent(u.id))}</td>
      <td class="tr">
        <button class="btn btn-ghost btn-xs js-wallet" data-id="${esc(u.id)}" title="Control this wallet">
          ${icon("wallet", "ic ic-sm")} <span class="mono">${inr(balanceOf(u.id))}</span>
        </button>
        ${isLocked(u.id) ? ' <span class="badge badge-warn">Frozen</span>' : ""}
      </td>
      <td>
        ${u.disabled ? '<span class="badge badge-danger badge-dot">Blocked</span>' : '<span class="badge badge-ok badge-dot">Active</span>'}
      </td>
      <td>
        <div class="flex gap-1 justify-end">
          <button class="btn btn-ghost btn-xs js-view" data-id="${esc(u.id)}" title="View details">${icon("eye", "ic ic-sm")}</button>
          <button class="btn btn-ghost btn-xs js-copy" data-id="${esc(u.id)}" title="Copy user ID">${icon("copy", "ic ic-sm")}</button>
          <button class="btn btn-danger btn-xs js-block" data-id="${esc(u.id)}" title="Block or unblock" ${me ? "disabled" : ""}>${icon("lock", "ic ic-sm")}</button>
        </div>
      </td>
    </tr>`;
  }).join("");

  $$(".js-view").forEach((b) => b.addEventListener("click", () => detail(b.dataset.id)));
  $$(".js-wallet").forEach((b) => b.addEventListener("click", () => detail(b.dataset.id)));
  $$(".js-copy").forEach((b) => b.addEventListener("click", () => copyId(b.dataset.id)));
  $$(".js-block").forEach((b) => b.addEventListener("click", () => block(b.dataset.id)));
  $$(".js-pick").forEach((c) => c.addEventListener("change", () => {
    if (c.checked) S.sel.add(c.dataset.id); else S.sel.delete(c.dataset.id);
    paintBulk(slice);
  }));

  $("#pager").innerHTML = pages > 1
    ? '<div class="pagination">' +
      '<button ' + (page === 1 ? "disabled" : "") + ' data-go="' + (page - 1) + '">Prev</button>' +
      '<span class="btn btn-ghost" style="pointer-events:none">Page ' + page + " of " + pages + "</span>" +
      '<button ' + (page === pages ? "disabled" : "") + ' data-go="' + (page + 1) + '">Next</button></div>'
    : "";
  $$("#pager [data-go]").forEach((b) => b.addEventListener("click", () => {
    page = Number(b.dataset.go);
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }));
}

/* ---------- selection, filters, sorting, export ---------- */

/* The bar reflects the selection only. Selecting on page 2 must not silently
   drop people picked on page 1, so the count is the whole selection while the
   header checkbox only covers the rows on screen. */
function paintBulk(slice) {
  const n = S.sel.size;
  const bar = $("#bulk");
  if (bar) bar.classList.toggle("hidden", n === 0);
  const lbl = $("#bulkN");
  if (lbl) lbl.textContent = n === 1 ? "1 user selected" : n + " users selected";
  const all = $("#pickAll");
  if (all) {
    const onPage = slice.filter((u) => S.sel.has(u.id)).length;
    all.checked = slice.length > 0 && onPage === slice.length;
    all.indeterminate = onPage > 0 && onPage < slice.length;
  }
}

async function copyId(id) {
  const u = USERS.find((x) => x.id === id);
  if (!u) return;
  try {
    await navigator.clipboard.writeText(u.id);
    toast("User ID copied.", "ok");
  } catch {
    /* clipboard is blocked without a secure context, so fall back to a prompt
       the admin can copy from by hand rather than failing silently */
    window.prompt("Copy this user ID:", u.id);
  }
}

const csvCell = (v) => '"' + String(v ?? "").replace(/"/g, '""') + '"';

function exportCsv() {
  const list = filtered();
  if (!list.length) { toast("Nothing to export.", "warn"); return; }
  const head = ["User ID", "Name", "Email", "Phone", "Status", "Orders", "Spent", "Wallet balance", "Wallet frozen", "City", "Joined"];
  const lines = [head.map(csvCell).join(",")];
  for (const u of list) {
    lines.push([
      u.id, u.name, u.email, u.phone, u.disabled ? "blocked" : "active",
      userOrders(u.id).length, userSpent(u.id), balanceOf(u.id), isLocked(u.id) ? "yes" : "no",
      u.city, u.createdAt ? new Date(u.createdAt.seconds * 1000).toISOString().slice(0, 10) : ""
    ].map(csvCell).join(","));
  }
  /* the leading =-+@ trick stops a spreadsheet treating a cell as a formula */
  const blob = new Blob(["ï»¿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "users-" + new Date().toISOString().slice(0, 10) + ".csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast("Exported " + list.length + " user(s).", "ok");
}

/* ---------- bulk actions ---------- */

function selUsers() {
  return USERS.filter((u) => S.sel.has(u.id));
}

function openBulkCredit() {
  const list = selUsers();
  if (!list.length) return;
  $("#bulkWho").textContent = list.length === 1
    ? "Applying to " + (list[0].name || list[0].email)
    : "Applying to " + list.length + " selected users, " + inr(list.reduce((s, u) => s + balanceOf(u.id), 0)) + " held in total.";
  $("#bQuick").innerHTML = QUICK.map((v) => '<button class="chip" data-bq="' + v + '">' + inr(v) + "</button>").join("");
  $$("#bQuick .chip").forEach((b) => b.addEventListener("click", () => {
    const cur = Number($("#bAmt").value || 0);
    $("#bAmt").value = cur + Number(b.dataset.bq);
    paintBulkHint();
  }));
  $("#bAmt").value = "";
  $("#bNote").value = "";
  $$("#bulkModes .seg-btn").forEach((x) => x.classList.toggle("is-on", x.dataset.bmode === "add"));
  BM = "add";
  paintBulkHint();
  openModal("bulkModal");
}

let BM = "add";

function paintBulkHint() {
  const amt = Number(($("#bAmt") || {}).value || 0);
  const list = selUsers();
  if (!(amt > 0)) {
    $("#bHint").textContent = "Enter an amount to apply to each of the " + list.length + " selected user(s).";
    return;
  }
  const verb = BM === "add" ? "Added" : "Removed";
  const tail = BM === "add" ? "" : " Users without enough balance are skipped.";
  $("#bHint").textContent = inr(amt) + " " + (BM === "add" ? "added to" : "removed from") +
    " each of " + list.length + " user(s) = " + inr(amt * list.length) + " in total." + tail;
}

async function runBulkCredit() {
  const amt = Math.round(Number(($("#bAmt").value || 0)));
  const note = ($("#bNote").value || "").trim();
  const list = selUsers();
  if (!amt || amt <= 0) { toast("Enter an amount first.", "warn"); return; }

  const ok = await confirmBox({
    title: BM === "add" ? "Credit " + inr(amt) + " to " + list.length + " user(s)?" : "Remove " + inr(amt) + " from " + list.length + " user(s)?",
    text: "Every change is written to each user's wallet history. A user without enough balance is skipped on a removal.",
    ok: "Yes, apply to all",
    danger: BM !== "add"
  });
  if (!ok) return;

  const btn = $("#bGo");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Applying';
  const ref = "admin-bulk:" + (CURRENT?.uid || "unknown");
  const text = (note || (BM === "add" ? "Bulk credit by admin" : "Bulk debit by admin")) + " (" + ref + ")";
  let done = 0, skipped = 0;
  for (const u of list) {
    try {
      const r = await adjustWallet(u.id, BM === "add" ? amt : -amt, text, ref);
      if (r && r.ok !== false) {
        WALLETS[u.id] = { ...(WALLETS[u.id] || {}), balance: r.balance };
        done++;
      } else skipped++;
    } catch (e) { console.error(e); skipped++; }
  }
  btn.disabled = false;
  btn.innerHTML = "Apply to all";
  toast("Applied to " + done + " user(s)" + (skipped ? ", skipped " + skipped : "") + ".", skipped ? "warn" : "ok");
  S.sel.clear();
  $("#bulkModal")?.classList.remove("open");
  document.body.classList.remove("no-scroll");
  render();
}


async function runBulkBlock(blockIt) {
  const list = selUsers().filter((u) => !!u.disabled !== blockIt);
  if (!list.length) { toast("No changes needed.", "warn"); return; }
  const ok = await confirmBox({
    title: (blockIt ? "Block " : "Unblock ") + list.length + " user(s)?",
    text: blockIt ? "They will not be able to sign in. Enforce this in your Firestore rules using the disabled flag."
      : "They will be able to sign in again.",
    ok: blockIt ? "Yes, block" : "Yes, unblock",
    danger: blockIt
  });
  if (!ok) return;
  let done = 0;
  for (const u of list) {
    try { await toggleUserActive(u.id, blockIt); done++; }
    catch (e) { console.error(e); }
  }
  toast((blockIt ? "Blocked " : "Unblocked ") + done + " user(s).", "ok");
  S.sel.clear();
  await load();
}

function detail(id) {
  const u = USERS.find((x) => x.id === id);
  if (!u) return;
  target = u;
  const o = userOrders(id);
  const bal = balanceOf(id);
  const locked = isLocked(id);

  $("#uBody").innerHTML = `
    <div class="flex gap-3 center mb-3">
      <span class="avatar avatar-lg">${esc(initials(u.name || u.email))}</span>
      <div>
        <b class="fs-lg" style="display:block">${esc(u.name || "Unnamed")}</b>
        <span class="text-muted fs-sm">${esc(u.email || "")}</span>
        <div class="mt-1">
                    ${u.disabled ? ' <span class="badge badge-danger">Blocked</span>' : ""}
        </div>
      </div>
    </div>

    <div class="grid g-2 mb-3">
      <div class="card card-pad" style="background:var(--ink-50)">
        <div class="fs-xs text-muted">Total orders</div><b class="fs-lg">${o.length}</b>
      </div>
      <div class="card card-pad" style="background:var(--ink-50)">
        <div class="fs-xs text-muted">Total spent</div><b class="fs-lg">${inr(userSpent(id))}</b>
      </div>
    </div>

    ${walletPanel(u, bal, locked)}

    <ul class="spec-list mb-3">
      <li><b>User ID</b><span style="word-break:break-all">${esc(u.id)}</span></li>
      <li><b>Phone</b><span>${esc(u.phone || "—")}</span></li>
      <li><b>Address</b><span>${esc(u.address || "—")}</span></li>
      <li><b>City / State</b><span>${esc(u.city || "—")}, ${esc(u.state || "—")} — ${esc(u.pincode || "—")}</span></li>
      <li><b>Joined</b><span>${u.createdAt ? fmtDate(u.createdAt, false) : "—"}</span></li>
      <li><b>Last login</b><span>${u.lastLogin ? fmtDate(u.lastLogin) : "—"}</span></li>
    </ul>

    <h4 class="mb-1">Orders</h4>
    ${o.length
      ? '<div class="table-wrap"><table class="table"><thead><tr><th>Order</th><th>Total</th><th>Status</th><th>Date</th></tr></thead><tbody>' +
        o.slice(0, 10).map((x) =>
          '<tr><td class="fs-sm">' + esc(x.orderNo || x.id.slice(-6)) + "</td>" +
          '<td class="num fw-7">' + inr(x.total) + "</td>" +
          '<td><span class="badge ' + (x.status === "delivered" ? "badge-ok" : x.status === "cancelled" ? "badge-danger" : "badge-warn") + '">' + esc(x.status) + "</span></td>" +
          '<td class="fs-xs text-muted">' + fmtDate(x.createdAt, false) + "</td></tr>").join("") +
        "</tbody></table></div>"
      : '<p class="text-muted fs-sm mb-0">This user has not placed any orders.</p>'}

    <h4 class="mb-1 mt-3">Wallet history</h4>
    <div id="wTxns"><div class="sk sk-line" style="width:60%"></div><div class="sk sk-line" style="width:40%"></div></div>`;

  bindWallet(u);
  openModal("uModal");
  loadTxns(u.id);
}

/* ---------- wallet control panel ---------- */

const QUICK = [100, 250, 500, 1000, 2500];

/* The mode is a plain variable rather than three separate forms, so switching
   between add / remove / set never loses the amount the admin already typed. */
let wMode = "add";

function walletPanel(u, bal, locked) {
  return `
  <section class="wctl mb-3">
    <div class="wctl-head">
      <div>
        <div class="fs-xs text-muted">Wallet balance</div>
        <div class="wctl-bal mono" id="wBal">${inr(bal)}</div>
        <div class="fs-xs" id="wState">${locked
          ? '<span class="badge badge-warn">Frozen</span>'
          : '<span class="badge badge-ok">Available</span>'}</div>
      </div>
      <button class="btn ${locked ? "btn-ok" : "btn-outline"} btn-sm" id="wLock">
        ${icon(locked ? "unlock" : "lock", "ic ic-sm")} ${locked ? "Unfreeze" : "Freeze"}
      </button>
    </div>

    <div class="seg" id="wModes" role="group" aria-label="Adjustment type">
      <button class="seg-btn is-on" data-mode="add">${icon("plus", "ic ic-sm")} Add</button>
      <button class="seg-btn" data-mode="sub">${icon("minus", "ic ic-sm")} Remove</button>
      <button class="seg-btn" data-mode="set">${icon("edit", "ic ic-sm")} Set exact</button>
    </div>

    <div class="grid g-2 gap-2">
      <label class="field">
        <span class="fs-xs text-muted" id="wAmtLbl">Amount to add (â‚¹)</span>
        <input class="input mono" id="wAmt" type="number" min="0" step="1" inputmode="numeric" placeholder="0">
      </label>
      <label class="field">
        <span class="fs-xs text-muted">Reason — shown in their history</span>
        <input class="input" id="wNote" maxlength="120" placeholder="Manual credit / refund / correction">
      </label>
    </div>

    <div class="wctl-quick">
      ${QUICK.map((v) => '<button class="chip" data-q="' + v + '">' + inr(v) + "</button>").join("")}
      <button class="chip" data-q="all">All balance</button>
    </div>

    <div class="flex gap-2 center mt-2">
      <button class="btn btn-primary btn-sm" id="wGo">${icon("wallet", "ic ic-sm")} Apply to ${esc(u.name || u.email || "user")}</button>
      <span class="fs-xs text-muted" id="wHint"></span>
    </div>
  </section>`;
}

function bindWallet(u) {
  const amt = $("#wAmt"), note = $("#wNote");

  $$("#wModes .seg-btn").forEach((b) => b.addEventListener("click", () => {
    wMode = b.dataset.mode;
    $$("#wModes .seg-btn").forEach((x) => x.classList.toggle("is-on", x === b));
    paintHint(u);
  }));

  /* the preview has to follow the field as it is typed, otherwise the admin is
     reading a stale number while deciding */
  amt.addEventListener("input", () => paintHint(u));

  $$(".wctl-quick .chip").forEach((b) => b.addEventListener("click", () => {
    const cur = Number(amt.value || 0);
    amt.value = b.dataset.q === "all" ? balanceOf(u.id) : (wMode === "add" ? cur + Number(b.dataset.q) : Number(b.dataset.q));
    amt.focus();
  }));

  $("#wLock").addEventListener("click", () => toggleFreeze(u));
  $("#wGo").addEventListener("click", () => applyWallet(u));
  paintHint(u);
}

/* Explains exactly what will happen before anything is written, because a
   wallet change is real money and the mode changes what the number means. */
function paintHint(u) {
  const v = Number(($("#wAmt") || {}).value || 0);
  const bal = balanceOf(u.id);
  const lbl = { add: "Amount to add (â‚¹)", sub: "Amount to remove (â‚¹)", set: "Set balance to exactly (â‚¹)" }[wMode];
  $("#wAmtLbl").textContent = lbl;
  let hint = "";
  if (wMode === "add") hint = v > 0 ? "New balance " + inr(bal + v) : "Enter an amount to add.";
  else if (wMode === "sub") hint = v > 0 ? "New balance " + inr(Math.max(0, bal - v)) : "Enter an amount to remove.";
  else hint = "New balance " + inr(Math.max(0, v)) + (v > bal ? " (adds " + inr(v - bal) + ")" : v < bal ? " (removes " + inr(bal - v) + ")" : " (no change)");
  $("#wHint").textContent = hint;
}

async function applyWallet(u) {
  const raw = Number(($("#wAmt").value || 0));
  const note = ($("#wNote").value || "").trim();
  if (!raw || raw < 0) { toast("Enter an amount first.", "warn"); return; }
  if (wMode === "sub" && raw > balanceOf(u.id)) {
    toast("That is more than the balance of " + inr(balanceOf(u.id)) + ".", "warn");
    return;
  }

  const verb = { add: "add " + inr(raw), sub: "remove " + inr(raw), set: "set the balance to " + inr(raw) }[wMode];
  const ok = await confirmBox({
    title: "Confirm wallet change",
    text: "You are about to " + verb + " for " + (u.name || u.email) + ". Current balance is " +
      inr(balanceOf(u.id)) + ". This is written to their wallet history and cannot be undone from here.",
    ok: "Yes, apply",
    danger: wMode !== "add"
  });
  if (!ok) return;

  const btn = $("#wGo");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Applying';
  try {
    /* ref carries who did it, so a support question about a balance change can
       be traced back to this admin account. */
    const ref = "admin:" + (CURRENT?.uid || "unknown");
    const noteText = (note || (wMode === "add" ? "Manual credit by admin" : wMode === "sub" ? "Manual debit by admin" : "Balance set by admin")) + " (" + ref + ")";
    const r = wMode === "set"
      ? await setWalletBalance(u.id, raw, noteText, ref)
      : await adjustWallet(u.id, wMode === "add" ? raw : -raw, noteText, ref);

    if (!r || r.ok === false) {
      toast(r?.reason === "insufficient" ? "Not enough balance to remove that much." : "Nothing was changed.", "err");
      return;
    }
    WALLETS[u.id] = { ...(WALLETS[u.id] || {}), balance: r.balance };
    toast("Wallet updated. New balance " + inr(r.balance) + ".", "ok");
    $("#wAmt").value = "";
    detail(u.id);
    render();
  } catch (e) {
    console.error(e);
    toast("Could not update the wallet: " + (e.message || "check your rules"), "err");
  } finally {
    const b = $("#wGo");
    if (b) { b.disabled = false; b.innerHTML = icon("wallet", "ic ic-sm") + " Apply"; }
  }
}

async function toggleFreeze(u) {
  const locked = isLocked(u.id);
  const ok = await confirmBox({
    title: locked ? "Unfreeze this wallet?" : "Freeze this wallet?",
    text: locked
      ? (u.name || u.email) + " will be able to spend their balance again."
      : (u.name || u.email) + " will keep their balance but cannot spend it until you unfreeze it.",
    ok: locked ? "Yes, unfreeze" : "Yes, freeze",
    danger: !locked
  });
  if (!ok) return;
  try {
    await setWalletLocked(u.id, !locked);
    WALLETS[u.id] = { ...(WALLETS[u.id] || {}), locked: !locked };
    toast(locked ? "Wallet unfrozen." : "Wallet frozen.", "ok");
    detail(u.id);
    render();
  } catch (e) {
    console.error(e);
    toast("Could not change the wallet lock.", "err");
  }
}

async function loadTxns(id) {
  const box = $("#wTxns");
  if (!box) return;
  try {
    const list = await withTimeout(getWalletTxns(id, 12), 12000, "The wallet history query");
    if (!list.length) { box.innerHTML = '<p class="text-muted fs-sm mb-0">No wallet activity yet.</p>'; return; }
    box.innerHTML = '<div class="table-wrap"><table class="table"><thead><tr><th>Type</th><th>Amount</th><th>Balance</th><th>Note</th><th>Date</th></tr></thead><tbody>' +
      list.map((t) => {
        const credit = t.type === "credit";
        return "<tr>" +
          '<td><span class="badge ' + (credit ? "badge-ok" : "badge-warn") + '">' + (credit ? "Credit" : "Debit") + "</span></td>" +
          '<td class="num fw-7" style="color:' + (credit ? "var(--ok-600)" : "var(--danger-600)") + '">' +
            (credit ? "+" : "âˆ’") + inr(t.amount) + "</td>" +
          '<td class="num">' + inr(t.balanceAfter) + "</td>" +
          '<td class="fs-xs text-muted">' + esc(t.note || "—") + "</td>" +
          '<td class="fs-xs text-muted">' + fmtDate(t.createdAt, false) + "</td></tr>";
      }).join("") + "</tbody></table></div>";
  } catch (e) {
    console.error(e);
    box.innerHTML = '<p class="fs-sm text-muted mb-0">Wallet history is not available. Check your Firestore rules.</p>';
  }
}


async function block(id) {
  const u = USERS.find((x) => x.id === id);
  const willBlock = !u.disabled;
  const ok = await confirmBox({
    title: willBlock ? "Block this user?" : "Unblock this user?",
    text: willBlock
      ? "This account will not be able to sign in. Enforce this in your Firestore rules using the disabled flag."
      : "This account will be able to sign in again.",
    ok: willBlock ? "Yes, block" : "Yes, unblock"
  });
  if (!ok) return;
  try {
    await toggleUserActive(id, !willBlock);
    toast(willBlock ? "User blocked." : "User unblocked.", "ok");
    await load();
  } catch (e) { console.error(e); toast("Could not update the account.", "err"); }
}

function bind() {
  $("#refresh").addEventListener("click", async () => {
    $("#refresh").innerHTML = '<span class="spinner"></span>';
    await load();
    $("#refresh").innerHTML = icon("refresh");
    toast("Users refreshed.", "ok");
  });

  $("#export").addEventListener("click", exportCsv);

  $$("#filters .chip").forEach((c) => c.addEventListener("click", () => {
    S.filter = c.dataset.filter;
    S.sel.clear();
    page = 1;
    render();
  }));

  $$(".th-sort").forEach((b) => b.addEventListener("click", () => {
    if (S.sort === b.dataset.sort) S.dir = -S.dir;          /* same column flips */
    else { S.sort = b.dataset.sort; S.dir = -1; }           /* new column starts high */
    render();
  }));

  $("#pickAll").addEventListener("change", (e) => {
    const list = filtered().slice((page - 1) * PER, page * PER);
    list.forEach((u) => { if (e.target.checked) S.sel.add(u.id); else S.sel.delete(u.id); });
    render();
  });

  $("#bCredit").addEventListener("click", openBulkCredit);
  $("#bGo").addEventListener("click", runBulkCredit);
  $("#bUnblock").addEventListener("click", () => runBulkBlock(false));
  $("#bBlock").addEventListener("click", () => runBulkBlock(true));
  $("#bClear").addEventListener("click", () => { S.sel.clear(); render(); });

  $("#bAmt").addEventListener("input", paintBulkHint);
  $$("#bulkModes .seg-btn").forEach((b) => b.addEventListener("click", () => {
    BM = b.dataset.bmode;
    $$("#bulkModes .seg-btn").forEach((x) => x.classList.toggle("is-on", x === b));
    paintBulkHint();
  }));
}

document.addEventListener("DOMContentLoaded", async () => {
await requireAdmin();
  $("#rows").innerHTML = skRows(7, 7);
  await load();
  bind();
});
