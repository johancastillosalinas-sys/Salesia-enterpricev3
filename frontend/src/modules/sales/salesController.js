/**
 * @file salesController.js
 * @description Página "Ventas": indicadores, búsqueda y últimas ventas.
 * La venta nueva se crea en la ventana emergente (DocModal).
 */

import { formatCurrency, escapeHtml } from '../../utils/formatters.js';
import { isProductActive } from '../products/productsView.js';
import { normalize, avatar } from '../../components/uiKit.js';
import { paymentLabel } from './payments.js';
import { canAccess } from '../../app/permissions.js';
import { isPaid, billingState, BILLING_LABELS } from '../billing/saleStatus.js';

const RECENT_LIMIT = 10;
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export class PosController {
  constructor(app) {
    this.app = app;
  }

  render() {
    const sales = this.app.state.storage.get('sales', []);
    const paidSales = sales.filter(isPaid);
    const now = new Date();

    const today = paidSales.filter(s => sameDay(new Date(s.timestamp), now));
    const month = paidSales.filter(s => {
      const d = new Date(s.timestamp);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });
    const sum = list => list.reduce((acc, s) => acc + s.totals.total, 0);
    const pending = sales.filter(s => billingState(s) === 'PENDIENTE');

    const set = (id, text) => { const el = document.getElementById(id); if (el) el.innerText = text; };
    set('posKpiToday', today.length);
    set('posKpiTodayAmount', formatCurrency(sum(today)));
    set('posKpiMonth', formatCurrency(sum(month)));
    set('posKpiMonthCount', `${month.length} ventas en el mes`);
    set('posKpiOut', pending.length);
    set('posKpiOutSub', `${formatCurrency(pending.reduce((a, s) => a + s.totals.total, 0))} por cobrar`);

    const btnNew = document.getElementById('btnNewSale');
    if (btnNew) btnNew.onclick = () => this.app.docModal.open('sale');
    const search = document.getElementById('posSearchInput');
    if (search) search.oninput = () => this.render();

    this.#renderRecent(sales, normalize(search?.value || '').trim());
  }

  #renderRecent(sales, query) {
    const tbody = document.getElementById('posRecentTbody');
    if (!tbody) return;

    const matches = sales.filter(s => !query ||
      normalize(`${s.id} ${s.customerName} ${s.sellerName} ${s.invoice?.fullNumber || ''}`).includes(query));
    const rows = matches.slice(0, RECENT_LIMIT);

    const caption = document.getElementById('posRecentCaption');
    if (caption) caption.innerText = query
      ? `${matches.length} resultado${matches.length === 1 ? '' : 's'}`
      : `Las ${Math.min(RECENT_LIMIT, sales.length)} más recientes de ${sales.length}`;

    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-12 text-center text-slate-400">
        ${sales.length === 0 ? 'Todavía no hay ventas. Pulsa “Nueva venta” para registrar la primera.' : 'Ninguna venta coincide con la búsqueda.'}</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map(s => `
      <tr class="border-b border-slate-100 hover:bg-slate-50 text-xs">
        <td class="px-4 py-3 font-mono font-bold text-blue-600">${escapeHtml(s.id)}</td>
        <td class="px-4 py-3"><div class="flex items-center gap-2.5">${avatar(s.customerName, 'w-8 h-8 text-[11px]')}<span class="font-medium text-slate-800">${escapeHtml(s.customerName)}</span></div></td>
        <td class="px-4 py-3 text-slate-500">${escapeHtml(s.sellerName || '—')}</td>
        <td class="px-4 py-3 text-slate-500">${escapeHtml(s.dateFormatted)}</td>
        <td class="px-4 py-3"><span class="inline-flex px-2 py-0.5 rounded-md border text-[11px] font-semibold ${BILLING_LABELS[billingState(s)].tone}">${BILLING_LABELS[billingState(s)].text}</span></td>
        <td class="px-4 py-3 text-right font-bold text-slate-900">${formatCurrency(s.totals.total)}</td>
        <td class="px-4 py-3 text-center">${billingState(s) === 'ANULADA' ? '<span class="text-slate-300">—</span>' : `<button data-receipt="${escapeHtml(s.id)}" class="text-blue-600 hover:underline font-semibold">${billingState(s) === 'EMITIDO' ? 'Ver comprobante' : 'Cobrar y facturar'}</button>`}</td>
      </tr>`).join('');

    tbody.querySelectorAll('[data-receipt]').forEach(b => {
      b.onclick = () => {
        this.app.checkout.open(b.dataset.receipt);
      };
    });

    const link = document.getElementById('posHistoryLink');
    if (link) link.classList.toggle('hidden', !canAccess(this.app.getCurrentRole(), 'history'));
  }
}
