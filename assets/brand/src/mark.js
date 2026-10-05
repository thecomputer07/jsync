// Marchio JSync: una J la cui curva è una freccia di sincronia, con il play nell'occhiello.
// Esporta le funzioni SVG usate per generare tutte le icone dell'app.
const opentype = require('../harness/node_modules/opentype.js');
const path = require('path');

const V1 = '#8B5CF6';
const V2 = '#EC4899';
const BG_DARK = '#07070A';

function roundedPlay(cx, cy, h, r) {
  const w = h * 0.866;
  const p = [
    [cx - w / 3, cy - h / 2],
    [cx - w / 3, cy + h / 2],
    [cx + (2 * w) / 3, cy],
  ];
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  let d = '';
  for (let i = 0; i < 3; i++) {
    const prev = p[(i + 2) % 3], cur = p[i], next = p[(i + 1) % 3];
    const a = lerp(cur, prev, r / len(cur, prev));
    const b = lerp(cur, next, r / len(cur, next));
    d += `${i === 0 ? 'M' : 'L'}${a[0].toFixed(1)},${a[1].toFixed(1)} Q${cur[0].toFixed(1)},${cur[1].toFixed(1)} ${b[0].toFixed(1)},${b[1].toFixed(1)} `;
  }
  return d + 'Z';
}

/**
 * Il marchio in un box 1024x1024, scalato di `s` attorno al centro.
 * opts.mono: tutto in un colore (icona monocromatica Android, stampa).
 */
function markSVG({ s = 1, mono = null, id = 'm', playColor = '#fff' } = {}) {
  const sw = 116; // spessore del tratto
  const R = 168; // raggio della curva
  const cx = 540; // centro della curva (composizione bilanciata con la freccia a sinistra)
  const cy = 566;
  const stemX = cx + R;
  const top = 236;
  const leftX = cx - R;
  const arrowHalf = 94;
  const arrowTip = cy - 168;
  const fill = mono ?? `url(#${id}g)`;
  const playFill = playColor;
  const body = `
    <path d="M${stemX},${top} L${stemX},${cy} A${R},${R} 0 0 1 ${leftX},${cy}" fill="none" stroke="${fill}" stroke-width="${sw}" stroke-linecap="round"/>
    <path d="M${leftX - arrowHalf},${cy + 6} L${leftX + arrowHalf},${cy + 6} L${leftX},${arrowTip} Z" fill="${fill}" stroke="${fill}" stroke-width="30" stroke-linejoin="round"/>
    ${mono ? '' : `<path d="${playPath(cx, cy, R, sw, leftX, arrowHalf)}" fill="${playFill}"/>`}`;
  const defs = `<defs><linearGradient id="${id}g" gradientUnits="userSpaceOnUse" x1="250" y1="200" x2="780" y2="820">
      <stop offset="0" stop-color="${V1}"/><stop offset="1" stop-color="${V2}"/></linearGradient></defs>`;
  return `${defs}<g transform="translate(512 512) scale(${s}) translate(-512 -512)">${body}</g>`;
}

/**
 * Play nell'occhiello della J: in orizzontale a metà fra la base della freccia e la gamba
 * (stessa aria ai due lati), in verticale all'altezza del centro della curva.
 */
function playPath(cx, cy, R, sw, leftX, arrowHalf) {
  const h = 94;
  const w = h * 0.866;
  const arrowRight = leftX + arrowHalf + 15; // base della freccia + metà del bordo arrotondato
  const stemInner = cx + R - sw / 2;
  const boxCenterX = (arrowRight + stemInner) / 2;
  return roundedPlay(boxCenterX - w / 2 + w / 3, cy + 2, h, 13);
}

function backgroundSVG(id = 'b') {
  return `<defs><radialGradient id="${id}bg" cx="28%" cy="20%" r="100%">
      <stop offset="0" stop-color="#22163F"/><stop offset="0.55" stop-color="#0E0B18"/><stop offset="1" stop-color="${BG_DARK}"/>
    </radialGradient></defs><rect width="1024" height="1024" fill="url(#${id}bg)"/>`;
}

/** Testo convertito in tracciati (nessuna dipendenza da font installati). */
function textPath(text, fontFile, size, x, y, { tracking = 0, anchor = 'start' } = {}) {
  const buf = require('fs').readFileSync(path.join(__dirname, fontFile));
  const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  let width = 0;
  // Un glifo per carattere (niente legature), così la spaziatura del tracking è sotto controllo.
  const glyphs = Array.from(text).map((ch) => font.charToGlyph(ch));
  glyphs.forEach((g, i) => {
    width += (g.advanceWidth / font.unitsPerEm) * size + (i < glyphs.length - 1 ? tracking : 0);
  });
  let cursor = anchor === 'middle' ? x - width / 2 : x;
  let d = '';
  let maxX = -Infinity;
  // Serializzazione fatta qui: Path.toPathData di opentype.js (versione installata)
  // produce NaN su alcuni glifi (la "L" di Poppins), e resvg smette di disegnare da lì.
  const n = (v) => (Math.round(v * 100) / 100).toString();
  glyphs.forEach((g) => {
    const src = g.getPath(0, 0, size);
    for (const c of src.commands) {
      const X = (v) => n(v + cursor);
      const Y = (v) => n(v + y);
      if (c.type === 'M' || c.type === 'L') d += `${c.type}${X(c.x)} ${Y(c.y)}`;
      else if (c.type === 'Q') d += `Q${X(c.x1)} ${Y(c.y1)} ${X(c.x)} ${Y(c.y)}`;
      else if (c.type === 'C') d += `C${X(c.x1)} ${Y(c.y1)} ${X(c.x2)} ${Y(c.y2)} ${X(c.x)} ${Y(c.y)}`;
      else if (c.type === 'Z') d += 'Z';
      if (c.x !== undefined) maxX = Math.max(maxX, c.x + cursor);
    }
    cursor += (g.advanceWidth / font.unitsPerEm) * size + tracking;
  });
  if (/NaN/.test(d)) throw new Error('tracciato non valido');
  return { d, width, maxX };
}

module.exports = { markSVG, backgroundSVG, textPath, V1, V2, BG_DARK };
