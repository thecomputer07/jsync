// Genera tutti gli asset di brand JSync dentro il progetto.
const fs = require('fs');
const path = require('path');
const { Resvg } = require('../harness/node_modules/@resvg/resvg-js');
const { markSVG, backgroundSVG, textPath, BG_DARK } = require('./mark');

const APP = 'C:/Users/thecomputer07/Desktop/jsync';
const IMG = path.join(APP, 'assets/images');
const BRAND = path.join(APP, 'assets/brand');
fs.mkdirSync(BRAND, { recursive: true });

const svgDoc = (w, h, body, vb = `0 0 ${w} ${h}`) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${vb}">${body}</svg>`;

function png(file, svg, width) {
  const out = new Resvg(svg, { fitTo: width ? { mode: 'width', value: width } : { mode: 'original' } }).render().asPng();
  fs.writeFileSync(file, out);
  console.log('·', path.relative(APP, file));
}

// ── marchio e icona ──
const icon = svgDoc(1024, 1024, backgroundSVG('i') + markSVG({ id: 'i' }));
const markOnly = svgDoc(1024, 1024, markSVG({ id: 'k' }));
fs.writeFileSync(path.join(BRAND, 'jsync-icon.svg'), icon);
fs.writeFileSync(path.join(BRAND, 'jsync-mark.svg'), markOnly);
fs.writeFileSync(path.join(BRAND, 'jsync-mark-mono.svg'), svgDoc(1024, 1024, markSVG({ id: 'o', mono: '#FFFFFF' })));

png(path.join(IMG, 'icon.png'), icon, 1024); // iOS: quadrato pieno, gli angoli li taglia il sistema
png(path.join(IMG, 'splash-icon.png'), markOnly, 1024);
png(path.join(IMG, 'favicon.png'), icon, 48);

// Android adattiva: il contenuto deve stare nel cerchio sicuro (≈66% centrale)
png(path.join(IMG, 'android-icon-foreground.png'), svgDoc(1024, 1024, markSVG({ id: 'f', s: 0.66 })), 1024);
png(path.join(IMG, 'android-icon-background.png'), svgDoc(1024, 1024, backgroundSVG('a')), 1024);
png(path.join(IMG, 'android-icon-monochrome.png'), svgDoc(1024, 1024, markSVG({ id: 'n', s: 0.66, mono: '#FFFFFF' })), 1024);

// ── logotipo orizzontale (marchio + JSync + tagline) ──
function wordmark(id, textColor, tagColor, playColor) {
  const X = 860; // dove inizia la scritta, nel box del marchio
  const word = textPath('JSync', 'Poppins-Bold.ttf', 300, X, 640, { tracking: -6 });
  const tag = textPath('SYNC YOUR FILMS', 'Poppins-SemiBold.ttf', 74, X + 10, 790, { tracking: 18 });
  const left = 150; // margine a sinistra della freccia
  const w = Math.ceil(Math.max(word.maxX, tag.maxX) + 70 - left);
  // ritaglio verticale sul contenuto (il marchio va da y≈205 a y≈940 nel box 1024)
  const top = 165, H = 800;
  const body = `<g transform="translate(${-left} ${-top})">${markSVG({ id, playColor })}
    <path d="${word.d}" fill="${textColor}"/><path d="${tag.d}" fill="${tagColor}"/></g>`;
  return { svg: svgDoc(w, H, body), w, h: H };
}
const onDark = wordmark('wd', '#FFFFFF', '#A78BFA', '#FFFFFF');
const onLight = wordmark('wl', '#111118', '#7C3AED', '#111118');
fs.writeFileSync(path.join(BRAND, 'jsync-wordmark-on-dark.svg'), onDark.svg);
fs.writeFileSync(path.join(BRAND, 'jsync-wordmark-on-light.svg'), onLight.svg);
png(path.join(BRAND, 'jsync-wordmark-on-dark.png'), onDark.svg, 2000);
png(path.join(BRAND, 'jsync-wordmark-on-light.png'), onLight.svg, 2000);
// per l'app (logo in alto nella Home e nella schermata di accesso): @1x/@2x/@3x
for (const [sfx, k] of [['', 1], ['@2x', 2], ['@3x', 3]]) {
  png(path.join(IMG, `wordmark${sfx}.png`), onDark.svg, Math.round(240 * k));
}

// ── banner Android TV 320x180 ──
const bw = 320, bh = 180;
const scale = (bh * 0.62) / onDark.h;
const tvBody = `<rect width="${bw}" height="${bh}" fill="${BG_DARK}"/>
  <g transform="translate(${(bw - onDark.w * scale) / 2} ${(bh - onDark.h * scale) / 2}) scale(${scale})">${onDark.svg.replace(/^<svg[^>]*>|<\/svg>$/g, '')}</g>`;
png(path.join(IMG, 'tv-banner.png'), svgDoc(bw, bh, tvBody), bw);

console.log('wordmark aspect', (onDark.w / onDark.h).toFixed(3));
