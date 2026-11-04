/**
 * @file paymentGateway.js
 * @description Pasarela de pago SIMULADA. No se conecta a ningún banco.
 * Tarjetas de prueba:
 *   4111 1111 1111 1111  → aprobada          5555 5555 5555 4444 → aprobada
 *   4000 0000 0000 0002  → rechazada (fondos) 4000 0000 0000 0069 → rechazada (vencida)
 *   4000 0000 0000 3220  → pide código 3-D Secure (123456)
 */

export const TEST_CARDS = [
  { label: 'Visa aprobada', number: '4111111111111111', tone: 'emerald' },
  { label: 'Mastercard aprobada', number: '5555555555554444', tone: 'emerald' },
  { label: 'Rechazada (fondos)', number: '4000000000000002', tone: 'rose' },
  { label: 'Pide código 3-D Secure', number: '4000000000003220', tone: 'amber' }
];
export const OTP_CODE = '123456';
const CARD_LIMIT = 15000;

export const onlyDigits = (v) => String(v || '').replace(/\D/g, '');

export function luhn(number) {
  const digits = onlyDigits(number);
  if (digits.length < 13) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = parseInt(digits[digits.length - 1 - i], 10);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

export function detectBrand(number) {
  const n = onlyDigits(number);
  if (/^4/.test(n)) return { id: 'visa', label: 'VISA', cvvLen: 3, length: 16 };
  if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(n)) return { id: 'mastercard', label: 'MASTERCARD', cvvLen: 3, length: 16 };
  if (/^3[47]/.test(n)) return { id: 'amex', label: 'AMEX', cvvLen: 4, length: 15 };
  if (/^3(0[0-5]|[68])/.test(n)) return { id: 'diners', label: 'DINERS', cvvLen: 3, length: 14 };
  return { id: 'unknown', label: 'TARJETA', cvvLen: 3, length: 16 };
}

export function formatCardNumber(raw) {
  const n = onlyDigits(raw);
  const brand = detectBrand(n);
  const groups = brand.id === 'amex' ? [4, 6, 5] : brand.id === 'diners' ? [4, 6, 4] : [4, 4, 4, 4, 3];
  const out = [];
  let pos = 0;
  for (const g of groups) { if (pos >= n.length) break; out.push(n.slice(pos, pos + g)); pos += g; }
  return out.join(' ');
}

export function formatExpiry(raw) {
  const d = onlyDigits(raw).slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}

export function validateCard({ number, name, expiry, cvv }) {
  const n = onlyDigits(number);
  const brand = detectBrand(n);
  if (!luhn(n) || n.length !== brand.length) return { field: 'number', message: 'El número de tarjeta no es válido.' };
  if (String(name || '').trim().length < 3) return { field: 'name', message: 'Escribe el nombre del titular.' };
  const m = /^(\d{2})\/(\d{2})$/.exec(expiry || '');
  if (!m || +m[1] < 1 || +m[1] > 12) return { field: 'expiry', message: 'Vencimiento inválido (usa MM/AA).' };
  const exp = new Date(2000 + +m[2], +m[1], 0, 23, 59, 59);
  if (exp < new Date()) return { field: 'expiry', message: 'La tarjeta está vencida.' };
  if (onlyDigits(cvv).length !== brand.cvvLen) return { field: 'cvv', message: `El CVV debe tener ${brand.cvvLen} dígitos.` };
  return null;
}

const wait = (ms) => new Promise(r => setTimeout(r, globalThis.__SALESIA_FAST__ ? 15 : ms));
const rand = (len) => Array.from({ length: len }, () => Math.floor(Math.random() * 10)).join('');

export class PaymentGateway {
  /** @returns {Promise<{status:'APPROVED'|'DECLINED'|'REQUIRES_3DS', reason?:string, authCode?:string, reference?:string, brand?:string, last4?:string}>} */
  static async authorize({ number, amount }) {
    await wait(2400);
    const n = onlyDigits(number);
    const brand = detectBrand(n).id;
    const base = { brand, last4: n.slice(-4) };

    if (n === '4000000000000002') return { status: 'DECLINED', reason: 'Fondos insuficientes. Prueba con otra tarjeta.', ...base };
    if (n === '4000000000000069') return { status: 'DECLINED', reason: 'La tarjeta está vencida según el banco emisor.', ...base };
    if (n === '4000000000000127') return { status: 'DECLINED', reason: 'El código de seguridad (CVV) es incorrecto.', ...base };
    if (amount > CARD_LIMIT) return { status: 'DECLINED', reason: `El monto supera el límite de la tarjeta (S/ ${CARD_LIMIT.toLocaleString('es-PE')}) en esta simulación.`, ...base };
    if (n === '4000000000003220') return { status: 'REQUIRES_3DS', ...base };
    return { status: 'APPROVED', authCode: rand(6), reference: `TX-${Date.now().toString(36).toUpperCase()}`, ...base };
  }

  static async verify3ds(code) {
    await wait(1200);
    return onlyDigits(code) === OTP_CODE
      ? { ok: true, authCode: rand(6), reference: `TX-${Date.now().toString(36).toUpperCase()}` }
      : { ok: false };
  }

  static async confirmWallet() {
    await wait(2000);
    return { reference: `YP-${rand(8)}` };
  }

  static async confirmTransfer(operation) {
    await wait(1600);
    return { reference: `OP-${onlyDigits(operation)}` };
  }
}
