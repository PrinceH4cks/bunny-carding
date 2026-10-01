import { brandName } from "../core/brand.js";
import { field } from "../core/app.js";
import { createOrder } from "../services/order-service.js";
import { watchAuth } from "../core/auth.js";
import { app, auth } from "../core/firebase-config.js";
import { db } from "../core/db.js";

/* /wallet-page.js */
import { $, $$, inr, compactInr, esc, fmtDate, pageUrl, isEmail, setError } from "../core/app.js";
import { toast } from "../components/toast.js";
import { emptyState } from "../components/ui.js";
import { openModal, closeModal } from "../components/modal.js";
import { icon } from "../components/icons.js";
import { getWallet, getWalletTxns } from "../services/wallet-service.js";
import { getPaymentSettings, enabledMethods } from "../services/payment-service.js";
import { createDeposit, submitDepositUTR, getUserDeposits, markDepositPaid, attachGatewayOrder } from "../services/user-service.js";
import { CURRENT, PROFILE, whenReady, login, errText } from "../core/auth.js";
import { paymentSheet } from "../services/payment-service.js";
import { METHODS, methodByKey, isUsable } from "../services/payment-service.js";
import { loadZapSdk, zapStatus, rememberGatewayOrder, forgetGatewayOrder, readGatewayOrder } from "../services/zap-service.js";

let TXNS = [];
let DEPS = [];
let stopTimer = null;
let activeDep = null;
/* the ZapUPI order id we minted for the deposit on screen, so the overlay
   callbacks and the poll loop both ask about the same order */
let zapOrderId = null;
let pollTimer = null;

const TYPE = {
  credit: { cls: "in",  ic: "arrow-down", sign: "+" },
  debit:  { cls: "out", ic: "arrow-up",   sign: "-" },
  hold:   { cls: "hold", ic: "clock",    sign: "" }
};

/* ---------- render ---------- */

/* motion.js counts .wallet-balance up from zero and re-reads dataset.raw on the
   last frame, so a plain textContent write gets clobbered when the animation is
   still running. Writing both keeps the animation and the real value in step.

   Past a crore the figure is shortened to "₹12 Cr" and the full amount goes into
   the title, where a hover or a long press will find it. The node is also marked
   so the count-up leaves it alone: it would otherwise read the twelve as the
   balance and count up to it, passing through amounts that are not real. */
function setNum(node, text, full) {
  if (!node) return;
  node.textContent = text;
  node.dataset.raw = text;
  if (full && full !== text) {
    node.title = full;
    node.dataset.noCount = "";
  } else {
    node.removeAttribute("title");
    node.removeAttribute("data-no-count");
  }
}

/* What the customer is shown of a ledger entry, as opposed to what the shop
   keeps.

   A reference is worth printing when it means something to the person reading it
   — a deposit reference they can quote to support. An adjustment made by staff
   carries an internal marker instead, "admin:" followed by the account that made
   it, and that is the shop's own business rather than theirs. It stays in the
   ledger where support can reach it; it is not printed here.

   The same applies to the note, and for the note it also covers the entries
   written before this was noticed: those have the marker welded onto the end of
   the text, so a trailing one is trimmed for display rather than left sitting
   under a date in a list the customer is reading. Both were showing the account
   id twice on one line, once as the heading and again beside the date. */
const customerNote = (note, type) => {
  const raw = String(note || "").replace(/\s*\(\s*admin:[^)]*\)\s*$/i, "").trim();
  return raw || (type === "credit" ? "Wallet top-up" : "Purchase");
};

const customerRef = (ref) => {
  const s = String(ref || "").trim();
  return /^admin:/i.test(s) ? "" : s;
};

function paint() {
  const w = getWalletCache || { balance: 0 };
  const credit = TXNS.filter((t) => t.type === "credit").reduce((s, t) => s + Number(t.amount || 0), 0);
  const spent = TXNS.filter((t) => t.type === "debit").reduce((s, t) => s + Number(t.amount || 0), 0);

  setNum($("#wBalance"), compactInr(w.balance), inr(w.balance));
  setNum($("#wCredit"), compactInr(credit), inr(credit));
  setNum($("#wSpent"), compactInr(spent), inr(spent));
  setNum($("#wCount"), String(TXNS.length));
  $("#wSince").textContent = w.createdAt ? "since " + fmtDate(w.createdAt, false) : "";

  const nav = $("#navWallet"), navAmt = $("#navWalletAmt");
  if (nav) {
    nav.hidden = false;
    navAmt.textContent = inr(w.balance);
    const pend = DEPS.filter((d) => d.status !== "approved" && d.status !== "rejected").length;
    nav.classList.toggle("pending", pend > 0);
    nav.title = pend > 0 ? pend + " deposit(s) awaiting verification" : "Wallet balance";
  }
  /* keep the phone app bar in step with the figure shown here. A custom event
     is used rather than importing header.js, because header.js already imports
     this file and a static import back would be a cycle. */
  document.dispatchEvent(new CustomEvent("wallet:change", { detail: { balance: w.balance } }));

  const box = $("#txnList");
  $("#txnCount").textContent = TXNS.length + " movement(s)";

  if (!TXNS.length) {
    box.innerHTML = emptyState({
      icon: "history", title: "No wallet activity yet",
      text: "Add money to your wallet to start buying cards with it.",
      action: '<button class="btn btn-primary" id="addFirst">Add money</button>'
    });
    $("#addFirst")?.addEventListener("click", openDeposit);
    return;
  }

  box.innerHTML = TXNS.map((t) => {
    const m = TYPE[t.type] || TYPE.debit;
    const ref = customerRef(t.ref);
    const shown = compactInr(t.amount);
    const full = inr(t.amount);
    return '<div class="txn-row">' +
      '<span class="txn-ic ' + m.cls + '">' + icon(m.ic) + "</span>" +
      "<div style=\"min-width:0\">" +
        '<b class="fs-sm" style="display:block">' + esc(customerNote(t.note, t.type)) + "</b>" +
        '<small class="text-muted">' + fmtDate(t.createdAt) + (ref ? " &middot; " + esc(ref) : "") + "</small>" +
      "</div>" +
      '<div class="txn-amt ' + m.cls + '"' + (shown === full ? "" : ' title="' + esc(full) + '"') + ">" +
        m.sign + shown + "</div>" +
      "</div>";
  }).join("");
}

