// Anteprima: icona grande, icona piccola, logotipo orizzontale su scuro e su chiaro, versione mono.
const fs = require('fs');
const path = require('path');
const { Resvg } = require('../harness/node_modules/@resvg/resvg-js');
const { markSVG, backgroundSVG, textPath } = require('./mark');

const icon = (id, sz, x, y) =>
  `<svg x="${x}" y="${y}" width="${sz}" height="${sz}" viewBox="0 0 1024 1024"><clipPath id="${id}c"><rect width="1024" height="1024" rx="230"/></clipPath><g clip-path="url(#${id}c)">${backgroundSVG(id)}${markSVG({ id })}</g></svg>`;

function wordmark(id, x, y, h, color, tagColor, playColor = '#fff') {
  // marchio senza sfondo + "JSync" + tagline
  const word = textPath('JSync', 'Poppins-Bold.ttf', 300, 1080, 640, { tracking: -6 });
  const tag = textPath('SYNC YOUR FILMS', 'Poppins-SemiBold.ttf', 74, 1090, 790, { tracking: 18 });
  const w = Math.max(word.maxX, tag.maxX) + 60;
  return `<g transform="translate(${x} ${y}) scale(${h / 1024})">
    ${markSVG({ id, playColor })}
    <path d="${word.d}" fill="${color}"/>
    <path d="${tag.d}" fill="${tagColor}"/></g>`;
}

const W = 1700, H = 1100;
let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="#EEEEF2"/>
<rect x="0" y="560" width="${W}" height="540" fill="#07070A"/>`;
s += icon('a', 460, 40, 50);
s += icon('b', 120, 540, 220);
s += icon('c', 60, 700, 250);
s += icon('d', 29, 800, 265);
s += wordmark('e', 880, 150, 300, '#111118', '#7C3AED', '#111118');
s += wordmark('f', 60, 640, 300, '#FFFFFF', '#A78BFA');
// mono (icona a tema Android / stampa)
s += `<svg x="1080" y="640" width="300" height="300" viewBox="0 0 1024 1024">${markSVG({ id: 'g', mono: '#FFFFFF' })}</svg>`;
s += `<svg x="1360" y="640" width="300" height="300" viewBox="0 0 1024 1024"><rect width="1024" height="1024" rx="230" fill="#fff"/>${markSVG({ id: 'h', mono: '#111118' })}</svg>`;
s += '</svg>';
fs.writeFileSync(path.join(__dirname, 'preview.svg'), s);
fs.writeFileSync(path.join(__dirname, 'preview.png'), new Resvg(s).render().asPng());
console.log('ok');
