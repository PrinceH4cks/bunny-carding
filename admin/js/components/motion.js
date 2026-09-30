/* =========================================================
   PANEL - js/motion.js
   Premium motion layer: preloader, aurora, cursor spotlight,
   split text, scroll reveal, 3D tilt, magnetic buttons.
   ========================================================= */

const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const touch  = window.matchMedia("(hover: none)").matches;
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* =========================================================
   1. PRELOADER + PAGE ENTER
   ========================================================= */
function preloader() {
  if (reduce) { document.documentElement.classList.add("ready"); return; }
  const b = el("div", "preload",
    '<span class="preload-mark">' +
      '<svg class="ic ic-lg" aria-hidden="true"><use href="#i-store"></use></svg>' +
    "</span>" +
    '<span class="preload-bar"><i></i></span>');
  document.body.appendChild(b);
  document.documentElement.classList.add("loading");

  const kill = () => {
    b.classList.add("done");
    document.documentElement.classList.remove("loading");
    setTimeout(() => b.remove(), 700);
    setTimeout(() => document.documentElement.classList.add("ready"), 120);
  };
  window.addEventListener("load", () => setTimeout(kill, 420));
  setTimeout(kill, 2600);            // hard limit
}

function el(tag, cls, html) {
  const n = document.createElement(tag);
  n.className = cls;
  if (html) n.innerHTML = html;
  return n;
}

/* =========================================================
   2. AMBIENT AURORA
   ========================================================= */
function aurora() {
  if (reduce || $(".bg-orbs")) return;
  if (document.body.dataset.ambient === "off") return;

  const box = el("div", "bg-orbs");
  box.setAttribute("aria-hidden", "true");
  box.innerHTML = "<i></i><i></i><i></i><i></i>";
  document.body.prepend(box);

  const grid = el("div", "bg-grid");
  grid.setAttribute("aria-hidden", "true");
  document.body.prepend(grid);

  const dots = [...box.children];
  const state = dots.map(() => ({
    x: (Math.random() - .5) * 100,
    y: (Math.random() - .5) * 80,
    s: .45 + Math.random() * .7,
    d: Math.random() * 6.3
  }));
  let t = 0, mx = 0, my = 0;

  addEventListener("pointermove", (e) => {
    mx = (e.clientX / innerWidth - .5) * 30;
    my = (e.clientY / innerHeight - .5) * 30;
  }, { passive: true });

  (function loop() {
    t += .0055;
    dots.forEach((d, i) => {
      const s = state[i];
      d.style.transform =
        "translate3d(" + (s.x + Math.sin(t * s.s + s.d) * 30 + mx) + "px," +
        (s.y + Math.cos(t * s.s * .85 + s.d) * 26 + my) + "px,0) " +
        "scale(" + (1 + Math.sin(t * .9 + s.d) * .1) + ")";
    });
    requestAnimationFrame(loop);
  })();
}

/* =========================================================
   3. CURSOR SPOTLIGHT
   ========================================================= */
function spotlight() {
  if (reduce || touch) return;
  const s = el("div", "cursor-glow");
  s.setAttribute("aria-hidden", "true");
  document.body.appendChild(s);

  let x = innerWidth / 2, y = innerHeight / 2, cx = x, cy = y;
  addEventListener("pointermove", (e) => { x = e.clientX; y = e.clientY; }, { passive: true });

  (function loop() {
    cx += (x - cx) * .12;
    cy += (y - cy) * .12;
    s.style.transform = "translate3d(" + cx + "px," + cy + "px,0) translate(-50%,-50%)";
    requestAnimationFrame(loop);
  })();

  /* grow on interactive elements */
  document.addEventListener("pointerover", (e) => {
    if (e.target.closest("a,button,.card,.product,.ctile,input,select,textarea")) s.classList.add("on");
  });
  document.addEventListener("pointerout", (e) => {
    if (e.target.closest("a,button,.card,.product,.ctile,input,select,textarea")) s.classList.remove("on");
  });
}

/* =========================================================
   4. SPLIT-TEXT HERO REVEAL
   ========================================================= */
function splitText() {
  if (reduce) return;
  $$("[data-split]").forEach((node) => {
    const words = node.textContent.trim().split(/\s+/);
    node.innerHTML = words
      .map((w, i) => '<span class="word" style="--i:' + i + '">' + w + "</span>")
      .join(" ");
    node.classList.add("is-split");
  });
}

/* =========================================================
   5. REVEAL ON SCROLL (staggered)
   ========================================================= */
