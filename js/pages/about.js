import { $ } from "../core/app.js";

/* /about.js  (animated counters) */
import { $$ } from "../core/app.js";

document.addEventListener("DOMContentLoaded", () => {
  const nums = $$(".stat-v");
  if (!nums.length) return;

  const run = (n) => {
    const raw = n.textContent.trim();
    const m = raw.match(/^([\d.,]+)(.*)$/);
    if (!m) return;
    const target = parseFloat(m[1].replace(/,/g, ""));
    const suffix = m[2] || "";
    const dec = (m[1].split(".")[1] || "").length;
    let t0 = null;
    const step = (t) => {
      if (!t0) t0 = t;
      const p = Math.min(1, (t - t0) / 1300);
      const v = target * (1 - Math.pow(1 - p, 3));
      n.textContent = (dec ? v.toFixed(dec) : Math.round(v).toLocaleString("en-IN")) + suffix;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { run(e.target); io.unobserve(e.target); } });
  }, { threshold: 0.4 });

  nums.forEach((n) => io.observe(n));
});
