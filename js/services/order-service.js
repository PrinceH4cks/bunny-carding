import { orderNo, field } from "../core/app.js";
import { getProducts, luhn } from "./product-service.js";
import { getAllUsers } from "./user-service.js";
import { db, storage, COL } from "../core/firebase-config.js";
import { totals } from "./cart-service.js";

import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc,
  query, where, orderBy, limit, serverTimestamp, increment, runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref as sref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

/* =============================================================================
   CARD ISSUING

   A product document used to hold one cardNo/pin/cvv, and stock was only a
   count. That meant buying the same product twice handed over the same card
   twice, which is both wrong and obvious to a customer.

   Every purchase now mints a fresh card. The guarantee that a number is never
   reused comes from a per-product serial that is bumped inside a transaction:
   the number is built as BIN(6) + serial(6) + random(3) + Luhn(1) = 16, so a
   product can issue 999,999 distinct cards before the serial space is even
   close to wrapping. The random tail stops two cards issued moments apart from
   looking sequential.
   ============================================================================= */

const BIN = {
  visa: "412309", mastercard: "531092", maestro: "630400",
  amex: "378282", rupay: "607120", netbanking: "402266"
};

/* Random bytes, not random digits. digits(1) returns 0-9, and building a PIN
   out of two of those gave about 100 possible values, so cards repeated their
   PIN within a few purchases. */
const rnd = (max) => {
  const buf = new Uint32Array(1);
  const g = globalThis.crypto?.getRandomValues
    ? () => globalThis.crypto.getRandomValues(buf)
    : () => { buf[0] = Math.floor(Math.random() * 4294967296); };
  /* values from the ragged top of the 32 bit range are redrawn, so every
     outcome is equally likely instead of the low end being slightly favoured */
  const limit = 4294967296 - (4294967296 % max);
  for (let i = 0; i < 8; i++) {
    g();
    if (buf[0] < limit) return buf[0] % max;
  }
  return buf[0] % max;
};

const tailDigits = (n) => {
  const out = [];
  for (let i = 0; i < n; i++) out.push(rnd(10));
  return out.join("");
};

/* 4 digit PIN, 3 digit CVV */
const pin4 = () => String(1000 + rnd(9000));
const cvv3 = () => String(100 + rnd(900));

/* An expiry 1 to 8 years out, always in the future, stored MMYY. There are only
   96 such values, so a repeat eventually happens; real cards behave the same
   way, which is why the number carries the identity and not the date. */
const futureExp = () => {
  const now = new Date();
  const y = now.getFullYear() + 1 + rnd(8);
  const m = 1 + rnd(12);
  return String(m).padStart(2, "0") + String(y).slice(-2);
};

/* Builds one card. The serial is what makes it unique; the tail is what makes
   it look random. The result is always 16 digits: BIN(6) + serial(6) +
   random(3) = 15 body digits, plus one Luhn check digit. */
function mintCard({ network, serial, holder, prefix }) {
  const bin = String(prefix || BIN[network] || BIN.visa);
  /* 15 digits before the check digit; a 4 digit BIN still fits by using a
     5 digit serial, which is what a real amex-style number does */
  const serialLen = 15 - bin.length - 3;
  const serialPart = String(serial % Math.pow(10, serialLen)).padStart(serialLen, "0");
  const body = (bin + serialPart + tailDigits(3)).slice(0, 15);
  return {
    cardNo: body + luhn(body),
    pin: pin4(),
    cvv: cvv3(),
    expiry: futureExp(),
    holderName: String(holder || "CARD HOLDER").toUpperCase().slice(0, 24)
  };
}

/**
 * Replaces the credentials on each line with a freshly minted card.
 * Called once per purchase, before the order is written.
 *
 * The serial is read and incremented in one transaction, so two customers
 * buying at the same moment cannot be handed the same number.
 *
 * A failure here is not fatal: the line keeps whatever the product already
 * carried, so an order is never lost because a serial could not be bumped.
 */
