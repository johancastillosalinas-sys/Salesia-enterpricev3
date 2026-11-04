/**
 * @file payments.js
 * @description Métodos de pago disponibles. Los ids se mantienen (se guardan en cada venta).
 */

export const PAYMENTS = [
  { id: 'EFECTIVO', label: 'Efectivo', hint: 'Pago al contado', icon: 'cash' },
  { id: 'TARJETA_CREDITO', label: 'Tarjeta', hint: 'Crédito o débito', icon: 'card' },
  { id: 'TRANSFERENCIA', label: 'Transferencia', hint: 'Bancaria', icon: 'bank' },
  { id: 'YAPE_PLIN', label: 'Yape / Plin', hint: 'Billetera digital', icon: 'phone' }
];

export function paymentLabel(id) {
  return PAYMENTS.find(p => p.id === id)?.label || id || '—';
}