let getWalletCache = null;

let CFG = null;

/* ---------- deposit flow ----------
   One card with a tab per method the admin has both switched on and finished
   setting up, so a customer is never offered a half-configured option. */

/* Each method's minimum deposit belongs to the method, not to whatever the
   admin happened to save. ZapUPI takes ₹1, crypto has its own floor, and only
   manual UPI is ₹100. Reading it from the registry means an admin who filled in
   nothing extra still gets the right limit instead of a flat ₹100. */
function methodMin(m) {
  const base = methodByKey(m.key);
  const v = Number(base && base.min != null ? base.min : m.min);
  return Number.isFinite(v) && v >= 0 ? v : 1;
}

/* What each method actually is, in facts rather than adjectives: whether the
   credit lands on its own, whether a person has to approve it, and where the
   money goes. A customer choosing between three options is really asking
   "how long, and who signs off", so those are the two things shown. */
const METHOD_INFO = {
  zap:    { speed: "Instant", detail: "Opens your UPI app and credits automatically.", manual: false },
  upi:    { speed: "Manual approval", detail: "You pay, then enter the reference number.", manual: true },
  crypto: { speed: "Manual approval", detail: "You send, then paste the transaction hash.", manual: true }
};

const QUICK = [299, 499, 999, 1999, 4999, 9999];

function balanceNow() {
  return Number((getWalletCache && getWalletCache.balance) || 0);
}

function amountField(min) {
  return QUICK.filter((a) => a >= min).map((a) =>
      '<button class="chip" type="button" data-amt="' + a + '">' + inr(a) + "</button>").join("") +
    '<div class="field-error"></div>';
}

function methodForm(key, m) {
  const min = methodMin(m);
  const amtLabel = key === "crypto" ? "Amount (" + esc(m.currency || "") + ")" : "Amount";

  /* This step is only for choosing an amount and a way to pay. Where to send the
     money belongs to the next screen: the code to scan, the address to copy and
     the reference to paste only mean something once the amount is on them, and a
     UPI id printed here with no amount beside it is a QR nobody can use. It used
     to be shown on both steps, which meant the customer saw the address twice
     and had a hash box to fill in before they had sent anything. */
  return '<div class="dep2-form">' +
    '<div class="field"><label for="depAmt">' + amtLabel + "</label>" +
      '<div class="dep2-amount"><span>&#8377;</span>' +
      /* data-big opts this one out of the 16px floor that keeps iOS from
         zooming the page on focus — see the note beside that rule */
      '<input id="depAmt" data-big type="number" inputmode="decimal" min="' + min +
      '" placeholder="0" step="1" autocomplete="off"></div>' +
      '<div class="dep2-quick">' + amountField(min) + "</div>" +
      '<div class="dep2-limits"><span>Minimum ' + inr(min) + "</span>" +
      '<span data-dep-count>No fee is added</span></div></div>' +
    /* the summary comes before the button, because the number the customer
       confirms should be one they have already read */
    '<dl class="dep2-rows" id="depSummary"></dl>' +
    HISTORY +
    '<div class="dep2-actions"></div>' +
  "</div>";
}

/* the running summary, kept true to what has been typed rather than to a
   default, so the number the customer confirms is the number they entered */
function paintSummary() {
  const box = $("#depSummary");
  if (!box) return;
  const raw = Number($("#depAmt")?.value || 0);
  const amt = Number.isFinite(raw) && raw > 0 ? raw : 0;
  const min = methodMin(currentMethod || { key: "zap", min: 1 });
  const method = currentMethod;
  const info = METHOD_INFO[method.key] || {};
  const after = balanceNow() + (method.key === "crypto" ? 0 : amt);

  box.innerHTML =
    '<div class="dep2-row"><dt>Amount</dt><dd>' + (amt ? inr(amt) : "—") + "</dd></div>" +
    '<div class="dep2-row"><dt>Method</dt><dd>' + esc(method.title || methodByKey(method.key).title) + "</dd></div>" +
    (method.key === "crypto"
      ? '<div class="dep2-row"><dt>Wallet credit</dt><dd>' + (amt ? inr(amt) + " (converted)" : "—") + "</dd></div>"
      : '<div class="dep2-row"><dt>Fee</dt><dd>None</dd></div>') +
    '<div class="dep2-row total"><dt>Balance after</dt><dd>' + inr(after) + "</dd></div>" +
    '<div class="dep2-row"><dt>Crediting</dt><dd>' + esc(info.speed || "") + "</dd></div>";
}

