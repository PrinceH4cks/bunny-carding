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
