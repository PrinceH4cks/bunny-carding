import { rupees, uid, field } from "../core/app.js";
import { icon } from "../components/icons.js";
import { app } from "../core/firebase-config.js";
import { db, storage, COL } from "../core/firebase-config.js";
import { fmtExp } from "../components/card-visual.js";
import { COUPONS } from "./cart-service.js";

import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc,
  query, where, orderBy, limit, serverTimestamp, increment, runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref as sref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

/* ============ CATEGORIES ============ */
export const CATEGORIES = [
  { key: "prepaid",   label: "Prepaid",       icon: "credit-card" },
  { key: "gift",      label: "Gift cards",    icon: "gift"       },
  { key: "subscribe", label: "Subscriptions", icon: "play"       },
  { key: "gaming",    label: "Gaming credit", icon: "dumbbell"   },
  { key: "travel",    label: "Travel",        icon: "map-pin"    },
  { key: "shopping",  label: "Shopping",      icon: "cart"       },
  { key: "utility",   label: "Utility",       icon: "building"   },
  { key: "fuel",      label: "Fuel",          icon: "truck"      }
];

export const catLabel = (k) => CATEGORIES.find((c) => c.key === k)?.label || k;


/* ============ PRODUCTS ============ */
export async function getProducts({ category = "", search = "", sort = "shop", limitN = 60, onlyActive = true } = {}) {
  const where_ = onlyActive ? where("active", "!=", false) : null;
  const q = query(collection(db, COL.products), ...(where_ ? [where_] : []));
  const snap = await getDocs(q);

  let list = snap.docs.map((d) => normalizeProduct(d.id, d.data()));

  if (category && category !== "all") list = list.filter((p) => p.category === category);
  if (search) {
    const s = search.toLowerCase();
    list = list.filter((p) =>
      (p.name + " " + (p.brand || "") + " " + (p.category || "") + " " + (p.description || "")).toLowerCase().includes(s));
  }
  const sorters = {
    new:     (a, b) => ((b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)),
    cheap:   (a, b) => a.price - b.price,
    high:    (a, b) => b.price - a.price,
    popular: (a, b) => (b.sold || 0) - (a.sold || 0),
    rating:  (a, b) => (b.rating || 0) - (a.rating || 0),
    /* The order the owner set in the panel, for the default view. A card they
       have never moved has no rank and keeps the order it arrived in, so an
       untouched shop looks exactly as it did before. */
    shop:    (a, b) => {
      const ra = Number.isFinite(a.rank) ? a.rank : 1e6 + list.indexOf(a);
      const rb = Number.isFinite(b.rank) ? b.rank : 1e6 + list.indexOf(b);
      return ra - rb;
    }
  };
  list.sort(sorters[sort] || sorters.shop);
  return list.slice(0, limitN);
}

export function normalizeProduct(id, d) {
  return {
    id,
    name: d.name || "Untitled product",
    brand: d.brand || "",
    category: d.category || "other",
    price: Number(d.price || 0),
    mrp: Number(d.mrp || d.price || 0),
    stock: Number(d.stock || 0),
    discount: Number(d.discount || 0),
    image: d.image || "",
    gallery: Array.isArray(d.gallery) ? d.gallery : [],
    description: d.description || "",
    warranty: d.warranty || "",
    /* card / voucher fields */
    network: d.network || "other",
    cardNo: d.cardNo || "",
    expiry: d.expiry || "",
    pin: d.pin || "",
    cvv: d.cvv || "",
    nfc: d.nfc !== false,
    holderName: d.holderName || "",
    value: Number(d.value || 0),
    instructions: d.instructions || "",
    isCard: d.isCard !== false,
    benefits: Array.isArray(d.benefits) ? d.benefits
      : (d.benefits ? String(d.benefits).split("\n").filter(Boolean) : []),
  featured: !!d.featured,
  active: d.active !== false,
  /* the order the shop owner set in the panel. Null until they move a card. */
  rank: Number.isFinite(Number(d.rank)) ? Number(d.rank) : null,
    rating: Number(d.rating || 0),
    sold: Number(d.sold || 0),
    createdAt: d.createdAt || null,
    updatedAt: d.updatedAt || null
  };
}

export async function getProduct(id) {
  const s = await getDoc(doc(db, COL.products, id));
  return s.exists() ? normalizeProduct(s.id, s.data()) : null;
}

