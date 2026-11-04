/**
 * @file saleStatus.js
 * @description Ciclo de vida de una venta:
 *   PENDIENTE_COBRO  → registrada, con stock reservado, sin pagar
 *   PAGADA           → cobrada en la pasarela, falta emitir boleta/factura
 *   COMPLETADO       → cobrada y con comprobante emitido
 *   ANULADA          → venta pendiente anulada (el stock se devuelve)
 */

export const SaleStatus = {
  PENDING: 'PENDIENTE_COBRO',
  PAID: 'PAGADA',
  DONE: 'COMPLETADO',
  CANCELLED: 'ANULADA'
};

/** Una venta cuenta para ingresos solo si ya fue cobrada. */
export const isPaid = (s) => s.status === SaleStatus.PAID || s.status === SaleStatus.DONE;

/** Estado de facturación para listados y filtros. */
export function billingState(s) {
  if (s.status === SaleStatus.CANCELLED) return 'ANULADA';
  if (s.status === SaleStatus.PENDING) return 'PENDIENTE';
  return s.invoice ? 'EMITIDO' : 'POR_EMITIR';
}

export const BILLING_LABELS = {
  PENDIENTE: { text: 'Pendiente de cobro', tone: 'bg-amber-50 text-amber-700 border-amber-200' },
  POR_EMITIR: { text: 'Cobrada · sin comprobante', tone: 'bg-sky-50 text-sky-700 border-sky-200' },
  EMITIDO: { text: 'Comprobante emitido', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  ANULADA: { text: 'Anulada', tone: 'bg-slate-100 text-slate-500 border-slate-200' }
};