/* the last few requests, so a customer who has one pending can see it here
   instead of only on the page behind the dialog. It is held here and folded into
   the form, so it sits above the action rather than below it. */
let HISTORY = "";

function historyBlock() {
  const recent = DEPS.slice(0, 3);
  if (!recent.length) return "";
  const label = { approved: "Credited", rejected: "Rejected", pending: "Awaiting review" };
  return '<div class="dep2-hist"><h5>Recent requests</h5>' +
    '<div class="dep2-hist-list">' + recent.map((d) =>
    '<div class="dep2-hist-row">' +
      '<span class="pill">' + esc(label[d.status] || d.status || "Pending") + "</span>" +
      '<span>' + esc(d.methodLabel || (methodByKey(d.method) || {}).title || d.method || "") + "</span>" +
      '<span class="dep2-hist-when">' + esc(fmtDate(d.createdAt, false)) + "</span>" +
      '<span class="dep2-hist-amt">' + inr(d.amount) + "</span>" +
    "</div>").join("") + "</div></div>";
}

let currentMethod = null;

/* ------------------------------------------------------------------
   THE DIALOG OPENS ON THE CLICK

   It used to fetch the payment settings first and open afterwards, so the
   button did nothing you could see for as long as the network took — on a
   phone that is a long second or two, and it reads as a dead button rather
   than as a slow one. Now the dialog opens on the click and fills itself in
   front of the visitor.

   A visitor who is not signed in gets a sign-in form inside the same dialog.
   They used to be sent away to a separate sign-in page, which meant the button
   they came to press was never on the screen in the first place: the wallet
   page bounced them before it had drawn. Signing in here keeps them in the
   wallet they were already looking at, and the amount they chose is still
   there afterwards.
   ------------------------------------------------------------------ */
function openDeposit() {
  /* the dialog is shared by the picker and the payment sheet, so each entry
     point sets the width it needs rather than whichever opened last leaving it */
  $("#depModal").classList.remove("dep-modal--sheet");
  openModal("depModal");
  if (!CURRENT) { signInStep(); return; }
  paintDeposit();
}

/* the sign-in form, inside the deposit dialog */
function signInStep(message) {
  const body = $("#depBody");
  body.classList.remove("dep2-host");
  body.innerHTML =
    '<div class="dep-signin">' +
      '<p class="dep-signin-lead">' + esc(message || "Sign in to add money to your wallet.") + "</p>" +
      '<div id="depSigninAlert"></div>' +
      '<form id="depSignin" novalidate>' +
        '<div class="field">' +
          '<label for="depEmail">Email</label>' +
          '<input id="depEmail" class="input" name="email" type="email" autocomplete="email" ' +
            'inputmode="email" autocapitalize="none" spellcheck="false" placeholder="you@example.com">' +
          '<div class="field-error"></div>' +
        "</div>" +
        '<div class="field">' +
          '<label for="depPassword">Password</label>' +
          '<input id="depPassword" class="input" name="password" type="password" ' +
            'autocomplete="current-password" placeholder="Your password">' +
          '<div class="field-error"></div>' +
        "</div>" +
        '<button class="btn btn-primary btn-lg btn-block" type="submit" id="depSigninBtn">' +
          '<span class="btn-txt">' + icon("unlock") + " Sign in</span>" +
        "</button>" +
      "</form>" +
      '<a class="dep-signin-alt fs-sm" href="' + pageUrl("pages/forgot-password.html") + '">Forgot your password?</a>' +
      '<p class="dep-signin-alt fs-sm mb-0">No account? ' +
        '<a href="' + pageUrl("pages/register.html") + '">Create one free</a></p>' +
    "</div>";

  const form = $("#depSignin");
  const btn = $("#depSigninBtn");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#depEmail").value.trim();
    const pw = $("#depPassword").value;
    let ok = true;
    if (!isEmail(email)) { setError($("#depEmail"), "Please enter a valid email address."); ok = false; }
    else setError($("#depEmail"));
    if (!pw) { setError($("#depPassword"), "Please enter your password."); ok = false; }
    else setError($("#depPassword"));
    if (!ok) return;

    btn.disabled = true;
    btn.querySelector(".btn-txt").innerHTML = '<span class="spinner"></span> Signing in&hellip;';
    try {
      await login({ email, password: pw });
      /* no page reload: the wallet is read again and the dialog carries on into
         the part the visitor actually came for */
      await load();
      paintDeposit();
    } catch (err) {
      console.error(err);
      const say = errText(err);
      $("#depSigninAlert").innerHTML = say
        ? '<div class="alert alert-err mb-2"><span>!</span><div>' + esc(say) + "</div></div>"
        : "";
      btn.disabled = false;
      btn.querySelector(".btn-txt").innerHTML = icon("unlock") + " Sign in";
    }
  });

  form.querySelectorAll("input").forEach((i) => i.addEventListener("input", () => setError(i)));
  setTimeout(() => $("#depEmail")?.focus(), 60);
}

