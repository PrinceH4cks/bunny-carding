import { CATEGORIES, catLabel, getProducts, normalizeProduct, getProduct, upsertProduct, removeProduct, setProductFlag, uploadImage, getCoupons, saveCoupon, removeCoupon, findCoupon, markOrderDelivered } from "../services/product-service.js";
import { issueCards, createOrder, getUserOrders, getOrders, setOrderStatus, setPaymentStatus, deleteOrder, getStats, attachOrderPayment, submitOrderUTR, approveOrderPayment, rejectOrderPayment } from "../services/order-service.js";
import { getAllUsers, getUserDoc, toggleUserActive, createDeposit, submitDepositUTR, markDepositPaid, getUserDeposits, getDeposits, approveDeposit, rejectDeposit, DEFAULT_SITE, getSiteContent, saveSiteContent } from "../services/user-service.js";
import { getWallet, creditWallet, debitWallet, getWalletTxns } from "../services/wallet-service.js";
import { DEFAULT_METHODS, DEFAULT_PAYMENT, getPaymentSettings, savePaymentSettings, enabledMethods } from "../services/payment-service.js";
import { getReviews, saveReview, removeReview, getFaqs, saveFaq, removeFaq, getMessages, setMessageRead, setAllMessagesRead, removeMessage } from "../services/content-service.js";

/* The Firestore and Storage clients, re-exported from one place so a
   service imports its tools from here rather than from three libraries.
   The services are handed on as well, so a dynamic load that did not say
   which name it wanted still lands somewhere that has it. */
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc,
  query, where, orderBy, limit, serverTimestamp, increment, runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref as sref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { db, storage, COL } from "./db.js";
import { uid, orderNo, rupees } from "./app.js";
export { db, storage, COL } from "./firebase-config.js";
export { CATEGORIES, catLabel, getProducts, normalizeProduct, getProduct, upsertProduct, removeProduct, setProductFlag, uploadImage, getCoupons, saveCoupon, removeCoupon, findCoupon, markOrderDelivered } from "../services/product-service.js";
export { issueCards, createOrder, getUserOrders, getOrders, setOrderStatus, setPaymentStatus, deleteOrder, getStats, attachOrderPayment, submitOrderUTR, approveOrderPayment, rejectOrderPayment } from "../services/order-service.js";
export { getAllUsers, getUserDoc, toggleUserActive, createDeposit, submitDepositUTR, markDepositPaid, getUserDeposits, getDeposits, approveDeposit, rejectDeposit, DEFAULT_SITE, getSiteContent, saveSiteContent } from "../services/user-service.js";
export { getWallet, creditWallet, debitWallet, getWalletTxns } from "../services/wallet-service.js";
export { DEFAULT_METHODS, DEFAULT_PAYMENT, getPaymentSettings, savePaymentSettings, enabledMethods } from "../services/payment-service.js";
export { getReviews, saveReview, removeReview, getFaqs, saveFaq, removeFaq, getMessages, setMessageRead, setAllMessagesRead, removeMessage } from "../services/content-service.js";
