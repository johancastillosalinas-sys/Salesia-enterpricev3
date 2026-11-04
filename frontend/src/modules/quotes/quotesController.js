/**
 * @file quotesController.js
 * @description Página "Cotizaciones": listado y conversión a venta.
 * La cotización nueva se crea en la ventana emergente (DocModal).
 */

import { ConfirmDialog } from '../../components/modal.js';
import { avatar, normalize } from '../../components/uiKit.js';
import { formatCurrency, formatDate, escapeHtml } from '../../utils/formatters.js';

export class QuotesController {
  constructor(app) {
    this.app = app;
  }

  render() {
    const btnNew = document.getElementById('btnNewQuote');
    if (btnNew) btnNew.onclick = () => this.app.docModal.open('quote');
    const search = document.getElementById('quotesSearchInput');
    if (search) search.oninput = () => this.render();

    const all = this.app.state.quoteEngine.getQuotes();
    const query = normalize(search?.value || '').trim();
    const quotes = all.filter(q => !query || normalize(`${q.id} ${q.customerName} ${q.status}`).includes(query));

    const set = (id, text) => { const el = document.getElementById(id); if (el) el.innerText = text; };
    set('quotesKpiOpen', all.filter(q => q.status !== 'CONVERTIDA').length);
    set('quotesKpiConverted', all.filter(q => q.status === 'CONVERTIDA').length);
    set('quotesKpiAmount', formatCurrency(all.filter(q => q.status !== 'CONVERTIDA').reduce((a, q) => a + q.totals.total, 0)));

    const tbody = document.getElementById('quotesTableTbody');
    if (!tbody) return;

    if (quotes.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-12 text-center text-slate-400">
        ${all.length === 0 ? 'Aún no hay cotizaciones. Pulsa “Nueva cotización” para crear la primera.' : 'Ninguna cotización coincide con la búsqueda.'}</td></tr>`;
      return;
    }

    tbody.innerHTML = quotes.map(q => `
      <tr class="border-b border-slate-100 hover:bg-slate-50 text-xs">
        <td class="px-4 py-3 font-semibold text-cyan-600 font-mono">${escapeHtml(q.id)}</td>
        <td class="px-4 py-3"><div class="flex items-center gap-2.5">${avatar(q.customerName, 'w-8 h-8 text-[11px]')}<span class="font-medium text-slate-800">${escapeHtml(q.customerName)}</span></div></td>
        <td class="px-4 py-3 text-slate-500">${formatDate(q.createdAt)}</td>
        <td class="px-4 py-3 text-center">${q.items.length}</td>
        <td class="px-4 py-3 text-right font-bold font-mono text-slate-900">${formatCurrency(q.totals.total)}</td>
        <td class="px-4 py-3 text-center">
          <span class="inline-flex px-2 py-0.5 rounded text-[11px] font-semibold ${q.status === 'CONVERTIDA' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-sky-50 text-sky-700 border border-sky-200'}">${escapeHtml(q.status)}</span>
          ${q.convertedToSaleId ? `<span class="block text-[10px] text-emerald-600 font-mono">${escapeHtml(q.convertedToSaleId)}</span>` : ''}
        </td>
        <td class="px-4 py-3 text-center">
          ${q.status !== 'CONVERTIDA'
            ? `<button data-convert-quote="${escapeHtml(q.id)}" class="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs">Convertir a venta</button>`
            : '<span class="text-slate-400">Consolidada</span>'}
        </td>
      </tr>`).join('');

    tbody.querySelectorAll('[data-convert-quote]').forEach(btn => {
      btn.onclick = async () => {
        const qId = btn.dataset.convertQuote;
        const ok = await ConfirmDialog.ask({
          title: 'Convertir a venta',
          message: `La cotización ${qId} se registrará como venta (descuenta el stock) y pasarás al cobro y la facturación.`,
          confirmText: 'Convertir y cobrar'
        });
        if (!ok) return;
        try {
          const { saleCommand } = this.app.state.quoteEngine.prepareConversionToSale(qId, 'TRANSFERENCIA');
          btn.disabled = true;
          const sale = await this.app.state.api.createSale(saleCommand);
          this.app.state.quoteEngine.markAsConverted(qId, sale.id);
          this.render();
          this.app.checkout.open(sale.id);
        } catch (err) {
          btn.disabled = false;
          this.app.showToast(`Error: ${err.message}`, 'error');
        }
      };
    });
  }
}
