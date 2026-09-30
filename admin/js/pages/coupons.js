import { rupees, field } from "../core/app.js";
import { auth } from "../core/firebase-config.js";
import { db } from "../core/db.js";

/* =========================================================
   /coupons.js
   Discount code management.

   A coupon is kept strictly separate from product pricing on purpose: it only
   ever changes the discount line at checkout, so a code can never change what a
   product costs or what an order was actually placed for.
   ========================================================= */

import { $, esc, inr } from "../core/app.js";
import { toast } from "../components/toast.js";
import { emptyState, skRows } from "../components/ui.js";
import { confirmBox } from "../components/modal.js";
import { getCoupons, saveCoupon, removeCoupon } from "../services/product-service.js";
import { requireAdmin } from "../core/auth.js";
import { icon } from "../components/icons.js";

let list = [];
let editId = null;

const ts = (v) => (v && typeof v.toDate === "function" ? v.toDate() : v ? new Date(v) : null);
const day = (d) => (d ? d.toISOString().slice(0, 10) : "");

function state(c) {
  if (c.active === false) return { key: "off", label: "Paused" };
  const now = Date.now();
  const s = ts(c.startsAt), e = ts(c.endsAt);
  if (s && now < s.getTime()) return { key: "soon", label: "Scheduled" };
  if (e && now > e.getTime()) return { key: "over", label: "Expired" };
  if (c.maxUses > 0 && (c.used || 0) >= c.maxUses) return { key: "over", label: "Used up" };
  return { key: "live", label: "Live" };
}

function paintStats() {
  const now = Date.now();
  let live = 0, soon = 0, over = 0;
  list.forEach((c) => {
    const s = state(c);
    if (s.key === "live") live++;
    else if (s.key === "soon") soon++;
    else if (s.key === "over") over++;
  });
  $("#kTotal").textContent = list.length;
  $("#kLive").textContent = live;
  $("#kSoon").textContent = soon;
  $("#kOver").textContent = over;
}

function paint() {
  paintStats();
  if (!list.length) {
    $("#list").innerHTML = emptyState({
      icon: "ticket",
      title: "No coupons yet",
      text: "Create one on the right and it becomes available in the cart and at checkout."
    });
    return;
  }

  $("#list").innerHTML = list.map((c) => {
    const s = state(c);
    const badge = s.key === "live" ? "badge-ok" : s.key === "soon" ? "badge-info" : s.key === "over" ? "badge-warn" : "badge-dark";
    const off = c.kind === "flat" ? inr(c.value) : Math.min(100, Number(c.value) || 0) + "% off";
    const uses = c.maxUses > 0 ? (c.used || 0) + " / " + c.maxUses : (c.used || 0) + " used";
    return '<div class="card card-pad mb-2">' +
      '<div class="flex between center gap-2 wrap">' +
        '<div style="min-width:0">' +
          '<b style="font-family:var(--ff-mono);font-size:1.05rem">' + esc(c.code) + "</b>" +
          '<div class="fs-xs text-muted">' + esc(off) + (c.minOrder > 0 ? " on orders above " + esc(inr(c.minOrder)) : " &middot; no minimum") + "</div>" +
        "</div>" +
        '<div class="flex gap-1 center" style="flex:0 0 auto">' +
          '<span class="badge ' + badge + '">' + s.label + "</span>" +
          '<button class="btn btn-ghost btn-xs" data-edit="' + esc(c.id) + '">Edit</button>' +
          '<button class="btn btn-ghost btn-xs" data-del="' + esc(c.id) + '">Delete</button>' +
        "</div>" +
      "</div>" +
      '<div class="fs-xs text-muted mt-2">' +
        esc(uses) + " &middot; " + c.perUser + " per customer" +
        (ts(c.startsAt) ? " &middot; from " + esc(day(ts(c.startsAt))) : "") +
        (ts(c.endsAt) ? " &middot; until " + esc(day(ts(c.endsAt))) : "") +
      "</div>" +
    "</div>";
  }).join("");
}