/* the part that was the whole of openDeposit: fetch, then draw */
async function paintDeposit() {
  const s = await getPaymentSettings();
  const list = (enabledMethods(s) || []).filter((m) => isUsable(m.key, s.methods));
  CFG = s;

  if (!list.length) {
    $("#depBody").innerHTML =
      '<div class="empty"><div class="empty-ic">' + icon("alert") + "</div>" +
      "<h3>No deposit method is ready</h3>" +
      "<p>Please contact support to add money for now.</p></div>";
    return;
  }

  currentMethod = list[0];
  /* the icon and the title belong to the method itself, so a saved setting
     that is missing one still shows the right mark rather than a blank square */
  for (const m of list) {
    const reg = methodByKey(m.key) || {};
    if (!m.icon) m.icon = reg.icon || "wallet";
    if (!m.title) m.title = reg.title;
    if (m.min == null) m.min = reg.min;
  }
  HISTORY = historyBlock();

  /* the body hands its padding to the two-column layout, so the columns reach
     the edges of the window instead of being pulled there by a negative margin
     that has to be undone again at every width */
  $("#depBody").classList.add("dep2-host");

  /* The method list is a list of choices, so it is marked up as one: a screen
     reader announces how many there are and which is picked, and the arrow keys
     are handled as they are for any radio group. */
  $("#depBody").innerHTML =
    '<div class="dep2">' +
      '<div class="dep2-side">' +
        '<p class="dep2-side-title">Pay with</p>' +
        '<div class="dep-tabs" role="radiogroup" aria-label="Deposit method">' + list.map((m, i) => {
          const info = METHOD_INFO[m.key] || {};
          return '<button class="dep2-method" type="button" role="radio" data-m="' + m.key + '"' +
            ' aria-checked="' + (i === 0 ? "true" : "false") + '">' +
            icon(m.icon, "ic") +
            "<span>" +
              '<span class="dep2-method-top">' +
                "<b>" + esc(m.title) + "</b>" +
                '<span class="dep2-flag' + (info.manual ? "" : " on") + '">' + esc(info.speed || "") + "</span>" +
              "</span>" +
              '<small>' + esc(info.detail || "") + "</small>" +
            "</span>" +
            /* the tick is always in the markup and only shown when chosen, so the
               chosen card is the same shape as the others and does not shift */
            '<span class="dep2-tick" aria-hidden="true">' + icon("check", "ic ic-sm") + "</span>" +
          "</button>";
        }).join("") + "</div>" +
        '<p class="dep2-side-note">Minimum for this method: <b>' +
          inr(methodMin(list[0])) + "</b></p>" +
      "</div>" +
      '<div class="dep2-main">' +
        "<h4>Add money to your wallet</h4>" +
        '<p class="dep2-sub">Choose an amount, then continue to payment.</p>' +
        '<div id="depForm">' + methodForm(list[0].key, list[0]) + "</div>" +
      "</div>" +
    "</div>";

  $(".dep-tabs").addEventListener("click", (e) => {
    const t = e.target.closest("[data-m]");
    if (!t) return;
    const m = list.find((x) => x.key === t.dataset.m);
    if (!m) return;
    currentMethod = m;
    for (const c of $$(".dep-tabs [data-m]")) c.setAttribute("aria-checked", String(c === t));
    const amount = $("#depAmt")?.value;
    $("#depForm").innerHTML = methodForm(m.key, m);
    /* the amount is a decision the customer already made, so switching method
       keeps it rather than quietly throwing it away */
    if (amount) $("#depAmt").value = amount;
    wireMethod(m, s);
    paintSummary();
  });

  /* arrow keys move between the methods, as they do in any radio group */
  $(".dep-tabs").addEventListener("keydown", (e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowRight" && e.key !== "ArrowUp" && e.key !== "ArrowLeft") return;
    const items = $$(".dep-tabs [data-m]");
    const at = items.findIndex((x) => x.getAttribute("aria-checked") === "true");
    if (at < 0) return;
    e.preventDefault();
    const step = (e.key === "ArrowDown" || e.key === "ArrowRight") ? 1 : -1;
    items[(at + step + items.length) % items.length].focus();
    items[(at + step + items.length) % items.length].click();
  });

  wireMethod(list[0], s);
  paintSummary();
  openModal("depModal");
  setTimeout(() => $("#depAmt")?.focus(), 60);
}

/* quick amounts and the copy button. These are delegated from the form rather
   than bound to each one, because the form's contents are replaced every time
   the method changes and a listener bound to a single button would only ever
   have reached the first of them. */
function wireForm() {
  const form = $("#depForm");
  if (!form || form.dataset.wired) return;
  form.dataset.wired = "1";

  form.addEventListener("click", async (e) => {
    const chip = e.target.closest("[data-amt]");
    if (chip) {
      const input = $("#depAmt");
      if (!input) return;
      input.value = chip.dataset.amt;
      /* a quick amount is a deliberate choice, so any complaint about the
         amount is cleared rather than left under a field that is now correct */
      const field = input.closest(".field");
      field?.classList.remove("invalid");
      const err = field?.querySelector(".field-error");
      if (err) { err.textContent = ""; err.style.display = "none"; }
      paintSummary();
      paintAmountState();
      return;
    }
    const copy = e.target.closest("[data-copy]");
    if (copy) {
      try { await navigator.clipboard.writeText(copy.dataset.copy); toast("Copied.", "ok"); }
      catch { toast("Could not copy. Select it and copy it manually.", "warn"); }
    }
  });
}