export async function issueCards(items, user) {
  /* Every card is issued as "CARD HOLDER", not the buyer's name. The card is
     the product, so the printed name is part of it and does not change with who
     happens to be logged in. The argument is kept so a future per-brand holder
     line can be threaded through without touching the callers again. */
  const holder = "CARD HOLDER";

  return Promise.all((items || []).map(async (item) => {
    if (!item?.id) return item;
    try {
      const minted = await runTransaction(db, async (tx) => {
        const ref = doc(db, COL.products, item.id);
        const snap = await tx.get(ref);
        if (!snap.exists()) return null;
        const p = snap.data() || {};
        const serial = Number(p.issued || 0) + 1;
        tx.update(ref, { issued: serial, updatedAt: serverTimestamp() });
        return mintCard({ network: p.network, serial, holder, prefix: p.bin });
      });
      return minted ? Object.assign({}, item, minted) : item;
    } catch (e) {
      console.warn("card issuing fell back to the product's stored card", e);
      return item;
    }
  }));
}


/* ============ ORDERS ============ */
export async function createOrder({ user, items, totals, address, payment = "cod", note = "" }) {
  const r = addDoc(collection(db, COL.orders), {
    orderNo: orderNo(),
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    userPhone: user.phone || "",
    /* The card credentials have to be written here. A prepaid card is the whole
       product, so an order that cannot show the number, PIN and CVV is an order
       the customer paid for and cannot use. They are stored per item, so a
       multi-item order hands over each card separately. */
    items: items.map((i) => ({
      id: i.id, name: i.name, price: i.price, mrp: i.mrp, qty: i.qty, image: i.image || "",
      cardNo: i.cardNo || "", expiry: i.expiry || "", pin: i.pin || "", cvv: i.cvv || "",
      holderName: i.holderName || "", value: Number(i.value || 0), brand: i.brand || "",
      network: i.network || "", instructions: i.instructions || ""
    })),
    itemCount: items.reduce((s, i) => s + i.qty, 0),
    subtotal: totals.sub,
    discount: totals.disc,
    delivery: totals.delivery,
    total: totals.total,
    coupon: address.coupon || "",
    address,
    note,
    payment,
    paymentStatus: payment === "cod" ? "unpaid" : "paid",
    status: "pending",
    createdAt: serverTimestamp()
  });

  await Promise.allSettled(
    items.map((i) => updateDoc(doc(db, COL.products, i.id), {
      stock: increment(-i.qty), sold: increment(i.qty), updatedAt: serverTimestamp()
    }))
  );
  return r;
}

const normOrder = (id, d) => ({ id, ...d, _date: d.createdAt?.toDate?.() || null });

/* ------------------------------------------------------------------
   Composite-index-safe querying.

   Firestore needs a composite index for any query that mixes a where()
   with an orderBy() on a different field. Until those indexes are
   deployed the whole query fails with "The query requires an index",
   which broke the dashboard, orders list, wallet history and deposits.

   So: try the fast indexed query first, and if Firestore reports a missing
   index, fall back to a single-field query and sort the results here. The
   page then always renders, and it gets faster once the indexes exist.
   ------------------------------------------------------------------ */
function needsIndex(e) {
  const c = e?.code || "";
  return c === "failed-precondition" || c === "unimplemented" ||
         /requires an index/i.test(e?.message || "");
}

function byDateDesc(a, b) {
  const av = a._date ? a._date.getTime() : (a.createdAt?.seconds || 0) * 1000;
  const bv = b._date ? b._date.getTime() : (b.createdAt?.seconds || 0) * 1000;
  return bv - av;
}

/* Builds the docs list, tolerating a missing composite index. */
export async function queryTolerant(buildIndexed, buildFallback, map) {
  try {
    return (await getDocs(buildIndexed())).docs.map((d) => map(d.id, d.data()));
  } catch (e) {
    if (!needsIndex(e)) throw e;
    console.warn("Firestore composite index missing — sorting on the client instead. " +
                 "Deploy firestore.indexes.json to remove this warning.");
    const rows = (await getDocs(buildFallback())).docs.map((d) => map(d.id, d.data()));
    return rows.sort(byDateDesc);
  }
}

