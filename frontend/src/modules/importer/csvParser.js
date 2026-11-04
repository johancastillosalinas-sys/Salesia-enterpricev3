/**
 * @file csvParser.js
 * @description Lector de CSV tolerante: detecta el separador (, ; tabulación |), respeta comillas,
 * saltos de línea dentro de comillas y el BOM de Excel.
 */

export function detectDelimiter(text) {
  const sample = text.split(/\r?\n/).slice(0, 6).join('\n');
  const candidates = [',', ';', '\t', '|'];
  let best = ',', bestScore = -1;
  for (const d of candidates) {
    let inQuotes = false, count = 0;
    for (const ch of sample) {
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === d && !inQuotes) count++;
    }
    if (count > bestScore) { bestScore = count; best = d; }
  }
  return best;
}

/** @returns {{delimiter:string, headers:string[], rows:string[][]}} */
export function parseCsv(input) {
  let text = String(input || '').replace(/^\uFEFF/, '');
  const delimiter = detectDelimiter(text);
  const rows = [];
  let row = [], field = '', inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delimiter) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }

  const nonEmpty = rows.filter(r => r.some(c => String(c).trim() !== ''));
  if (nonEmpty.length === 0) return { delimiter, headers: [], rows: [] };
  return { delimiter, headers: nonEmpty[0].map(h => String(h).trim()), rows: nonEmpty.slice(1) };
}

/** Escribe un valor para CSV (comillas si hace falta). */
export function csvEscape(value, delimiter = ',') {
  const s = String(value ?? '');
  return /["\n\r]/.test(s) || s.includes(delimiter) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers, rows, delimiter = ',') {
  return [headers, ...rows].map(r => r.map(v => csvEscape(v, delimiter)).join(delimiter)).join('\r\n');
}