function reveal() {
  const sel = ".section-head, .card-pad, .product, .ctile, .trust-item, .stat, .card-head, .quote, " +
              ".wallet-hero, .wallet-hero > *, .reveal-item, .hero-grid > *, .section > .container > .grid > *";
  const targets = $$(sel).filter((e) => !e.closest(".modal-back") && !e.closest(".no-anim"));
  targets.forEach((elx) => {
    elx.classList.add("reveal");
    const d = [...elx.parentElement.children].indexOf(elx) % 6;
    if (d) elx.classList.add("reveal-d" + d);
  });

  const io = new IntersectionObserver((es) => {
    es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
  }, { threshold: .06, rootMargin: "0px 0px -50px 0px" });
  targets.forEach((e) => io.observe(e));
}

/* =========================================================
   6. 3D TILT WITH GLARE
   ========================================================= */
function tilt() {
  if (reduce || touch) return;
  $$(".product, .ctile, .card-hover, .trust-item").forEach((c) => {
    c.style.setProperty("--rx", "0deg");
    c.style.setProperty("--ry", "0deg");

    c.addEventListener("pointermove", (e) => {
      const r = c.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - .5;
      const py = (e.clientY - r.top) / r.height - .5;
      c.style.setProperty("--ry", (px * 7).toFixed(2) + "deg");
      c.style.setProperty("--rx", (py * -6).toFixed(2) + "deg");
      c.style.setProperty("--gx", ((px + .5) * 100).toFixed(1) + "%");
      c.style.setProperty("--gy", ((py + .5) * 100).toFixed(1) + "%");
    });

    c.addEventListener("pointerleave", () => {
      c.style.setProperty("--ry", "0deg");
      c.style.setProperty("--rx", "0deg");
    });
  });
}

/* =========================================================
   7. MAGNETIC BUTTONS
   ========================================================= */
function magnetic() {
  if (reduce || touch) return;
  $$(".btn-primary, .btn-accent, .btn-ok, .btn-white, .brand-mark").forEach((b) => {
    b.addEventListener("pointermove", (e) => {
      const r = b.getBoundingClientRect();
      const x = (e.clientX - r.left - r.width / 2) * .18;
      const y = (e.clientY - r.top - r.height / 2) * .3;
      b.style.transform = "translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px)";
    });
    b.addEventListener("pointerleave", () => { b.style.transform = ""; });
  });
}

/* =========================================================
   8. SCROLL PROGRESS + HEADER STATE
   ========================================================= */
function scrollBits() {
  const h = $(".site-header");
  if (h) {
    const on = () => h.classList.toggle("scrolled", scrollY > 10);
    on();
    addEventListener("scroll", on, { passive: true });
  }

  if (reduce) return;
  const bar = el("div", "scroll-progress");
  bar.setAttribute("aria-hidden", "true");
  document.body.appendChild(bar);
  const paint = () => {
    const h2 = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = "scaleX(" + (h2 > 0 ? scrollY / h2 : 0) + ")";
  };
  paint();
  addEventListener("scroll", paint, { passive: true });
}

/* =========================================================
   9. COUNT-UP
   ========================================================= */
function counters() {
  const nums = $$(".stat-v, .hero-stats b, .price, .wallet-balance");
  if (!nums.length || reduce) return;

  const run = (n) => {
    const raw = n.dataset.raw || (n.dataset.raw = n.textContent.trim());
    const m = raw.match(/^([^0-9]*)([\d.,]+)(.*)$/);
    if (!m) return;
    const pre = m[1], num = parseFloat(m[2].replace(/,/g, "")), post = m[3];
    const dec = (m[2].split(".")[1] || "").length;
    const rupee = /\u20B9/.test(raw);
    let t0 = null;
    const step = (t) => {
      if (!t0) t0 = t;
      const p = Math.min(1, (t - t0) / 1200);
      const v = num * (1 - Math.pow(1 - p, 3));
      const body = dec ? v.toFixed(dec) : Math.round(v).toLocaleString("en-IN");
      n.textContent = pre + (rupee ? "\u20B9" + body : body) + post;
      /* dataset.raw is re-read here on purpose: if site content arrived while this
           count-up was still running, the admin's value is what should be left
           on screen, not the string we captured before it started. */
        if (p < 1) requestAnimationFrame(step); else n.textContent = n.dataset.raw || raw;
    };
    requestAnimationFrame(step);
  };

  const io = new IntersectionObserver((es) => {
    es.forEach((e) => { if (e.isIntersecting) { run(e.target); io.unobserve(e.target); } });
  }, { threshold: .3 });
  nums.forEach((n) => io.observe(n));
}

/* =========================================================
   10. MARQUEE TICKER
   ========================================================= */
function marquee() {
  if (reduce) return;
  $$("[data-marquee]").forEach((box) => {
    if (box.dataset.ready) return;
    box.dataset.ready = "1";
    box.innerHTML = '<div class="mq-track">' +
      box.innerHTML + box.innerHTML +
      "</div>";
  });
}

/* =========================================================
   BOOT
   ========================================================= */
function boot() {
  preloader();
  aurora();
  spotlight();
  splitText();
  scrollBits();
  reveal();
  magnetic();
  tilt();
  counters();
  marquee();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
