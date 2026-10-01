import { db, storage, COL } from "../core/firebase-config.js";

import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, writeBatch,
  query, where, orderBy, limit, serverTimestamp, increment, runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref as sref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

/* =========================================================
   REVIEWS / TESTIMONIALS  (rendered in the homepage reviews strip)
   ========================================================= */
export async function getReviews(limitN = 12) {
  try {
    const snap = await getDocs(query(collection(db, COL.reviews), orderBy("sort", "asc"), limit(limitN)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((r) => r.on !== false);
  } catch {
    return [];
  }
}

export async function saveReview(data, id) {
  const body = { ...data, sort: Number(data.sort) || 0, on: data.on !== false, updatedAt: serverTimestamp() };
  if (id) await setDoc(doc(db, COL.reviews, id), body, { merge: true });
  else await addDoc(collection(db, COL.reviews), { ...body, createdAt: serverTimestamp() });
}

export async function removeReview(id) {
  await deleteDoc(doc(db, COL.reviews, id));
}


/* =========================================================
   FAQ
   ========================================================= */
export async function getFaqs() {
  try {
    const snap = await getDocs(query(collection(db, COL.faqs), orderBy("sort", "asc")));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    return [];
  }
}

export async function saveFaq(data, id) {
  const body = { q: (data.q || "").trim(), a: (data.a || "").trim(), sort: Number(data.sort) || 0, on: data.on !== false };
  if (!body.q || !body.a) throw new Error("Both the question and the answer are required.");
  if (id) await setDoc(doc(db, COL.faqs, id), { ...body, updatedAt: serverTimestamp() }, { merge: true });
  else await addDoc(collection(db, COL.faqs), { ...body, createdAt: serverTimestamp() });
}

export async function removeFaq(id) {
  await deleteDoc(doc(db, COL.faqs, id));
}


/* =========================================================
   CONTACT MESSAGES  (the contact form already collects these)
   ========================================================= */
export async function getMessages(limitN = 100) {
  try {
    const snap = await getDocs(query(collection(db, COL.messages), orderBy("createdAt", "desc"), limit(limitN)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    return [];
  }
}

/* the contact form stamps "handled", so that is the flag we keep using here */
export async function setMessageRead(id, read) {
  await updateDoc(doc(db, COL.messages, id), { handled: !!read });
}

export async function setAllMessagesRead(read) {
  const snap = await getDocs(collection(db, COL.messages));
  await Promise.all(snap.docs.filter((d) => !!(d.data().handled ?? d.data().read) !== !!read).map((d) => updateDoc(d.ref, { handled: !!read })));
}

export async function removeMessage(id) {
  await deleteDoc(doc(db, COL.messages, id));
}

/* Clears every message already dealt with, in one go. This list is the one place
   in the panel that fills up on its own: the contact form takes a message from
   anyone, signed in or not, so it is the one that grows without anybody choosing
   to add to it. Deleting handled ones is what keeps that from turning into a
   list nobody reads. Anything still waiting is left alone. */
export async function removeHandledMessages(ids) {
  const list = [...new Set((ids || []).filter(Boolean))];
  if (!list.length) return 0;
  for (let i = 0; i < list.length; i += 400) {
    const b = writeBatch(db);
    for (const id of list.slice(i, i + 400)) b.delete(doc(db, COL.messages, id));
    await b.commit();
  }
  return list.length;
}
