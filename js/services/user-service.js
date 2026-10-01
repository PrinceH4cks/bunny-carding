import { field } from "../core/app.js";
import { creditWallet, normRow } from "./wallet-service.js";
import { queryTolerant } from "./order-service.js";
import { db, storage, COL } from "../core/firebase-config.js";

import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc,
  query, where, orderBy, limit, serverTimestamp, increment, runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref as sref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

/* ============ USERS ============ */
const normUser = (id, d) => ({ id, ...d, _date: d.createdAt?.toDate?.() || null });

export async function getAllUsers(limitN = 500) {
  return (await getDocs(query(collection(db, COL.users), limit(limitN)))).docs.map((d) => normUser(d.id, d.data()));
}

export async function getUserDoc(id) {
  const s = await getDoc(doc(db, COL.users, id));
  return s.exists() ? normUser(s.id, s.data()) : null;
}

export async function toggleUserActive(id, active) {
  await updateDoc(doc(db, COL.users, id), { disabled: !active, updatedAt: serverTimestamp() });
}


/* =========================================================
   DEPOSIT REQUESTS (user -> QR -> UTR -> admin approves)
   ========================================================= */
/* A deposit remembers which of the three methods it came through, so an admin
   looking at the list knows whether to expect a UTR, a transaction hash, or
   nothing at all because the gateway already confirmed it. */
export async function createDeposit({
  user, amount, method = "upi", methodLabel = "", upiId = "",
  cryptoAddress = "", cryptoCurrency = "", cryptoNetwork = "", hash = "", gateway = ""
}) {
  const r = addDoc(collection(db, COL.deposits), {
    userId: user.id, userName: user.name, userEmail: user.email, userPhone: user.phone || "",
    amount: Number(amount), method, methodLabel: methodLabel || method,
    upiId: upiId || "",
    cryptoAddress: cryptoAddress || "", cryptoCurrency: cryptoCurrency || "", cryptoNetwork: cryptoNetwork || "",
    gateway: gateway || "",
    /* one field carries whichever reference this method produces */
    utr: hash ? "" : "", hash: hash || "",
    status: "pending", createdAt: serverTimestamp()
  });
  return r;
}

/* For UPI the customer types a UTR; for crypto they paste a transaction hash.
   Both land in the same document, so the field name says which one it is. */
export async function submitDepositUTR(id, ref) {
  const v = String(ref || "").trim();
  await updateDoc(doc(db, COL.deposits, id), {
    utr: v, hash: v, status: "submitted", updatedAt: serverTimestamp()
  });
}

/**
 * Writes the gateway's own order id onto the deposit.
 *
 * This is the field that makes an automatic payment survive the browser being
 * closed. ZapUPI only knows the order while its overlay is on screen; once the
 * page is gone the order id is gone with it, and the money is paid but
 * untraceable. Keeping it on the document means any later visit, from any
 * device, can ask the gateway what became of that order.
 */
export async function attachGatewayOrder(id, orderId) {
  const v = String(orderId || "").trim();
  if (!v) return;
  await updateDoc(doc(db, COL.deposits, id), {
    gatewayOrderId: v, gatewayStatusAt: serverTimestamp(), updatedAt: serverTimestamp()
  });
}

/* Deposits that are still open, which is what a reconciliation has to look at.
   Anything already approved or rejected is final and costs nothing to skip. */
export const OPEN_DEPOSIT = { notIn: ["approved", "rejected"] };

/**
 * Credits a deposit the gateway already confirmed.
 *
 * Safe to call twice: the read and the status write happen in one transaction,
 * so a browser poll and the gateway's webhook landing together still only
 * credit the customer once.
 */
export async function markDepositPaid(id, ref = "") {
  return runTransaction(db, async (tx) => {
    const dref = doc(db, COL.deposits, id);
    const snap = await tx.get(dref);
    if (!snap.exists()) return { ok: false, reason: "missing" };
    const d = snap.data() || {};
    if (d.status === "approved") return { ok: true, already: true };
    await creditWallet(d.userId, Number(d.amount || 0), "Wallet deposit received");
    tx.update(dref, {
      status: "approved",
      utr: ref || d.utr || "",
      hash: ref || d.hash || "",
      autoApproved: true,
      updatedAt: serverTimestamp()
    });
    return { ok: true, already: false };
  });
}

