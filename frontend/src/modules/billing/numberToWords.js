/**
 * @file numberToWords.js
 * @description Monto en letras para comprobantes: "SON: MIL CIENTO DIECIOCHO CON 00/100 SOLES".
 */

const U = ['CERO', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE',
  'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE', 'VEINTIUNO', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO',
  'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
const T = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const C = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

function below1000(n) {
  if (n === 100) return 'CIEN';
  const out = [];
  if (n >= 100) { out.push(C[Math.floor(n / 100)]); n %= 100; }
  if (n > 0) {
    if (n < 30) out.push(U[n]);
    else { const t = Math.floor(n / 10), u = n % 10; out.push(u ? `${T[t]} Y ${U[u]}` : T[t]); }
  }
  return out.join(' ');
}

export function amountInWords(amount) {
  const total = Math.round(Number(amount) * 100);
  const whole = Math.floor(total / 100);
  const cents = total % 100;
  let words;
  if (whole === 0) words = 'CERO';
  else {
    const m = Math.floor(whole / 1_000_000), k = Math.floor((whole % 1_000_000) / 1000), r = whole % 1000;
    const parts = [];
    if (m) parts.push(m === 1 ? 'UN MILLÓN' : `${below1000(m).replace(/VEINTIUNO$/, 'VEINTIÚN')} MILLONES`);
    if (k) parts.push(k === 1 ? 'MIL' : `${below1000(k).replace(/VEINTIUNO$/, 'VEINTIÚN')} MIL`);
    if (r) parts.push(below1000(r));
    words = parts.join(' ').replace(/\bUN$/, 'UNO');
  }
  return `SON: ${words} CON ${String(cents).padStart(2, '0')}/100 SOLES`;
}