/* the action button and the live fields, per method */
function wireMethod(m, settings) {
  currentMethod = m;
  const form = $("#depForm");
  if (!form) return;
  wireForm();

  /* the summary follows what is typed, so nothing is confirmed by surprise */
  $("#depAmt")?.addEventListener("input", () => { paintSummary(); paintAmountState(); });
  /* Enter in the amount box continues, because that is what it means here */
  $("#depAmt")?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if ($("#depGo")?.disabled) { amtError(amountProblem() || "Enter an amount first."); return; }
    $("#depGo")?.click();
  });

  const actions = form.querySelector(".dep2-actions") || form;
  if ($("#depGo")) return;
  const go = document.createElement("button");
  go.className = "btn btn-primary btn-lg btn-block dep2-go";
  go.id = "depGo";
  go.type = "button";
  go.innerHTML = '<span class="dep2-go-txt">' +
    (m.key === "crypto" ? "Continue to payment" : "Continue to payment") + "</span>" +
    '<span class="dep2-go-ic">' + icon("arrow-right", "ic") + "</span>";
  go.addEventListener("click", () => startDeposit(m, settings));
  actions.appendChild(go);
  paintSummary();
  paintAmountState();
}

/* Why the amount will not do, in words — or nothing, if it is fine. Kept in one
   place so the box, the button and the message can never disagree about whether
   the amount is usable. */
function amountProblem() {
  const input = $("#depAmt");
  if (!input) return "Enter an amount first.";
  const raw = input.value.trim();
  if (!raw) return null;                       /* empty is not yet wrong */
  const amt = Number(raw);
  if (!Number.isFinite(amt)) return "Enter a number, without any other letters.";
  if (amt <= 0) return "Enter an amount above zero.";
  const min = methodMin(currentMethod || {});
  if (min && amt < min) return "The least you can add through this method is " + inr(min) + ".";
  return null;
}

/* Paints the amount's state: which quick button is the one chosen, whether the
   number is usable, and whether the button to continue is live. The message
   appears as soon as the number is wrong rather than after a press, and the
   press is not left to fail silently either — the button is simply not live. */
function paintAmountState() {
  const input = $("#depAmt");
  if (!input) return;
  const val = input.value.trim();
  const field = input.closest(".field");
  const err = field?.querySelector(".field-error");
  const problem = amountProblem();

  /* the quick button that matches what is typed is the chosen one */
  $$(".dep2-quick .chip").forEach((c) => {
    const on = val !== "" && Number(c.dataset.amt) === Number(val);
    c.classList.toggle("active", on);
    c.setAttribute("aria-pressed", on ? "true" : "false");
  });

  if (problem) {
    field?.classList.add("invalid");
    if (err) { err.textContent = problem; err.style.display = "block"; }
  } else {
    field?.classList.remove("invalid");
    if (err) { err.textContent = ""; err.style.display = "none"; }
  }

  /* nothing typed yet is not a refusal, only an unfinished thought — so the
     button waits quietly rather than saying no to an empty box */
  const go = $("#depGo");
  if (go) go.disabled = !!problem || val === "";
}

/* The contact number lives on the Firestore profile; the Firebase Auth user
   object only has one when phone auth was used, which this store never does. */
function userPhone() {
  return String(PROFILE?.phone || "").trim();
}

function amtError(msg) {  const box = $("#depAmt")?.closest(".field");
  if (!box) { toast(msg, "warn"); return; }
  box.classList.add("invalid");
  const err = box.querySelector(".field-error");
  if (err) { err.textContent = msg; err.style.display = "block"; }
}

async function startDeposit(m, settings) {
  const amt = Number($("#depAmt").value);
  const min = methodMin(m);
  if (!amt || !Number.isFinite(amt) || amt < min) { amtError("Enter an amount of at least " + min + "."); return; }
  $("#depAmt")?.closest(".field")?.classList.remove("invalid");

  /* No hash is collected here any more. The reference is asked for on the crypto
     payment sheet, after the address has been shown, because that is the point
     at which the customer has actually sent something and can look it up. */
  const hash = "";

  try {
    const ref = await createDeposit({
      user: { id: CURRENT.uid, name: CURRENT.displayName || "Guest", email: CURRENT.email, phone: userPhone() },
      amount: amt,
      method: m.key,
      methodLabel: m.title || "",
      upiId: m.upiId || "",
      cryptoAddress: m.address || "",
      cryptoCurrency: m.currency || "",
      cryptoNetwork: m.network || "",
      hash,
      gateway: m.key === "zap" ? "zapupi" : ""
    });

    activeDep = { id: ref.id, amount: amt, method: m.key, ref: "DEP" + ref.id.slice(-6).toUpperCase() };

    if (m.key === "upi") showManualUpi(activeDep, m);
    else if (m.key === "crypto") showCryptoSheet(activeDep, m);
    else startGateway(activeDep, m);
  } catch (e) {
    console.error(e);
    toast("Could not start the deposit. Please try again.", "err");
  }
}