export async function getUserDeposits(uid_, limitN = 30) {
  return queryTolerant(
    () => query(collection(db, COL.deposits), where("userId", "==", uid_),
                orderBy("createdAt", "desc"), limit(limitN)),
    () => query(collection(db, COL.deposits), where("userId", "==", uid_), limit(limitN * 3)),
    normRow
  );
}

export async function getDeposits({ status = "", limitN = 200 } = {}) {
  if (!status) {
    return (await getDocs(query(collection(db, COL.deposits),
      orderBy("createdAt", "desc"), limit(limitN)))).docs.map((d) => normRow(d.id, d.data()));
  }
  return queryTolerant(
    () => query(collection(db, COL.deposits), where("status", "==", status),
                orderBy("createdAt", "desc"), limit(limitN)),
    () => query(collection(db, COL.deposits), where("status", "==", status), limit(limitN * 3)),
    normRow
  );
}

export async function approveDeposit(id, uid_, amount) {
  await creditWallet(uid_, amount, "Wallet deposit approved");
  await updateDoc(doc(db, COL.deposits, id), { status: "approved", updatedAt: serverTimestamp() });
}

export async function rejectDeposit(id) {
  await updateDoc(doc(db, COL.deposits, id), { status: "rejected", updatedAt: serverTimestamp() });
}


/* =========================================================
   SITE CONTENT  (admin-editable copy for the user panel)
   The defaults below are the exact strings that are hardcoded in the markup
   today, so if an admin never saves anything the site looks exactly the same.
   ========================================================= */
export const DEFAULT_SITE = {
  announcement: { on: false, text: "", href: "" },
  hero: {
    eyebrow: "Live now \u2014 flat 20% off with code SHOP10",
    headline: "Thousands of cards, the lowest prices",
    lead: "Gift cards and prepaid vouchers for mobile, electronics, fashion, home, beauty, grocery and far more \u2014 100% genuine, shown in your account instantly.",
    ctaPrimary: "Shop all products",
    ctaSecondary: "How it works"
  },
  heroStats: [
    { value: "12,500+", label: "Happy customers" },
    { value: "48+",     label: "Products live" },
    { value: "4.9 \u2605", label: "Average rating" }
  ],
  ticker: ["100% GENUINE", "INSTANT ACCESS", "SECURE WALLET PAYMENTS", "NO SHIPPING FEES", "24/7 SUPPORT", "LIVE UPI QR"],
  sections: { categories: true, bestsellers: true, reviews: true, quote: true },
  /* network -> card theme id, set from Admin > Site content > Card look.
     Empty means every card keeps its built-in network colour. */
  cardThemes: {},
  reviewsHead: { badge: "Reviews", title: "What our customers say", rating: "4.9 / 5", count: "3,180 reviews" },
  quote: { text: "Place your first order today and get 20% off with code SHOP10.", cta: "Shop cards" },
  store: {
    phone: "1800-123-456",
    email: "support@bunnystore.in",
    address: "Lucknow, Uttar Pradesh",
    hours: "Mon\u2013Sat, 9 AM \u2013 8 PM"
  }
};

export async function getSiteContent() {
  try {
    const s = await getDoc(doc(db, COL.settings, "site"));
    const d = s.exists() ? s.data() : {};
    return {
      ...DEFAULT_SITE,
      ...d,
      announcement: { ...DEFAULT_SITE.announcement, ...(d.announcement || {}) },
      hero: { ...DEFAULT_SITE.hero, ...(d.hero || {}) },
      sections: { ...DEFAULT_SITE.sections, ...(d.sections || {}) },
      reviewsHead: { ...DEFAULT_SITE.reviewsHead, ...(d.reviewsHead || {}) },
      quote: { ...DEFAULT_SITE.quote, ...(d.quote || {}) },
      store: { ...DEFAULT_SITE.store, ...(d.store || {}) },
      cardThemes: (d.cardThemes && typeof d.cardThemes === "object" && !Array.isArray(d.cardThemes)) ? d.cardThemes : {},
      heroStats: Array.isArray(d.heroStats) && d.heroStats.length ? d.heroStats.slice(0, 3) : DEFAULT_SITE.heroStats,
      ticker: Array.isArray(d.ticker) && d.ticker.length ? d.ticker.slice(0, 12) : DEFAULT_SITE.ticker
    };
  } catch {
    return { ...DEFAULT_SITE };
  }
}

export async function saveSiteContent(data) {
  await setDoc(doc(db, COL.settings, "site"), { ...data, updatedAt: serverTimestamp() }, { merge: true });
}