export async function upsertProduct(data, id = null) {
  const payload = {
    ...data,
    price: rupees(data.price),
    mrp: rupees(data.mrp || data.price),
    stock: Number(data.stock || 0),
    updatedAt: serverTimestamp()
  };
  if (id) {
    await updateDoc(doc(db, COL.products, id), payload);
    return id;
  }
  const r = await addDoc(collection(db, COL.products), {
    ...payload, discount: 0, featured: false, active: true, rating: 0, sold: 0,
    createdAt: serverTimestamp()
  });
  const disc = payload.mrp > payload.price
    ? Math.round(((payload.mrp - payload.price) / payload.mrp) * 100) : 0;
  await updateDoc(doc(db, COL.products, r.id), { discount: disc });
  return r.id;
}

export async function removeProduct(id) {
  await deleteDoc(doc(db, COL.products, id));
}

export async function setProductFlag(id, field, value) {
  await updateDoc(doc(db, COL.products, id), { [field]: value, updatedAt: serverTimestamp() });
}


/* ============ IMAGE UPLOAD ============ */
export async function uploadImage(file, folder = "products", maxMB = 3) {
  if (!file) throw new Error("Please choose a file.");
  if (!file.type.startsWith("image/")) throw new Error("Only image files (jpg, png, webp) are allowed.");
  if (file.size > maxMB * 1024 * 1024) throw new Error("The image must be smaller than " + maxMB + " MB.");
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const r = await uploadBytes(sref(storage, folder + "/" + uid() + "." + ext), file, { contentType: file.type });
  return getDownloadURL(r.ref);
}


/* =================================================================
   DEMO CARD CATALOGUE
   Gift cards / prepaid cards / subscriptions.
   These are placeholders for you to practise with. To sell your own:
   Admin Panel > Cards, delete these, then add your own.
   ================================================================= */

/* card number helper — deterministic so seeding is repeatable */
export const luhn = (d) => {
  let sum = 0, alt = true;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = Number(d[i]);
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n; alt = !alt;
  }
  return (10 - (sum % 10)) % 10;
};

/* A demo card number: a real-looking prefix for the network, then filler, then
   a Luhn check digit so the number actually validates if anyone types it into
   a card checker. The previous version filled the tail from a hash of the name,
   which could start with a zero and occasionally produced only 15 digits. */
const cardNo = (prefix, seed) => {
  const bin = String(prefix);
  let h = 0;
  for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) % 10000000000;
  /* a leading 6 is what real cards use, and it keeps the filler from looking
     like a zero-padded counter */
  const digits = "6" + String(h).padStart(10, "0").slice(0, 15 - bin.length);
  const body = (bin + digits).slice(0, 15);
  return body + luhn(body);
};

/* Expiry is stored as MMYY, which is the order every card face prints and the
   order fmtExp() reads. The old exp(y, m) produced YYMM, so exp(31, "04") was
   stored as "3104" and displayed as "31/04" - a month that does not exist.

   The year argument is the two-digit year the card is written with, not a
   distance from today. If that date has already passed, the year is rolled
   forward until it is in the future, so a card can never be seeded already
   expired without anyone having to edit the table every few years. */
const exp = (year, month) => {
  const now = new Date();
  const thisYear = now.getFullYear() % 100;
  let y = Number(String(year).slice(-2));
  if (!Number.isFinite(y) || y < 0 || y > 99) y = thisYear + 3;
  const m = Math.min(12, Math.max(1, Number(month) || 1));
  /* end of that month, so a card expiring this month still counts as valid */
  while (new Date(2000 + y, m, 0, 23, 59, 59) < now) y = (y + 1) % 100;
  return String(m).padStart(2, "0") + String(y).padStart(2, "0");
};

