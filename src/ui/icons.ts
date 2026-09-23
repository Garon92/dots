// Inline SVG icons (24×24, stroke = currentColor).
const wrap = (body: string, extra = '') =>
  `<svg class="icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"${extra}>${body}</svg>`;

export const ICONS = {
  play: wrap('<path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none"/>'),
  pause: wrap('<rect x="6" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" stroke="none"/><rect x="14" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" stroke="none"/>'),
  step: wrap('<path d="M5 5v14l9-7z" fill="currentColor" stroke="none"/><path d="M18 5v14"/>'),
  repel: wrap('<circle cx="12" cy="12" r="2.5" fill="currentColor"/><path d="M12 7V3m0 0-2 2m2-2 2 2M12 17v4m0 0-2-2m2 2 2-2M7 12H3m0 0 2-2m-2 2 2 2M17 12h4m0 0-2-2m2 2-2 2"/>'),
  attract: wrap('<circle cx="12" cy="12" r="2.5" fill="currentColor"/><path d="M12 3v4m0 0-2-2m2 2 2-2M12 21v-4m0 0-2 2m2-2 2 2M3 12h4m0 0-2-2m2 2-2 2M21 12h-4m0 0 2-2m-2 2 2 2"/>'),
  swirl: wrap('<path d="M12 12a2 2 0 1 1 2-2c0 3-3 5-6 4.5A6 6 0 1 1 18 9"/><path d="M20.5 13.5A9 9 0 1 1 11 3"/>'),
  spawn: wrap('<circle cx="7" cy="8" r="2" fill="currentColor"/><circle cx="16" cy="6" r="1.5" fill="currentColor"/><circle cx="10" cy="15" r="1.5" fill="currentColor"/><path d="M18 13v8m-4-4h8"/>'),
  erase: wrap('<path d="m7 21-4-4a2 2 0 0 1 0-2.8L13.2 4a2 2 0 0 1 2.8 0l4 4a2 2 0 0 1 0 2.8L11 21"/><path d="M7 21h14M9 11l6 6"/>'),
  dice: wrap('<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="8.5" cy="8.5" r="1.2" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.2" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1.2" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>'),
  mutate: wrap('<path d="M7 3c0 6 10 6 10 12s-10 6-10 6M17 3c0 6-10 6-10 12"/><path d="M8.5 7h7M8.5 17h7"/>'),
  sparkles: wrap('<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>'),
  shuffle: wrap('<path d="M3 7h3.5c4.5 0 6.5 10 11 10H21m0 0-3-3m3 3-3 3M3 17h3.5c1.6 0 2.8-1.2 3.8-2.8M13.7 9.8C14.7 8.2 15.9 7 17.5 7H21m0 0-3-3m3 3-3 3"/>'),
  sliders: wrap('<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>'),
  close: wrap('<path d="M6 6l12 12M18 6 6 18"/>'),
  camera: wrap('<path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.3l1.4-2h5.6l1.4 2h1.3A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z"/><circle cx="12" cy="12.5" r="3.5"/>'),
  share: wrap('<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>'),
  help: wrap('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.2a2.6 2.6 0 0 1 5 .9c0 1.8-2.5 2.2-2.5 3.9"/><circle cx="12" cy="17.2" r=".6" fill="currentColor"/>'),
  keyboard: wrap('<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M7 14h10"/>'),
  fullscreen: wrap('<path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15"/>'),
  exitFullscreen: wrap('<path d="M9 4v3.5A1.5 1.5 0 0 1 7.5 9H4M20 9h-3.5A1.5 1.5 0 0 1 15 7.5V4M15 20v-3.5a1.5 1.5 0 0 1 1.5-1.5H20M4 15h3.5A1.5 1.5 0 0 1 9 16.5V20"/>'),
  back: wrap('<path d="M15 5l-7 7 7 7"/>'),
  star: wrap('<path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/>'),
  starFill: wrap('<path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" fill="currentColor"/>'),
  trash: wrap('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7"/>'),
  edit: wrap('<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
  undo: wrap('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  redo: wrap('<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>'),
  symmetric: wrap('<path d="M12 3v18" stroke-dasharray="2 3"/><path d="M8 7 4 12l4 5M16 7l4 5-4 5"/>'),
  invert: wrap('<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17A8.5 8.5 0 0 0 12 3.5z" fill="currentColor"/>'),
  transpose: wrap('<path d="M4 4l16 16" stroke-dasharray="2 3"/><path d="M8 4h8a4 4 0 0 1 4 4v1M16 20H8a4 4 0 0 1-4-4v-1"/><path d="m18 7 2 2 2-2M6 17l-2-2-2 2"/>'),
  zero: wrap('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 9l6 6M15 9l-6 6"/>'),
  minus: wrap('<path d="M5 12h14"/>'),
  plus: wrap('<path d="M12 5v14M5 12h14"/>'),
  gallery: wrap('<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>'),
  grid: wrap('<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M3.5 9.2h17M3.5 14.8h17M9.2 3.5v17M14.8 3.5v17"/>'),
  atom: wrap('<circle cx="12" cy="12" r="1.8" fill="currentColor"/><ellipse cx="12" cy="12" rx="9" ry="3.8"/><ellipse cx="12" cy="12" rx="9" ry="3.8" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="3.8" transform="rotate(120 12 12)"/>'),
  palette: wrap('<path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.9 1.8-1.8 0-.5-.2-.9-.5-1.2-.3-.4-.5-.8-.5-1.2 0-1 .8-1.8 1.8-1.8h2.2A4.2 4.2 0 0 0 21 10.8C21 6.5 17 3 12 3z"/><circle cx="7.5" cy="11" r="1.2" fill="currentColor"/><circle cx="10" cy="7" r="1.2" fill="currentColor"/><circle cx="14.5" cy="7" r="1.2" fill="currentColor"/>'),
  eye: wrap('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff: wrap('<path d="M3 3l18 18M10.6 5.6A9.7 9.7 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.9 3.7M6.6 6.6C4 8.3 2.5 12 2.5 12s3.5 6.5 9.5 6.5c1.8 0 3.4-.6 4.7-1.4M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
  chevronDown: wrap('<path d="m6 9 6 6 6-6"/>'),
  chevronLeft: wrap('<path d="m15 6-6 6 6 6"/>'),
  chevronRight: wrap('<path d="m9 6 6 6-6 6"/>'),
  more: wrap('<circle cx="5.5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="18.5" cy="12" r="1.3" fill="currentColor"/>'),
  wind: wrap('<path d="M3 8h10.5a2.5 2.5 0 1 0-2.5-2.5M3 12h15.5a2.5 2.5 0 1 1-2.5 2.5M3 16h7"/>'),
  info: wrap('<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><circle cx="12" cy="7.8" r=".6" fill="currentColor"/>'),
  reset: wrap('<path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.5"/><path d="M4 4v4.5h4.5"/>'),
  download: wrap('<path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14"/>'),
  menu: wrap('<path d="M4 7h16M4 12h16M4 17h16"/>'),
} as const;

export type IconName = keyof typeof ICONS;

export function icon(name: IconName): SVGSVGElement {
  const t = document.createElement('template');
  t.innerHTML = ICONS[name];
  return t.content.firstElementChild as SVGSVGElement;
}
