import { $ } from "../core/app.js";
import { toast } from "./toast.js";
import { logout } from "../core/auth.js";

/* =========================================================
   /icons.js
   SVG icon sprite (no emoji anywhere in this project)
   Har icon: 24x24, stroke-based, currentColor
   Use:  <svg class="ic"><use href="#i-cart"></use></svg>
   ========================================================= */

const ICONS = {
  /* ---- brand / nav ---- */
  /* The four-colour mark, drawn as four filled shapes rather than as a picture,
     so it holds its shape at any size and costs nothing to load. It is the one
     mark in the set that is not stroke-based, and that is on purpose: this is
     Google's own logo and it is recognised by those exact four colours. */
  google: '<path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.6h3.2c1.9-1.7 3-4.3 3-7.5Z"/>' +
    '<path fill="#34A853" d="M12 22c2.7 0 4.9-.9 6.6-2.4l-3.2-2.6c-.9.6-2 1-3.4 1-2.6 0-4.8-1.7-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Z"/>' +
    '<path fill="#FBBC05" d="M6.4 13.9a6 6 0 0 1 0-3.8V7.5H3.1a10 10 0 0 0 0 9l3.3-2.6Z"/>' +
    '<path fill="#EA4335" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.8-2.8A9.6 9.6 0 0 0 3.1 7.5l3.3 2.6C7.2 7.6 9.4 5.9 12 5.9Z"/>',
  store:  '<path d="M3 9.5 4.5 4h15L21 9.5"/><path d="M3 9.5h18"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-5h4v5"/>',
  cart:   '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.6 12.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L21 8H6"/>',
  box:    '<path d="M21 8.5 12 3 3 8.5v7L12 21l9-5.5v-7Z"/><path d="M3 8.5 12 14l9-5.5"/><path d="M12 14v7"/>',
  home:   '<path d="m3.5 10.5 8.5-7 8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5.5h4V20"/>',
  grid:   '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  menu:   '<path d="M3.5 7h17M3.5 12h17M3.5 17h17"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6M18.7 18.7l-1.6-1.6M6.9 6.9 5.3 5.3"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  logout: '<path d="M14 4.5h4A1.5 1.5 0 0 1 19.5 6v12a1.5 1.5 0 0 1-1.5 1.5h-4"/><path d="M10 8.5 6 12l4 3.5"/><path d="M6 12h9"/>',
  external: '<path d="M14 4h6v6"/><path d="m20 4-8.5 8.5"/><path d="M18 14.5V19a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 19V8a1.5 1.5 0 0 1 1.5-1.5H10"/>',

/* ---- messaging apps ----
   Real brand marks, not a phone and an envelope standing in for them. They are
   the only two filled glyphs in this file: everything else here is a stroked
   line icon, and a filled shape drawn with fill="none" disappears. Setting the
   fill on the path itself keeps the two styles from needing separate rules. */
whatsapp:  '<path fill="currentColor" stroke="none" d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 1.67c2.2 0 4.28.86 5.83 2.42a8.2 8.2 0 0 1 2.42 5.82c0 4.54-3.7 8.24-8.25 8.24a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.17 8.17 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24Zm-2.19 4.4c-.17-.4-.35-.4-.51-.41h-.44c-.15 0-.4.06-.6.28-.21.22-.8.78-.8 1.9s.81 2.2.93 2.35c.11.15 1.6 2.44 3.87 3.42.54.23.96.37 1.29.48.54.17 1.04.15 1.43.09.43-.06 1.33-.54 1.52-1.07.19-.52.19-.97.13-1.06-.05-.1-.2-.15-.42-.26Z"/>',
telegram: '<path fill="currentColor" stroke="none" d="M21.9 4.3 3.4 11.7c-1.1.4-1.1 1.9 0 2.3l4.5 1.4 1.7 5.2c.3.9 1.4 1.1 2 .3l2.4-2.6 4.5 3.3c.8.6 1.9.1 2.1-.8l3-15.3c.2-1-.8-1.9-1.7-1.5Z"/>',  /* ---- direction ---- */
  'arrow-left':  '<path d="M20 12H5"/><path d="m11 6-6 6 6 6"/>',
  'arrow-right': '<path d="M4 12h15"/><path d="m13 6 6 6-6 6"/>',
  'chevron-down':'<path d="m6 9 6 6 6-6"/>',
  'chevron-up':  '<path d="m6 15 6-6 6 6"/>',
  'trending-down':'<path d="M3 7l7 7 3.5-3.5L21 18"/><path d="M15 18h6v-6"/>',
  'trending-up': '<path d="M3 17l7-7 3.5 3.5L21 6"/><path d="M15 6h6v6"/>',
  refresh: '<path d="M20 11.5A8 8 0 0 0 6.2 6.3L3.5 9"/><path d="M4 12.5a8 8 0 0 0 13.8 5.2l2.7-2.7"/><path d="M3.5 4.5V9H8"/><path d="M20.5 19.5V15H16"/>',
  repeat:  '<path d="M17 3.5 20.5 7 17 10.5"/><path d="M3.5 12V9.5A2.5 2.5 0 0 1 6 7h14.5"/><path d="M7 20.5 3.5 17 7 13.5"/><path d="M20.5 12v2.5A2.5 2.5 0 0 1 18 17H3.5"/>',
  history: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3.5 4.5V9H8"/><path d="M12 7.5V12l3 1.8"/>',
  hourglass: '<path d="M7 3h10M7 21h10"/><path d="M8 3v3.5a4 4 0 0 0 8 0V3"/><path d="M8 21v-3.5a4 4 0 0 1 8 0V21"/>',

  /* ---- status ---- */
  check:  '<path d="m4.5 12.5 5 5 10-11"/>',
  x:      '<path d="m6 6 12 12M18 6 6 18"/>',
  plus:   '<path d="M12 5v14M5 12h14"/>',
  minus:  '<path d="M5 12h14"/>',
  info:   '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><path d="M12 7.8h.01"/>',
  alert:  '<path d="M12 3.5 21.5 20h-19L12 3.5Z"/><path d="M12 10v4"/><path d="M12 17.4h.01"/>',
  ban:    '<circle cx="12" cy="12" r="8.5"/><path d="m6 6 12 12"/>',
  'plus-circle': '<circle cx="12" cy="12" r="8.5"/><path d="M12 8.5v7M8.5 12h7"/>',
  verified: '<path d="m12 2.5 2.4 1.9 3-.4 1 2.9 2.6 1.6-1.2 2.8 1.2 2.8-2.6 1.6-1 2.9-3-.4L12 21.5l-2.4-1.9-3 .4-1-2.9-2.6-1.6 1.2-2.8-1.2-2.8 2.6-1.6 1-2.9 3 .4L12 2.5Z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
  'badge-check': '<path d="M12 2.8 14.6 5l3 .2.3 3 2.1 2.2-2 2.3.3 3-3 .3L14.6 20 12 21.2 9.4 20l-2.7-2-3-.3.3-3-2-2.3L4 10.4 6.1 8.2l.3-3 3-.2L12 2.8Z"/><path d="m9.4 12 1.9 1.9 3.5-3.7"/>',
  'eye-closed': '<path d="M4 4l16 16"/><path d="M9.9 5.2A9.8 9.8 0 0 1 12 5c6 0 9.5 6 9.5 6a17 17 0 0 1-3.1 3.6"/><path d="M6.4 7.4A17 17 0 0 0 2.5 11s3.5 6 9.5 6a9.7 9.7 0 0 0 3.4-.6"/>',

  /* ---- people ---- */
  user:   '<circle cx="12" cy="8" r="3.5"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
  users:  '<circle cx="9" cy="8" r="3.2"/><path d="M2.5 20.5a6.5 6.5 0 0 1 13 0"/><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6"/><path d="M17.5 14.5a6.5 6.5 0 0 1 4 6"/>',
  'users-2': '<circle cx="12" cy="7" r="3.2"/><path d="M6 20a6 6 0 0 1 12 0"/><path d="M4 11a3 3 0 0 0 0 6M20 11a3 3 0 0 1 0 6"/>',
  building: '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2"/><path d="M10 21v-3h4v3"/>',
  support: '<path d="M4 13v-1a8 8 0 0 1 16 0v1"/><rect x="2.5" y="13" width="4.5" height="6.5" rx="2"/><rect x="17" y="13" width="4.5" height="6.5" rx="2"/><path d="M20 19.5v.5a2 2 0 0 1-2 2h-3"/>',

  /* ---- money / cards ---- */
  wallet: '<path d="M3.5 7.5A2 2 0 0 1 5.5 5.5H17a2 2 0 0 1 2 2v1"/><rect x="3.5" y="7.5" width="17" height="11.5" rx="2"/><path d="M20.5 11.5h-3.8a2 2 0 0 0 0 4h3.8"/>',
  banknote: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 10v4M18 10v4"/>',
  coins:  '<ellipse cx="9" cy="7" rx="6" ry="3"/><path d="M3 7v4c0 1.7 2.7 3 6 3s6-1.3 6-3V7"/><path d="M3 11v4c0 1.7 2.7 3 6 3 .5 0 1 0 1.5-.1"/><path d="M15 10.5c3 .2 6 1.4 6 3v4c0 1.7-2.7 3-6 3s-6-1.3-6-3v-2"/>',
  'credit-card': '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 10h19"/><path d="M6 15h3"/>',
  'plus-card': '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 10h19"/><path d="M6 15.5h5M8.5 13v5"/>',
  chip:   '<rect x="7" y="7" width="10" height="10" rx="1.5"/><path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4"/>',
  nfc:    '<path d="M8.5 8a5.5 5.5 0 0 0 0 8"/><path d="M15.5 8a5.5 5.5 0 0 1 0 8"/><path d="M6 5.5a8.5 8.5 0 0 0 0 13"/><path d="M18 5.5a8.5 8.5 0 0 1 0 13"/><circle cx="12" cy="12" r="1.2"/>',
  pin:    '<path d="M12 21v-6"/><path d="M8 3.5h8l-1 5 2 2.5v2H5v-2L7 8.5l1-5Z"/>',
  ticket: '<path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h15A1.5 1.5 0 0 1 21 8.5V10a2 2 0 0 0 0 4v1.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 15.5V14a2 2 0 0 0 0-4V8.5Z"/><path d="M14 7.5v9"/>',
  gift:   '<rect x="3.5" y="9" width="17" height="11.5" rx="1.5"/><path d="M3.5 13.5h17M12 9v11.5"/><path d="M12 9c-3 0-5-1-5-2.8S7.3 3.5 8.6 3.5 12 6 12 9Z"/><path d="M12 9c3 0 5-1 5-2.8s-1.3-2.7-2.6-2.7S12 6 12 9Z"/>',

  /* ---- things ---- */
  gift2:  '<rect x="3.5" y="9" width="17" height="11.5" rx="1.5"/><path d="M3.5 13.5h17M12 9v11.5"/>',
  truck:  '<path d="M2.5 6.5h11v10h-11z"/><path d="M13.5 10h4l3 3v3.5h-7z"/><circle cx="7" cy="18.5" r="1.8"/><circle cx="17" cy="18.5" r="1.8"/>',
  shirt:  '<path d="M8.5 3.5 12 6l3.5-2.5 5 2.5-2 4-2-.8V20.5H7.5V9.2l-2 .8-2-4 5-2.5Z"/>',
  sofa:   '<path d="M4.5 11V8a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v3"/><path d="M3 12.5a2 2 0 0 1 4 0V16h10v-3.5a2 2 0 0 1 4 0V19H3v-6.5Z"/>',
  dumbbell: '<path d="M6.5 8.5v7M4 10v4M17.5 8.5v7M20 10v4M6.5 12h11"/>',
  mobile: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
  phone:  '<path d="M8.5 4.5H6a2 2 0 0 0-2 2c0 7.2 5.8 13 13 13a2 2 0 0 0 2-2v-2.5l-4-1.5-2 2a12 12 0 0 1-5-5l2-2-1.5-4Z"/>',
  mail:   '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="m3.8 6.5 8.2 6 8.2-6"/>',
  message: '<path d="M20.5 12.5c0 4-3.8 7.2-8.5 7.2-1 0-2-.1-2.9-.4L4 21l1.4-4.1A6.9 6.9 0 0 1 3.5 12.5C3.5 8.5 7.3 5.3 12 5.3s8.5 3.2 8.5 7.2Z"/>',
  bell:   '<path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6Z"/><path d="M13.7 20a2 2 0 0 1-3.4 0"/>',
  clock:  '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  key:    '<circle cx="8" cy="12" r="4"/><path d="M12 12h9"/><path d="M17.5 12v3.5M20.5 12v2.5"/>',
  lock:   '<rect x="4.5" y="10" width="15" height="10.5" rx="2"/><path d="M8 10V7.5a4 4 0 0 1 8 0V10"/>',
  unlock: '<rect x="4.5" y="10" width="15" height="10.5" rx="2"/><path d="M8 10V7.5a4 4 0 0 1 7.5-2"/>',
  shield: '<path d="M12 3l7.5 3v5.5c0 4.5-3 8-7.5 9.5-4.5-1.5-7.5-5-7.5-9.5V6L12 3Z"/><path d="m9 12 2 2 4-4"/>',
  layers: '<path d="m12 3 8.5 4.5L12 12 3.5 7.5 12 3Z"/><path d="m3.5 12 8.5 4.5 8.5-4.5"/><path d="m3.5 16.5 8.5 4.5 8.5-4.5"/>',

  /* ---- actions ---- */
  edit:   '<path d="M16.5 4.5 19.5 7.5 8 19H5v-3L16.5 4.5Z"/><path d="M14 7l3 3"/>',
  copy:   '<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M15.5 5.5v-1a1 1 0 0 0-1-1h-10a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h1"/>',
  trash:  '<path d="M4.5 7h15"/><path d="M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7"/><path d="M6.5 7 7.4 19a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4L17.5 7"/><path d="M10.5 11v6M13.5 11v6"/>',
  save:   '<path d="M5 4.5h11L20 8.5v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-14a1 1 0 0 1 1-1Z"/><path d="M8 4.5v5h7v-5"/><path d="M8 20.5v-6h8v6"/>',
  download: '<path d="M12 3.5v11"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M4 19.5h16"/>',
  printer: '<path d="M7 9V4h10v5"/><rect x="3.5" y="9" width="17" height="7" rx="2"/><path d="M7 14h10v6H7z"/>',
  play:   '<circle cx="12" cy="12" r="8.5"/><path d="M10 8.5 16 12l-6 3.5v-7Z"/>',
  eye:    '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
  'eye-off': '<path d="M4 4l16 16"/><path d="M9.9 5.9A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.3 3.7"/><path d="M6.4 7.9A16.6 16.6 0 0 0 2.5 12S6 18.5 12 18.5a9.4 9.4 0 0 0 3.6-.7"/><path d="M10.2 10.3a2.6 2.6 0 0 0 3.6 3.6"/>',

  /* ---- accents ---- */
  chart:  '<path d="M3 21h18"/><path d="M6.5 21v-7"/><path d="M12 21V4"/><path d="M17.5 21v-11"/>',
  star:   '<path d="m12 3.5 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 10l6.1-.9L12 3.5Z"/>',
  flame:  '<path d="M12 21c3.9 0 6.5-2.5 6.5-6 0-4.5-4.5-6.5-5.5-11-2 2.5-3 4.5-3 6.5-1-.5-1.5-1.5-1.5-2.5C7 9.5 5.5 11.5 5.5 15c0 3.5 2.6 6 6.5 6Z"/>',
  sparkles: '<path d="m12 3 1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3Z"/><path d="m18.5 15.5.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1Z"/>',
  bulb:   '<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.5.4.8 1 .8 1.6V15h5.4v-.5c0-.6.3-1.2.8-1.6A6 6 0 0 0 12 3Z"/>',
  rocket: '<path d="M12 2.5c3.5 2 5.5 5.5 5.5 9.5L14 15.5h-4L6.5 12C6.5 8 8.5 4.5 12 2.5Z"/><circle cx="12" cy="10" r="1.8"/><path d="M10 15.5c-1.5 1-2 2.5-2 4 1.5 0 3-.5 4-2"/><path d="M14 15.5c1.5 1 2 2.5 2 4-1.5 0-3-.5-4-2"/>',
  'map-pin': '<path d="M12 21s7-5.7 7-11a7 7 0 1 0-14 0c0 5.3 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/>',
  wifi:   '<path d="M2.5 9a14 14 0 0 1 19 0"/><path d="M6 12.5a9 9 0 0 1 12 0"/><path d="M9.3 16a4.5 4.5 0 0 1 5.4 0"/><path d="M12 19.3h.01"/>',
  wave:   '<path d="M2.5 8.5c2-2.5 4-2.5 6 0s4 2.5 6 0 4-2.5 6 0"/><path d="M2.5 15.5c2-2.5 4-2.5 6 0s4 2.5 6 0 4-2.5 6 0"/>',
  zap:    '<path d="M13 2.5 4 14h7l-1 7.5 9-11.5h-7l1-7.5Z"/>',

  /* ---- added: referenced by the markup and by JS, but the rebuilt sprite had
     lost them, so every <use> for these rendered as an empty box. arrow-left,
     arrow-right, trending-up/down and plus-circle already existed further up, so
     only the genuinely missing ones are added here. ---- */
  'credit-card': '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 9.5h19"/><path d="M6 15h4"/>',
  'eye-off':     '<path d="M10.6 6.2A8.7 8.7 0 0 1 12 6c5 0 9 4.5 9 6a15 15 0 0 1-2.4 3.1"/><path d="M6.3 7.8A15 15 0 0 0 3 12c0 1.5 4 6 9 6 1.4 0 2.7-.3 3.8-.9"/><path d="m3 3 18 18"/><path d="M10 10a2.8 2.8 0 0 0 4 4"/>',
  'plus-card':   '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 9.5h19"/><path d="M12 12.5v4"/><path d="M10 14.5h4"/>'
};

