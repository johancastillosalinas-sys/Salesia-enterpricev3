/**
 * @file pseudoQr.js
 * @description Código con aspecto de QR generado a partir de un texto (decorativo, NO es escaneable).
 */

import { sha256 } from '../../utils/hash.js';

export function pseudoQrSvg(seed, size = 120) {
  const n = 25;
  let bits = '';
  for (let i = 0; bits.length < n * n; i++) {
    bits += sha256(`${seed}:${i}`).split('').map(c => parseInt(c, 16).toString(2).padStart(4, '0')).join('');
  }
  const finder = (ox, oy) => {
    let out = '';
    for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
      const edge = x === 0 || y === 0 || x === 6 || y === 6;
      const core = x >= 2 && x <= 4 && y >= 2 && y <= 4;
      if (edge || core) out += `<rect x="${ox + x}" y="${oy + y}" width="1" height="1"/>`;
    }
    return out;
  };
  const inFinder = (x, y) => (x < 8 && y < 8) || (x > n - 9 && y < 8) || (x < 8 && y > n - 9);
  let cells = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (!inFinder(x, y) && bits[y * n + x] === '1') cells += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" fill="#0f172a" aria-label="QR de demostración">${finder(0, 0)}${finder(n - 7, 0)}${finder(0, n - 7)}${cells}</svg>`;
}
