/**
 * @file invoiceDocument.js
 * @description Boleta de venta / factura electrónica (simulada) lista para ver e imprimir.
 */

import { formatCurrency, escapeHtml } from '../../utils/formatters.js';
import { amountInWords } from './numberToWords.js';
import { pseudoQrSvg } from './pseudoQr.js';
import { paymentLabel } from '../sales/payments.js';

function paymentText(sale) {
  const p = sale.payment || {};
  if (p.method === 'TARJETA_CREDITO' && p.last4) return `Tarjeta ${String(p.cardBrand || '').toUpperCase()} •••• ${p.last4}`;
  return paymentLabel(sale.paymentMethod);
}

export function renderInvoiceHtml(sale, company) {
  const inv = sale.invoice;
  const isFactura = inv.type === 'FACTURA';
  const title = isFactura ? 'FACTURA ELECTRÓNICA' : 'BOLETA DE VENTA ELECTRÓNICA';
  const c = inv.customer || {};
  const issued = new Date(inv.issuedAt);
  const rows = sale.items.map(it => `
    <tr class="border-b border-slate-200">
      <td class="py-2 px-2 text-center">${escapeHtml(it.quantity)}</td>
      <td class="py-2 px-2 text-center">UND</td>
      <td class="py-2 px-2 font-mono text-[11px] text-slate-500">${escapeHtml(it.sku || '—')}</td>
      <td class="py-2 px-2">${escapeHtml(it.name)}</td>
      <td class="py-2 px-2 text-right font-mono">${formatCurrency(it.price)}</td>
      <td class="py-2 px-2 text-right font-mono font-semibold">${formatCurrency(it.price * it.quantity)}</td>
    </tr>`).join('');

  return `
  <div class="doc-sheet mx-auto max-w-[800px] p-8 border border-slate-200 shadow-sm">
    <div class="flex items-start justify-between gap-6 pb-5 border-b-2 border-slate-900">
      <div class="flex gap-3">
        <div class="w-12 h-12 rounded-xl bg-slate-900 text-white font-black text-xl flex items-center justify-center shrink-0">S</div>
        <div>
          <p class="text-base font-extrabold leading-tight">${escapeHtml(company?.name || 'SalesIA Enterprise S.A.C.')}</p>
          <p class="text-[11px] text-slate-500 leading-snug mt-1">${escapeHtml(company?.address || '')}<br>Tel. ${escapeHtml(company?.phone || '')}</p>
        </div>
      </div>
      <div class="border-2 border-slate-900 rounded-lg px-4 py-3 text-center min-w-[230px]">
        <p class="text-[11px] font-bold">R.U.C. ${escapeHtml(company?.ruc || '')}</p>
        <p class="text-[13px] font-extrabold my-1">${title}</p>
        <p class="text-[15px] font-black font-mono">${escapeHtml(inv.fullNumber)}</p>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-x-8 gap-y-1.5 py-4 text-[12px]">
      <p><span class="font-bold">${isFactura ? 'Razón social' : 'Cliente'}:</span> ${escapeHtml(c.name || 'CLIENTE VARIOS')}</p>
      <p><span class="font-bold">Fecha de emisión:</span> ${issued.toLocaleDateString('es-PE')} ${issued.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}</p>
      <p><span class="font-bold">${escapeHtml(c.docType && c.docType !== 'SIN' ? c.docType : 'Documento')}:</span> ${escapeHtml(c.docNumber || '—')}</p>
      <p><span class="font-bold">Moneda:</span> SOLES (PEN)</p>
      <p><span class="font-bold">Dirección:</span> ${escapeHtml(c.address || '—')}</p>
      <p><span class="font-bold">Forma de pago:</span> ${escapeHtml(paymentText(sale))}</p>
      <p><span class="font-bold">Vendedor:</span> ${escapeHtml(sale.sellerName || '—')}</p>
      <p><span class="font-bold">Venta de origen:</span> ${escapeHtml(sale.id)}</p>
    </div>

    <table class="text-[12px]">
      <thead><tr class="bg-slate-900 text-white text-[11px]">
        <th class="py-2 px-2 w-12">Cant.</th><th class="py-2 px-2 w-12">Unid.</th><th class="py-2 px-2 text-left w-32">Código</th>
        <th class="py-2 px-2 text-left">Descripción</th><th class="py-2 px-2 text-right w-24">P. unit.</th><th class="py-2 px-2 text-right w-28">Importe</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="flex items-start justify-between gap-6 mt-5 doc-block">
      <div class="flex-1">
        <p class="text-[12px] font-bold">${escapeHtml(amountInWords(sale.totals.total))}</p>
        <div class="flex items-center gap-4 mt-4">
          ${pseudoQrSvg(`${company?.ruc}|${inv.fullNumber}|${sale.totals.total}`, 96)}
          <p class="text-[10px] text-slate-500 leading-relaxed max-w-[260px]">
            Hash: <span class="font-mono">${escapeHtml(inv.hash)}</span><br>
            Representación impresa de la ${isFactura ? 'factura' : 'boleta de venta'} electrónica.<br>
            Documento de demostración: no tiene validez tributaria.
          </p>
        </div>
      </div>
      <table class="w-64 text-[12px]">
        <tr><td class="py-1 text-slate-500">Op. gravada</td><td class="py-1 text-right font-mono">${formatCurrency(sale.totals.subtotal)}</td></tr>
        <tr><td class="py-1 text-slate-500">IGV (18%)</td><td class="py-1 text-right font-mono">${formatCurrency(sale.totals.taxAmount)}</td></tr>
        <tr class="border-t-2 border-slate-900"><td class="py-2 font-extrabold text-sm">TOTAL</td><td class="py-2 text-right font-mono font-extrabold text-sm">${formatCurrency(sale.totals.total)}</td></tr>
      </table>
    </div>
  </div>`;
}
