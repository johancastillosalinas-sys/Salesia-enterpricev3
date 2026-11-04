/**
 * @file quoteEngine.js
 * @description Módulo de cotizaciones 100% desacoplado e independiente (Sandbox Pattern).
 * Las cotizaciones son hipótesis comerciales: no descuentan existencias ni afectan las ventas
 * hasta que son explícitamente aprobadas y convertidas por el usuario.
 */

import { QuoteStatus } from '../../types/schemas.js';

export class QuoteEngine {
  #storage;
  #seqQuotes;
  #quotes = [];

  constructor(storage, seqQuotes) {
    this.#storage = storage;
    this.#seqQuotes = seqQuotes;
    this.#quotes = this.#storage.get('quotes', []);
  }

  static calculateTotals(items = [], globalDiscountPct = 0, taxRate = 0.18) {
    let rawSubtotal = 0;
    for (const item of items) {
      const price = Number(item.price) || 0;
      const qty = Number(item.quantity) || 0;
      const lineTotal = (price * qty) * (1 - ((item.discountPct || 0) / 100));
      rawSubtotal += Math.max(0, lineTotal);
    }
    const discountAmount = rawSubtotal * (Math.max(0, Math.min(100, globalDiscountPct)) / 100);
    const taxableBase = rawSubtotal - discountAmount;
    const taxAmount = taxableBase * taxRate;
    const total = taxableBase + taxAmount;

    return {
      subtotal: Number(rawSubtotal.toFixed(2)),
      discountAmount: Number(discountAmount.toFixed(2)),
      taxAmount: Number(taxAmount.toFixed(2)),
      total: Number(total.toFixed(2))
    };
  }

  createQuote({ customerId, customerName, items, discountPct = 0, validityDays = 15, notes = '' }) {
    if (!items || items.length === 0) {
      throw new Error('La cotización debe incluir al menos un producto.');
    }

    const { formattedId, seqNumber } = this.#seqQuotes.next();
    const totals = QuoteEngine.calculateTotals(items, discountPct);
    const now = new Date();
    const expiry = new Date(now.getTime() + (validityDays * 24 * 60 * 60 * 1000));

    const newQuote = {
      id: formattedId,
      sequenceNumber: seqNumber,
      customerId,
      customerName,
      items: items.map(it => ({
        productId: it.productId,
        name: it.name,
        sku: it.sku || '',
        price: it.price,
        quantity: it.quantity,
        discountPct: it.discountPct || 0,
        subtotal: Number(((it.price * it.quantity) * (1 - ((it.discountPct || 0) / 100))).toFixed(2))
      })),
      discountPct,
      totals,
      status: QuoteStatus.ISSUED,
      notes,
      validityDays,
      createdAt: now.toISOString(),
      expiresAt: expiry.toISOString(),
      convertedToSaleId: null
    };

    this.#quotes.unshift(newQuote);
    this.#storage.set('quotes', this.#quotes);
    return newQuote;
  }

  prepareConversionToSale(quoteId, paymentMethod = 'TRANSFERENCIA') {
    const q = this.#quotes.find(item => item.id === quoteId);
    if (!q) throw new Error('Cotización no encontrada.');
    if (q.status === QuoteStatus.CONVERTED) throw new Error('Esta cotización ya fue convertida a venta.');

    return {
      quote: { ...q },
      saleCommand: {
        customerId: q.customerId,
        customerName: q.customerName,
        items: q.items.map(it => ({ ...it })),
        paymentMethod,
        originQuoteId: q.id,
        summary: `Conversión formal de Cotización ${q.id}`
      }
    };
  }

  markAsConverted(quoteId, saleTicketId) {
    const q = this.#quotes.find(item => item.id === quoteId);
    if (q) {
      q.status = QuoteStatus.CONVERTED;
      q.convertedToSaleId = saleTicketId;
      q.convertedAt = new Date().toISOString();
      this.#storage.set('quotes', this.#quotes);
    }
  }

  /** Vuelve a leer las cotizaciones guardadas (después de importar o reiniciar datos). */
  reload() {
    this.#quotes = this.#storage.get('quotes', []);
  }

  getQuotes() {
    return this.#quotes.map(q => ({ ...q }));
  }

  clear() {
    this.#quotes = [];
    this.#storage.set('quotes', []);
  }
}