/* ---------- method: manual UPI ---------- */
async function showManualUpi(dep, m) {
  /* The dialog is sized for the method picker, which is two columns and wants
     the room. The payment sheet is one narrow column: a QR, a timer, four
     buttons and a form. Left at the picker's width it sat in the middle of a
     wide empty box, so the dialog is marked for the sheet and the stylesheet
     brings it down to the width the content actually needs. */
  $("#depModal").classList.add("dep-modal--sheet");
  $("#depBody").innerHTML = '<div id="depSheet"><div class="loader" style="padding:30px">' +
    '<span class="spinner"></span>Preparing payment&hellip;</div></div>';

  const sheet = await paymentSheet($("#depSheet"), {
    /* the method config calls it vpa, paymentSheet's own option is upiId */
    upiId: m.vpa,
  /* the sheet's option is payee, not payeeName. Passing payeeName left the
  deep link showing a name fixed in the code, whatever the shop had set in the
  panel — a payment reference is what a customer sees in their bank's app. */
    payee: m.payeeName || brandName(),
    amount: dep.amount,
    note: "Wallet deposit " + dep.ref,
    ref: dep.ref,
    minutes: m.expiryMinutes || 10,
    /* the picture the shop uploaded, if there is one. It is what the customer
       scans; the code drawn from the link is only the fallback. */
    qrImage: m.qrImage || "",
    notes: m.notes,
    expiredText: "Start a new deposit request if this one expires.",
    onSubmit: async (utr) => {
      try {
        await submitDepositUTR(dep.id, utr);
        stopTimer?.();
        done("Payment submitted",
          "We have your reference. Your wallet is credited once it is verified.",
          dep, utr);
        toast("Deposit submitted for verification.", "ok");
        await load();
      } catch (e) {
        console.error(e);
        toast("Could not submit the reference. Please try again.", "err");
      }
    }
  });
  stopTimer = sheet.stop;
}

/* ---------- method: crypto ----------
   Crypto used to be a form in the same step as the amount: the address, the
   network and an empty transaction-hash box were all sitting there before the
   customer had chosen what to pay. That put the whole job on screen too early —
   an address with no amount on it makes a QR nobody can use, and a hash box
   invites a paste when there is nothing yet to have sent.

   Now it works the way manual UPI works: this step asks only for the amount,
   and pressing the button brings up a payment sheet with the QR, the address to
   copy, the countdown, and the hash box for afterwards. The sheet is the same
   one, only with the UPI app row left out and the wording changed, because a
   crypto transfer has no UPI apps to open and no 12-digit reference — it has a
   transaction hash, which is a long hex string and is not 12 digits. */
async function showCryptoSheet(dep, m) {
  $("#depModal").classList.add("dep-modal--sheet");
  $("#depBody").innerHTML = '<div id="depSheet"><div class="loader" style="padding:30px">' +
    '<span class="spinner"></span>Preparing payment&hellip;</div></div>';

  const sheet = await paymentSheet($("#depSheet"), {
    /* there is no UPI link to build for a chain, so the QR is drawn from the
       address itself and the picture the shop supplied is preferred over it */
    upiId: m.address || "",
    payee: m.payeeName || brandName(),
    amount: dep.amount,
    note: "Wallet deposit " + dep.ref,
    ref: dep.ref,
    minutes: 10,
    qrImage: m.qrImage || "",
    apps: false,
    refLabel: "I have sent it — paste the transaction hash",
    refPlaceholder: "Paste the hash from your wallet",
    refHint: "Your wallet is credited once the network confirms the transfer.",
    /* a transaction hash is hex and far longer than a UTR; what matters is that
       something was pasted and it is not the amount or the address again */
    refTest: /^[0-9a-fA-F]{16,128}$/,
    refTooShort: "Paste the full transaction hash from your wallet.",
    refWrong: "That does not look like a transaction hash. Check it in your wallet and try again.",
    submitText: "I have sent it — submit",
    copyToast: "Address copied.",
    expiredText: "Start a new request if this one expires.",
    onSubmit: async (hash) => {
      try {
        await submitDepositUTR(dep.id, hash);
        stopTimer?.();
        done("Transfer submitted",
          "An admin will confirm this once the network has confirmed your transfer.",
          dep, hash);
        toast("Submitted for confirmation.", "ok");
        await load();
      } catch (e) {
        console.error(e);
        toast("Could not submit the transaction hash.", "err");
      }
    }
  });
  stopTimer = sheet.stop;
}

/* ---------- method: ZapUPI AutoPay ----------
   ZapUPI ships a browser kit that does the whole automatic part: it creates the
   order against their API, opens the UPI screen in a full-screen overlay on top
   of our page, and reports success or failure back through callbacks. We poll
   `orderStatus` alongside it, because a customer can close the tab while the
   UPI app is in front of them and still have paid. */