function reset() {
  editId = null;
  $("#formTitle").textContent = "New coupon";
  $("#cCode").value = ""; $("#cValue").value = ""; $("#cMin").value = "0";
  $("#cPer").value = "1"; $("#cMax").value = "0";
  $("#cStart").value = ""; $("#cEnd").value = "";
  $("#cKind").value = "percent"; $("#cOn").checked = true;
  $("#kindHint").textContent = "Percent off (max 100)";
  $("#cCancel").classList.add("hidden");
}

async function load() {
  $("#list").innerHTML = skRows(3, 4);
  list = (await getCoupons()).sort((a, b) => String(a.code).localeCompare(String(b.code)));
  paint();
}

document.addEventListener("DOMContentLoaded", async () => {
await requireAdmin();

  $("#reloadBtn").addEventListener("click", load);
  $("#cCancel").addEventListener("click", reset);

  $("#cKind").addEventListener("change", (e) => {
    $("#kindHint").textContent = e.target.value === "flat" ? "Amount taken off in rupees" : "Percent off (max 100)";
  });

  /* keep the code field uppercase as it is typed, so what you see is what saves */
  $("#cCode").addEventListener("input", (e) => {
    e.target.value = e.target.value.toUpperCase().replace(/\s+/g, "");
  });

  $("#cSave").addEventListener("click", async () => {
    const kind = $("#cKind").value;
    const value = Number($("#cValue").value) || 0;
    if (kind === "percent" && value > 100) return toast("A percentage discount cannot be above 100.", "err");

    const data = {
      code: $("#cCode").value.trim(),
      kind, value,
      minOrder: Number($("#cMin").value) || 0,
      perUser: Number($("#cPer").value) || 1,
      maxUses: Number($("#cMax").value) || 0,
      startsAt: $("#cStart").value || null,
      endsAt: $("#cEnd").value || null,
      active: $("#cOn").checked
    };
    if (!data.code) return toast("Coupon code is required.", "err");
    if (value <= 0) return toast("Enter a discount value above zero.", "err");

    try {
      await saveCoupon(data, editId);
      toast(editId ? "Coupon updated." : "Coupon created.", "ok");
      reset();
      await load();
    } catch (e) {
      toast("Could not save: " + (e.message || e), "err");
    }
  });

  $("#list").addEventListener("click", async (e) => {
    const ed = e.target.closest("[data-edit]");
    const dl = e.target.closest("[data-del]");
    if (!ed && !dl) return;
    const id = (ed || dl).dataset.edit || (ed || dl).dataset.del;
    const c = list.find((x) => x.id === id);
    if (!c) return;

    if (ed) {
      editId = c.id;
      $("#formTitle").textContent = "Edit " + c.code;
      $("#cCode").value = c.code || "";
      $("#cKind").value = c.kind === "flat" ? "flat" : "percent";
      $("#cValue").value = c.value ?? "";
      $("#cMin").value = c.minOrder ?? 0;
      $("#cPer").value = c.perUser ?? 1;
      $("#cMax").value = c.maxUses ?? 0;
      $("#cStart").value = day(ts(c.startsAt));
      $("#cEnd").value = day(ts(c.endsAt));
      $("#cOn").checked = c.active !== false;
      $("#kindHint").textContent = c.kind === "flat" ? "Amount taken off in rupees" : "Percent off (max 100)";
      $("#cCancel").classList.remove("hidden");
      $("#cCode").focus();
      return;
    }

    const go = await confirmBox({
      title: "Delete this coupon?",
      text: c.code + " will stop working immediately. Orders that already used it are unaffected.",
      ok: "Delete", danger: true
    });
    if (!go) return;
    try {
      await removeCoupon(id);
      if (editId === id) reset();
      toast("Coupon deleted.", "ok");
      await load();
    } catch (err) {
      toast("Could not delete: " + (err.message || err), "err");
    }
  });

  await load();
});
