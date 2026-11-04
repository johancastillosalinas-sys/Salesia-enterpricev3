/**
 * @file historyController.js
 * @description Historial de ventas: buscador, estado de cobro/facturación y paginación.
 */

import { avatar, normalize, paginate, renderPager } from '../../components/uiKit.js';
import { formatCurrency, escapeHtml } from '../../utils/formatters.js';
import { paymentLabel } from '../sales/payments.js';
import { billingState, BILLING_LABELS } from '../billing/saleStatus.js';

const PAGE_SIZE = 12;

export class HistoryController {
  static page = 1;

  constructor(app) {
    this.app = app;
  }

  render() {
    const sales = this.app.state.storage.get('sales', []);
    const tbody = document.getElementById('historyTableTbody');
    if (!tbody) return;

    const search = document.getElementById('historySearchInput');
    search.oninput = () => { HistoryController.page = 1; this.render(); };
    const q = normalize(search.value).trim();
    const visible = sales.filter(s => !q ||
      normalize(`${s.id} ${s.customerName} ${s.sellerName} ${s.invoice?.fullNumber || ''}`).includes(q));

    const counter = document.getElementById('historyCounter');
    if (counter) counter.innerText = `${visible.length} de ${sales.length} ventas`;

    if (visible.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-12 text-center text-slate-400">${sales.length === 0 ? 'Sin historial: todavía no hay ventas.' : 'Ninguna venta coincide con la búsqueda.'}</td></tr>`;
      renderPager('historyPager', { total: 0, page: 1, size: PAGE_SIZE, onPage() {} });
      return;
    }

    const { items, page } = paginate(visible, HistoryController.page, PAGE_SIZE);
    HistoryController.page = page;

    tbody.innerHTML = items.map(s => {
      const st = billingState(s);
      return `
      <tr class="border-b border-slate-100 hover:bg-slate-50 text-xs ${st === 'ANULADA' ? 'opacity-50' : ''}">
        <td class="px-4 py-3"><span class="font-mono font-bold text-blue-600">${escapeHtml(s.id)}</span>${s.invoice ? `<span class="block text-[10px] font-mono text-slate-400">${escapeHtml(s.invoice.fullNumber)}</span>` : ''}</td>
        <td class="px-4 py-3"><div class="flex items-center gap-2.5">${avatar(s.customerName, 'w-8 h-8 text-[11px]')}<span class="text-slate-800">${escapeHtml(s.customerName)}</span></div></td>
        <td class="px-4 py-3 text-slate-500">${escapeHtml(s.dateFormatted)}</td>
        <td class="px-4 py-3 text-slate-600">${escapeHtml(s.paymentMethod ? paymentLabel(s.paymentMethod) : '—')}</td>
        <td class="px-4 py-3"><span class="inline-flex px-2 py-0.5 rounded-md border text-[11px] font-semibold ${BILLING_LABELS[st].tone}">${BILLING_LABELS[st].text}</span></td>
        <td class="px-4 py-3 text-right font-bold text-slate-900">${formatCurrency(s.totals.total)}</td>
        <td class="px-4 py-3 text-center">${st === 'ANULADA' ? '<span class="text-slate-300">—</span>' : `<button data-receipt="${escapeHtml(s.id)}" class="text-blue-600 hover:underline font-semibold">${st === 'EMITIDO' ? 'Ver comprobante' : 'Cobrar y facturar'}</button>`}</td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('[data-receipt]').forEach(b => { b.onclick = () => this.app.checkout.open(b.dataset.receipt); });
    renderPager('historyPager', { total: visible.length, page, size: PAGE_SIZE, onPage: (n) => { HistoryController.page = n; this.render(); } });
  }

  /** Compatibilidad: el comprobante ahora se ve en la ventana de cobro y facturación. */
  openReceiptModal(sale) {
    this.app.checkout.open(sale.id);
  }
}