async function startGateway(dep, m) {
  /* same one-column sheet as manual UPI, so the same dialog width */
  $("#depModal").classList.add("dep-modal--sheet");
  $("#depBody").innerHTML = '<div id="depSheet"><div class="loader" style="padding:30px">' +
    '<span class="spinner"></span>Opening your UPI screen&hellip;</div></div>';

  let Z;
  try {
    Z = await loadZapSdk();
  } catch (e) {
    console.error(e);
    failScreen("Could not reach the payment gateway", e.message || "Check your connection and try again.");
    return;
  }

  /* ZapUPI calls these when its overlay closes. onSuccess only means the
     customer finished on their side, so it starts the same status check a
     closing tab would have. */
  Z.setPaymentCallbacks({
    onSuccess: () => checkZapOnce(dep, m, true),
    onFailed: () => zapOutcome(dep, "The payment did not go through.", false),
    onTimeout: () => zapOutcome(dep, "The payment timed out. Nothing has been charged.", false)
  });

  /* our own order id, so a deposit can be traced back from either side */
  const orderId = "BUN" + Date.now().toString(36).toUpperCase() + dep.id.slice(-4).toUpperCase();

  const params = {
    zap_key: String(m.zapKey || "").trim(),
    order_id: orderId,
    amount: String(dep.amount),
    remark: "Wallet deposit " + dep.ref
  };
  /* the customer's number is sent when we have one: ZapUPI uses it to pre-fill
     their UPI app, but the order works without it */
  const ph = userPhone();
  if (ph) params.customer_mobile = ph.replace(/\D/g, "").slice(-10);

  Z.createOrder(params, {
    onResponse: async (url) => {
      /* the kit covers the screen, so anything under it is only a fallback */
      $("#depBody").innerHTML = waitScreen(dep, m);
      /* The order id is written onto the deposit before the payment screen is
         handed over. This is the step that makes the money find its way back:
         from here on the order can be found in the database and asked about,
         so closing the tab, refreshing, or coming back tomorrow cannot lose it.
         A failure to save is not fatal, because the poll on this page still
         covers the customer who stays. */
      try { await attachGatewayOrder(dep.id, orderId); }
      catch (e) { console.error("Could not record the gateway order:", e); }
      rememberGatewayOrder({ orderId, depId: dep.id, amount: dep.amount, ref: dep.ref });
      Z.loadPayment(url);
      pollGateway(dep, m, orderId);
    },
    onError: (err) => {
      console.error("ZapUPI createOrder:", err);
      failScreen("Could not start the payment",
        String(err || "").slice(0, 160) || "Please try again in a moment.");
    }
  });
}

/* ZapUPI has reported a final answer: paid, or not. */
function zapOutcome(dep, text, paid) {
  clearInterval(pollTimer);
  stopTimer?.();
  forgetGatewayOrder();
  if (paid) {
    finishPaid(dep, dep.ref);
  } else {
    $("#depBody").innerHTML = '<div class="empty"><div class="empty-ic">' + icon("alert") + "</div>" +
      "<h3>Payment not completed</h3><p>" + esc(text) + "</p>" +
      '<button class="btn btn-primary btn-block mt-3" data-dep-retry>Try again</button></div>';
    $("[data-dep-retry]")?.addEventListener("click", () => openDeposit());
  }
}

/* One status call, shared by the overlay callbacks and the poll loop. */
async function checkZapOnce(dep, m, fromOverlay) {
  if (!zapOrderId) return;
  try {
    const Z = await loadZapSdk();
    const st = await zapStatus(Z, m, zapOrderId);
    if (st.ok) { finishPaid(dep, st.ref || dep.ref); return true; }
    if (st.failed) { zapOutcome(dep, st.reason, false); return true; }
  } catch (e) {
    /* the poll loop keeps trying; the overlay callback does not need to */
    if (fromOverlay) console.warn("ZapUPI status check:", e.message);
  }
  return false;
}