/* ---- inject the sprite once, as the first child of <body> ----
   A single <svg> holding every <symbol> means each icon on the page is a
   cheap <use> reference instead of a repeated copy of the path data. */
const SVG_NS = "http://www.w3.org/2000/svg";
const injectSprite = () => {
  if (document.getElementById("ico-sprite")) return;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.id = "ico-sprite";
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
  svg.innerHTML = Object.entries(ICONS)
    .map(([k, d]) => `<symbol id="i-${k}" viewBox="0 0 24 24">${d}</symbol>`)
    .join("");
  document.body.insertBefore(svg, document.body.firstChild);
};
if (document.body) injectSprite();
else document.addEventListener("DOMContentLoaded", injectSprite);

/* ---- small helpers, for icons inside JS string literals ----
   The base "ic" class carries the sizing and the stroke/fill defaults, so it is
   always added. Without it an svg given any other class has no width or height
   at all and expands to fill the space, which is what made the toast icon
   balloon. Duplicates are collapsed so icon(n, "ic ic-sm") stays tidy. */
const iconCls = (cls) =>
  [...new Set(("ic " + (cls || "")).trim().split(/\s+/).filter(Boolean))].join(" ");

/* A name that is not in the sprite would render as an empty box, and an empty
   box reads as a broken page rather than as a missing picture. A neutral mark
   is used instead, so a name that is wrong somewhere shows up as a plain icon
   rather than as nothing at all. */
export const icon = (name, cls = "") => {
  const key = ICONS[name] ? name : "info";
  return `<svg class='${iconCls(cls)}' aria-hidden='true'><use href='#i-${key}'></use></svg>`;
};

export const ICON_NAMES = Object.keys(ICONS);