export async function getUserOrders(uid_, limitN = 100) {
  return queryTolerant(
    () => query(collection(db, COL.orders), where("userId", "==", uid_),
                orderBy("createdAt", "desc"), limit(limitN)),
    () => query(collection(db, COL.orders), where("userId", "==", uid_), limit(limitN * 3)),
    normOrder
  );
}

export async function getOrders({ status = "", limitN = 200 } = {}) {
  if (!status) {
    return (await getDocs(query(collection(db, COL.orders),
      orderBy("createdAt", "desc"), limit(limitN)))).docs.map((d) => normOrder(d.id, d.data()));
  }
  return queryTolerant(
    () => query(collection(db, COL.orders), where("status", "==", status),
                orderBy("createdAt", "desc"), limit(limitN)),
    () => query(collection(db, COL.orders), where("status", "==", status), limit(limitN * 3)),
    normOrder
  );
}

export async function setOrderStatus(id, status) {
  await updateDoc(doc(db, COL.orders, id), { status, updatedAt: serverTimestamp() });
}

export async function setPaymentStatus(id, paymentStatus) {
  await updateDoc(doc(db, COL.orders, id), { paymentStatus, updatedAt: serverTimestamp() });
}

export async function deleteOrder(id) {
  await deleteDoc(doc(db, COL.orders, id));
}


/* ============ STATS ============ */
export async function getStats() {
  const [orders, products, users] = await Promise.all([
    getOrders({ limitN: 500 }),
    getProducts({ onlyActive: false, limitN: 500 }),
    getAllUsers()
  ]);

  const revenue = orders.filter((o) => o.status !== "cancelled").reduce((s, o) => s + Number(o.total || 0), 0);
  const pending = orders.filter((o) => o.status === "pending").length;
  const lowStock = products.filter((p) => p.stock > 0 && p.stock < 10).length;
  const outStock = products.filter((p) => p.stock <= 0).length;

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toDateString();
    const amt = orders
      .filter((o) => o._date && o._date.toDateString() === key && o.status !== "cancelled")
      .reduce((s, o) => s + Number(o.total || 0), 0);
    days.push({ label: d.toLocaleDateString("en-IN", { weekday: "short" }), value: amt });
  }

  return {
    revenue, orders: orders.length, users: users.length,
    products: products.length, pending, lowStock, outStock,
    avgOrder: orders.length ? Math.round(revenue / orders.length) : 0,
    chart: days,
    recent: orders.slice(0, 6),
    topProducts: [...products].sort((a, b) => (b.sold || 0) - (a.sold || 0)).slice(0, 5)
  };
}


/* ============ DEMO SEED (first run only) ============ */
/*  These 48 products are placeholders for you to practise with.
    To sell your own products: open Admin Panel > Products,
    delete all of these, then add your own.                      */
const img = (seed) => "https://picsum.photos/seed/" + encodeURIComponent(seed) + "/640/400";


/* =========================================================
   ORDER PAYMENT (card orders go through a QR + UTR step)
   ========================================================= */
export async function attachOrderPayment(id, { upiId, amount, gateway, minutes }) {
  await updateDoc(doc(db, COL.orders, id), {
    payment: gateway || "upi",
    payAmount: Number(amount),
    upiId: upiId || "",
    qrMinutes: Number(minutes || 10),
    payStatus: "awaiting",
    utr: "",
    createdAt2: serverTimestamp()
  });
}

export async function submitOrderUTR(id, utr) {
  await updateDoc(doc(db, COL.orders, id), {
    utr: String(utr).trim(),
    payStatus: "submitted",
    updatedAt: serverTimestamp()
  });
}

export async function approveOrderPayment(id) {
  await updateDoc(doc(db, COL.orders, id), { payStatus: "paid", paymentStatus: "paid", updatedAt: serverTimestamp() });
}

export async function rejectOrderPayment(id) {
  await updateDoc(doc(db, COL.orders, id), { payStatus: "failed", updatedAt: serverTimestamp() });
}
