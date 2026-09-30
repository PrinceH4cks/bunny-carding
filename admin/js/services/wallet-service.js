import { rupees } from "../core/app.js";
import { queryTolerant } from "./order-service.js";
import { db, storage, COL } from "../core/firebase-config.js";

import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc,
  query, where, orderBy, limit, serverTimestamp, increment, runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref as sref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

/* =========================================================
   WALLET
   Each user has one wallet doc; every movement is a txn doc.
   Balance only changes through an approved flow.
   ========================================================= */
export async function getWallet(uid_) {
  const s = await getDoc(doc(db, COL.wallets, uid_));
  if (s.exists()) return { id: s.id, ...s.data() };
  await setDoc(doc(db, COL.wallets, uid_), {
    balance: 0, locked: 0, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  }, { merge: true });
  return { id: uid_, balance: 0, locked: 0 };
}

export async function creditWallet(uid_, amount, note = "", ref = "") {
  let balance = 0;
  await runTransaction(db, async (tx) => {
    const ref2 = doc(db, COL.wallets, uid_);
    const snap = await tx.get(ref2);
    const cur = snap.exists() ? snap.data() : { balance: 0 };
    const next = Number(cur.balance || 0) + Number(amount);
    tx.set(ref2, { balance: next, updatedAt: serverTimestamp() }, { merge: true });
    balance = next;
  });
  await addDoc(collection(db, COL.walletTxns), {
    userId: uid_, type: "credit", amount: Number(amount), note, ref,
    balanceAfter: balance, createdAt: serverTimestamp()
  });
  return balance;
}

export async function debitWallet(uid_, amount, note = "", ref = "") {
  let ok = false, balance = 0;
  await runTransaction(db, async (tx) => {
    const ref2 = doc(db, COL.wallets, uid_);
    const snap = await tx.get(ref2);
    const cur = snap.exists() ? snap.data() : { balance: 0 };
    if (Number(cur.balance || 0) < Number(amount)) return;
    const next = Number(cur.balance || 0) - Number(amount);
    tx.set(ref2, { balance: next, updatedAt: serverTimestamp() }, { merge: true });
    balance = next;
    ok = true;
  });
  if (ok) {
    await addDoc(collection(db, COL.walletTxns), {
      userId: uid_, type: "debit", amount: Number(amount), note, ref,
      balanceAfter: balance, createdAt: serverTimestamp()
    });
  }
  return ok ? { ok: true, balance } : { ok: false, reason: "insufficient" };
}

export const normRow = (id, d) => ({ id, ...d, _date: d.createdAt?.toDate?.() || null });

export async function getWalletTxns(uid_, limitN = 50) {
  return queryTolerant(
    () => query(collection(db, COL.walletTxns), where("userId", "==", uid_),
                orderBy("createdAt", "desc"), limit(limitN)),
    () => query(collection(db, COL.walletTxns), where("userId", "==", uid_), limit(limitN * 3)),
    normRow
  );
}


/* =========================================================
   WALLET CONTROL (admin only)
   The balance is never written straight to the wallet doc. An add, a removal
   and an exact-set all funnel through creditWallet / debitWallet so every
   single change leaves a wallet_txns row, which means the user sees the same
   history the admin did and no movement can be made silently.
   ========================================================= */

/* One read of the whole wallets collection, keyed by user id, so the users
   table can show a balance column without a request per row. */
export async function getAllWallets() {
  const s = await getDocs(collection(db, COL.wallets));
  const out = {};
  s.forEach((d) => { out[d.id] = d.data() || {}; });
  return out;
}

/* delta > 0 adds money, delta < 0 takes it away. Rounded to whole rupees so a
   stray decimal can never leave a balance like 450.5000001. */
export async function adjustWallet(uid_, delta, note = "Admin adjustment", ref = "") {
  const amt = Math.round(Number(delta) || 0);
  if (!amt) return { ok: false, reason: "zero" };
  if (amt > 0) {
    const balance = await creditWallet(uid_, amt, note, ref);
    return { ok: true, balance, delta: amt };
  }
  const r = await debitWallet(uid_, -amt, note, ref);
  return r.ok ? { ok: true, balance: r.balance, delta: amt } : r;
}

/* Set an exact figure. Works out the difference first, so setting 500 when the
   balance is 500 logs nothing, and setting 500 when it is 1200 logs one debit
   rather than rewriting the document. */
export async function setWalletBalance(uid_, target, note = "Admin balance set", ref = "") {
  const w = await getWallet(uid_);
  const cur = Number(w.balance || 0);
  const want = Math.max(0, Math.round(Number(target) || 0));
  const delta = want - cur;
  if (!delta) return { ok: true, balance: cur, delta: 0 };
  return adjustWallet(uid_, delta, note, ref);
}

/* Freeze or unfreeze a wallet. A locked balance is still shown but the user
   cannot spend it until it is released. */
export async function setWalletLocked(uid_, locked) {
  await setDoc(doc(db, COL.wallets, uid_), {
    locked: !!locked, updatedAt: serverTimestamp()
  }, { merge: true });
  return !locked;
}