/* [ name, brand, category, network, price, value, stock, cardPrefix, expiry, features[] ] */
const DEMO = [
  // ---- prepaid ----
  ["Amazon Pay Prepaid Card",     "Amazon",     "prepaid",   "visa",       1499, 2000, 26, "412309", exp(29, "08"), ["Instant virtual card", "Works on every Amazon payment", "No annual fee", "Can be used 50 times"]],
  ["Google Play Prepaid Card",    "Google",     "prepaid",   "mastercard",  999, 1200, 42, "531092", exp(30, "03"), ["Google Play balance", "Redeem on any Android app", "Region free", "Instant delivery"]],
  ["Amazon Pay Prepaid - Small",  "Amazon",     "prepaid",   "visa",        799, 1000, 55, "412377", exp(29, "11"), ["1000 gift value", "Best for first-time use", "No expiry lock", "Refundable if unused"]],
  ["Paytm Prepaid Card",          "Paytm",      "prepaid",   "mastercard",  599,  750, 61, "552134", exp(29, "05"), ["Paytm balance", "UPI accepted", "Cashback offers", "Can be recharged"]],
  ["Flipkart Gift Card",          "Flipkart",   "prepaid",   "visa",        999, 1200, 48, "418862", exp(30, "01"), ["1200 store value", "All categories", "One time use", "Instant code"]],
  ["Myntra Gift Card",            "Myntra",     "prepaid",   "visa",        1499, 2000, 30, "415203", exp(29, "09"), ["2000 fashion value", "All brands", "No expiry within a year", "Secure delivery"]],

  // ---- gift ----
  ["Amazon Gift Card 5000",       "Amazon",     "gift",      "visa",        4999, 5000, 14, "419244", exp(30, "06"), ["5000 gift value", "Any Amazon product", "Never expires", "Delivered by email"]],
  ["Flipkart Gift Card 2500",     "Flipkart",   "gift",      "visa",        2499, 2500, 18, "418901", exp(30, "02"), ["2500 store value", "Fashion and electronics", "Instant code", "Can be scheduled"]],
  ["Zomato Gift Card",            "Zomato",     "gift",      "mastercard",   499,  600, 40, "557712", exp(29, "12"), ["Food delivery credit", "Works in 40+ cities", "No expiry", "Personalised gift"]],
  ["Nykaa Beauty Gift Card",      "Nykaa",      "gift",      "visa",         999, 1200, 33, "413388", exp(29, "10"), ["Beauty and skincare", "All brands", "Easy to share", "No hidden terms"]],
  ["BookMyShow Movie Pass",       "BookMyShow", "gift",      "mastercard",   799, 1000, 36, "554120", exp(29, "07"), ["1000 movie credit", "All cinemas", "No booking fee", "Valid in every city"]],
  ["Steam Wallet Code",           "Steam",      "gift",      "visa",        1999, 2500, 22, "417765", exp(30, "04"), ["2500 wallet balance", "Global region", "Instant code", "No account linking"]],

  // ---- subscriptions ----
  ["Netflix Premium 1 Month",     "Netflix",    "subscribe", "visa",         299,  649, 70, "415588", exp(30, "07"), ["Premium 4K + mobile plan", "All devices", "1 month", "New profile optional"]],
  ["Spotify Premium 3 Months",    "Spotify",    "subscribe", "mastercard",   449,  749, 64, "552210", exp(30, "02"), ["Ad-free listening", "Offline mode", "3 months", "High quality audio"]],
  ["YouTube Premium 6 Months",    "YouTube",    "subscribe", "visa",         799, 1200, 46, "416332", exp(30, "05"), ["Ad-free and background play", "YouTube Music", "6 months", "Family sharing ready"]],
  ["Disney+ Hotstar Annual",      "Hotstar",    "subscribe", "mastercard",  1499, 1999, 28, "551907", exp(31, "01"), ["All Hotstar content", "Live TV and movies", "1 year", "1080p streaming"]],
  ["Amazon Prime Monthly",        "Amazon",     "subscribe", "visa",         249,  399, 58, "417011", exp(30, "08"), ["Prime video and music", "One month", "Same day delivery", "Cancel anytime"]],
  ["Canva Pro 1 Year",            "Canva",      "subscribe", "mastercard",  1299, 2200, 20, "553418", exp(31, "03"), ["All premium templates", "Cloud storage", "1 year", "Team ready"]],

  // ---- gaming ----
  ["Game Credits 1000",           "GameTop",    "gaming",    "mastercard",   899, 1000, 44, "554219", exp(30, "09"), ["1000 in-game credit", "Instant top-up", "No region lock", "Works on all supported titles"]],
  ["Battle Pass Season Pass",     "Arena",      "gaming",    "visa",         699,  950, 52, "418330", exp(30, "06"), ["Full season access", "All rewards included", "Tier 1 to 50", "Instant activation"]],
  ["Mobile Game Voucher 500",     "PlayZone",   "gaming",    "mastercard",   449,  550, 60, "556710", exp(30, "10"), ["500 voucher value", "Works on mobile games", "Instant delivery", "Redeem code"]],

  // ---- travel ----
  ["MakeMyTrip Gift Card 5000",   "MakeMyTrip", "travel",    "visa",        4999, 5000, 12, "419001", exp(31, "02"), ["5000 travel value", "Flights and hotels", "No expiry", "Partial refund allowed"]],
  ["IRCTC Travel Voucher 2000",   "IRCTC",      "travel",    "netbanking",  1999, 2000, 24, "400118", exp(30, "12"), ["2000 rail credit", "All classes", "Valid on every train", "Refund policy applies"]],
  ["Ola Wallet Top-up 1000",      "Ola",        "travel",    "visa",         899, 1000, 38, "415622", exp(30, "11"), ["1000 ride credit", "No expiry", "Works in every city", "Instant credit"]],

  // ---- shopping / utility ----
  ["BigBasket Grocery Card",      "BigBasket",  "shopping",  "mastercard",   999, 1200, 30, "552877", exp(30, "07"), ["1200 grocery value", "All essentials", "Home delivery", "Fresh produce included"]],
  ["Tata Power Bill Payment",     "Tata Power", "utility",   "netbanking",   999, 1000, 34, "402266", exp(30, "04"), ["1000 bill payment", "Any consumer number", "Instant confirmation", "No late fee risk"]],
  ["Airtel Prepaid Recharge",     "Airtel",     "utility",   "visa",         299,  300, 90, "418290", exp(30, "12"), ["300 talk-time credit", "All plans", "Instant recharge", "No expiry lock"]],
  ["Jio Prepaid Recharge 599",    "Jio",        "utility",   "mastercard",   599,  599, 75, "550144", exp(31, "04"), ["Full plan value", "Unlimited calls", "Data included", "Instant activation"]],
  ["Fuel Voucher 2000",           "IndianOil",  "fuel",      "visa",        1999, 2000, 26, "416553", exp(30, "05"), ["2000 fuel credit", "All partner outlets", "No expiry", "Partial redemption allowed"]]
];