function pollGateway(dep, m, orderId) {
  clearInterval(pollTimer);
  zapOrderId = orderId;
  const every = Math.max(2, Number(m.pollSeconds) || 4) * 1000;
  const maxTries = Math.max(3, Number(m.maxTries) || 10);
  let tries = 0;

  pollTimer = setInterval(async () => {
    const note = $("#depWait");
    /* out of tries: stop pretending, and leave the deposit in the admin's list
       so it can still be approved by hand if the money did arrive */
    if (++tries > maxTries) {
      clearInterval(pollTimer);
      if (note) note.textContent = "Still checking in the background. If you have paid, your wallet will be credited shortly \u2014 you can also close this.";
      return;
    }
    try {
      const Z = await loadZapSdk();
      const st = await zapStatus(Z, m, orderId);
      if (st.ok) { clearInterval(pollTimer); finishPaid(dep, st.ref || dep.ref); return; }
      if (st.failed) { zapOutcome(dep, st.reason, false); return; }
      if (note) note.textContent = "Waiting for the payment to land\u2026 " +
        new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch {
      /* a flaky network must not cancel the deposit, the next tick tries again */
      if (note) note.textContent = "Still checking\u2026 if you have already paid, this will update shortly.";
    }
  }, every);
}

/* Credits once. markDepositPaid runs in a transaction and ignores an already
   approved deposit, so an overlay callback and a poll tick landing together
   still only add the money to the balance a single time. */
async function finishPaid(dep, ref) {
  clearInterval(pollTimer);
  stopTimer?.();
  forgetGatewayOrder();
  try { window.ZapUPI?.closePayment?.(); } catch { /* the overlay is already gone */ }
  try { await markDepositPaid(dep.id, ref); }
  catch (e) { console.error(e); }
  done("Payment received", "Your wallet has been credited.", dep, ref);
  toast(inr(dep.amount) + " added to your wallet.", "ok", "Payment successful");
  await load();
}

function waitScreen(dep, m) {
  return '<div class="dep-auto">' +
    '<div class="dep-auto-head">' + icon("zap") +
      "<div><b>Pay " + inr(dep.amount) + "</b><small>Reference " + esc(dep.ref) + "</small></div></div>" +
    '<div class="dep-wait" id="depWait"><span class="spinner"></span> Complete the payment in the UPI screen&hellip;</div>' +
  "</div>";
}

function failScreen(title, text) {
  $("#depBody").innerHTML = '<div class="empty"><div class="empty-ic">' + icon("alert") + "</div>" +
    "<h3>" + esc(title) + "</h3><p>" + esc(text) + "</p>" +
    '<button class="btn btn-primary btn-block mt-3" data-dep-retry>Try again</button></div>';
  $("[data-dep-retry]")?.addEventListener("click", () => openDeposit());
}

/* ---------- checking a payment made in an earlier session ----------
   The order id now lives on the deposit document, so this is not a local
   handover any more: the sweep in zap-service.js reads the open deposits from
   the database and asks the gateway about each one, which is what lets a
   customer pay, close the browser, and open the site again tomorrow and still
   be credited. This local copy is only used to carry the order that is being
   paid right now, and to keep watching it on this page while it settles. */
function resumeOnThisPage() {
  const o = readGatewayOrder();
  if (!o) return;

  getPaymentSettings().then((s) => {
    const m = s && s.methods && s.methods.zap;
    if (!m || !m.on || !m.zapKey) { forgetGatewayOrder(); return; }

    const dep = { id: o.depId, amount: o.amount, method: "zap", ref: o.ref };
    return loadZapSdk()
      .then((Z) => zapStatus(Z, m, o.orderId))
      .then((st) => {
        if (st.ok) { finishPaid(dep, st.ref || dep.ref); return true; }
        if (st.failed) { zapOutcome(dep, st.reason, false); return true; }
        /* still unpaid, so keep watching rather than asking them to start over */
        toast("We are still checking your last payment.", "info");
        pollGateway(dep, m, o.orderId);
        return false;
      })
      .catch(() => { /* offline: the next visit picks it up from the database */ });
  });
}

/* ---------- the shared confirmation screen ---------- */
function done(title, text, dep, extra) {
  const label = dep.method === "zap" ? "UPI gateway"
    : dep.method === "crypto" ? "Crypto" : "Manual UPI";
  const rows = [
    ["Amount", inr(dep.amount)],
    ["Method", label],
    ["Reference", esc(dep.ref)]
  ];
  if (extra) rows.push([dep.method === "crypto" ? "Transaction hash" : "Your UTR", esc(extra)]);

  $("#depBody").innerHTML =
    '<div class="empty"><div class="empty-ic" style="background:var(--ok-50);color:var(--ok-500)">' + icon("check") + "</div>" +
    "<h3>" + esc(title) + "</h3><p>" + esc(text) + "</p>" +
    '<div class="card card-pad" style="background:var(--ink-50);text-align:left">' +
      rows.map((r) => '<div class="flex between center gap-3"><span class="text-muted fs-sm">' + r[0] +
        '</span><b class="mono" style="overflow-wrap:anywhere;text-align:right">' + r[1] + "</b></div>").join("") +
    "</div>" +
    '<button class="btn btn-primary btn-block mt-3" data-close>Done</button></div>';
}

/* ---------- load ---------- */
async function load() {
  /* Nobody signed in yet: there is no wallet to read, and no failure to report
     either. Saying "could not load the wallet" to a visitor who has simply not
     signed in was wrong — nothing failed. The balance stays at zero and the
     history area says what it would take to see it. */
  if (!CURRENT) {
    getWalletCache = null;
    TXNS = [];
    DEPS = [];
    paint();
    return;
  }

  try {
    getWalletCache = await getWallet(CURRENT.uid);
    [TXNS, DEPS] = await Promise.all([getWalletTxns(CURRENT.uid, 60), getUserDeposits(CURRENT.uid, 20)]);
    paint();
  } catch (e) {
    console.error(e);
    $("#txnList").innerHTML = '<div class="alert alert-err">' + icon("alert") +
      "<div><b>Could not load the wallet</b><br>Check your connection and try again.</div></div>";
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  /* The page no longer sends a signed-out visitor away. It used to call
     requireLogin(), which redirected to the sign-in page before anything was
     drawn — so the "Add money" button the visitor came for was never on screen,
     and the only way to reach the wallet was to be signed in already.
     Now the page opens for everyone: a signed-in visitor sees their balance as
     before, and anyone else presses Add money and signs in inside the dialog. */
  await whenReady();
  await load();

  $("#addBtn").addEventListener("click", openDeposit);
  $("#addFirst")?.addEventListener("click", openDeposit);
  $("#txnBtn").addEventListener("click", () =>
    $("#txnList").scrollIntoView({ behavior: "smooth", block: "center" }));

  /* A customer can close the tab while the UPI app is in front of them, having
     already paid. The ZapUPI order id is kept in localStorage so coming back to
     the wallet picks the check up again instead of stranding the deposit. */
  resumeOnThisPage();
});

/* nav wallet chip on every page */
document.addEventListener("DOMContentLoaded", async () => {
  const nav = $("#navWallet");
  if (!nav) return;
  const { watchAuth } = await import("../core/auth.js");
  watchAuth(async (u) => {
    if (!u) {
      nav.hidden = true;
      document.dispatchEvent(new CustomEvent("wallet:change", { detail: { balance: null } }));
      return;
    }
    try { nav.hidden = false; } catch { /* ignore */ }
  });
});
