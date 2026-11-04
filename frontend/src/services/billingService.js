/**
 * @file billingService.js
 * @description Cobro y facturación simulados sobre una venta ya registrada.
 * Las tarjetas NUNCA se guardan: solo la marca y los últimos 4 dígitos.
 */

import { SaleStatus } from '../modules/billing/saleStatus.js';
import { sha256 } from '../utils/hash.js';

const SERIES = { BOLETA: 'B001', FACTURA: 'F001' };

export class BillingService {
  constructor(storage, api) {
    this.storage = storage;
    this.api = api;
  }

  getSale(id) {
    return this.storage.get('sales', []).find(s => s.id === id) || null;
  }

  #update(id, mutate) {
    const sales = this.storage.get('sales', []);
    const sale = sales.find(s => s.id === id);
    if (!sale) throw new Error('La venta no existe.');
    mutate(sale);
    this.storage.set('sales', sales);
    return sale;
  }

  /** Registra un cobro aprobado por la pasarela. */
  registerPayment(saleId, payment) {
    const current = this.getSale(saleId);
    if (!current) throw new Error('La venta no existe.');
    if (current.status !== SaleStatus.PENDING) throw new Error('Esta venta ya fue cobrada o anulada.');
    const sale = this.#update(saleId, (s) => {
      s.payment = { ...payment, status: 'APROBADO', amount: s.totals.total, paidAt: Date.now() };
      s.paymentMethod = payment.method;
      s.status = SaleStatus.PAID;
    });
    this.api.logAudit('PAYMENT_APPROVED', 'sales', `Cobro aprobado de ${sale.id} por S/ ${sale.totals.total.toFixed(2)} (${payment.method})`);
    return sale;
  }

  #nextNumber(type) {
    const series = this.storage.get('doc_series', { BOLETA: 0, FACTURA: 0 });
    series[type] = (series[type] || 0) + 1;
    this.storage.set('doc_series', series);
    return { series: SERIES[type], number: series[type] };
  }

  /**
   * Emite boleta o factura electrónica (simulado).
   * @param {{type:'BOLETA'|'FACTURA', customer:{docType:string,docNumber:string,name:string,address?:string}}} data
   */
  issueDocument(saleId, { type, customer }) {
    if (!SERIES[type]) throw new Error('Tipo de comprobante no válido.');
    const current = this.getSale(saleId);
    if (!current) throw new Error('La venta no existe.');
    if (current.invoice) throw new Error('Esta venta ya tiene comprobante.');
    if (current.status !== SaleStatus.PAID && current.status !== SaleStatus.DONE) throw new Error('Primero debes cobrar la venta.');

    const { series, number } = this.#nextNumber(type);
    const fullNumber = `${series}-${String(number).padStart(8, '0')}`;
    const issuedAt = Date.now();
    const sale = this.#update(saleId, (s) => {
      s.invoice = {
        type, series, number, fullNumber, issuedAt,
        customer,
        hash: btoa(sha256(`${fullNumber}|${s.totals.total}|${issuedAt}`)).slice(0, 28)
      };
      s.status = SaleStatus.DONE;
    });
    this.api.logAudit('DOCUMENT_ISSUED', 'sales', `${type === 'FACTURA' ? 'Factura' : 'Boleta'} ${fullNumber} emitida para ${sale.id}`);
    return sale;
  }
}