/* =========================================================
   COUPONS
   Deliberately not editable from a product row: a coupon only ever changes the
   discount shown at checkout, never the price of the product itself.
   ========================================================= */
export async function getCoupons() {
  try {
    const snap = await getDocs(collection(db, COL.coupons));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    return [];
  }
}

export async function saveCoupon(data, id) {
  const code = (data.code || "").trim().toUpperCase();
  if (!code) throw new Error("Coupon code is required.");
  const body = {
    code,
    kind: data.kind === "flat" ? "flat" : "percent",
    value: Math.max(0, Number(data.value) || 0),
    minOrder: Math.max(0, Number(data.minOrder) || 0),
    maxUses: Math.max(0, Number(data.maxUses) || 0),
    perUser: Math.max(1, Number(data.perUser) || 1),
    used: Number(data.used) || 0,
    active: data.active !== false,
    startsAt: data.startsAt || null,
    endsAt: data.endsAt || null
  };
  if (id) await setDoc(doc(db, COL.coupons, id), { ...body, updatedAt: serverTimestamp() }, { merge: true });
  else await addDoc(collection(db, COL.coupons), { ...body, createdAt: serverTimestamp() });
}

export async function removeCoupon(id) {
  await deleteDoc(doc(db, COL.coupons, id));
}

export async function findCoupon(code) {
  const want = (code || "").trim().toUpperCase();
  if (!want) return null;
  const all = await getCoupons();
  const hit = all.find((c) => c.code === want);
  if (!hit || hit.active === false) return null;
  const now = Date.now();
  const t = (v) => (v && typeof v.toDate === "function" ? v.toDate().getTime() : v ? new Date(v).getTime() : null);
  if (t(hit.startsAt) && now < t(hit.startsAt)) return null;
  if (t(hit.endsAt) && now > t(hit.endsAt)) return null;
  if (hit.maxUses > 0 && (hit.used || 0) >= hit.maxUses) return null;
  return hit;
}


/* A wallet purchase is fulfilled the moment it is paid for, so there is no
   pending window to sit in. Kept here rather than in the page so the write
   reuses the imports db.js already has instead of pulling the SDK in again. */
export async function markOrderDelivered(id, paid = true) {
  await updateDoc(doc(db, COL.orders, id), {
    status: "delivered",
    ...(paid ? { paymentStatus: "paid", payStatus: "paid", paidAt: serverTimestamp() } : {}),
    updatedAt: serverTimestamp()
  });
}
