/**
 * @file billingController.js
 * @description Módulo "Facturación": ventas por cobrar, por facturar y comprobantes emitidos.
 */

import { ConfirmDialog } from '../../components/modal.js';
import { avatar, chipsHtml, normalize, paginate, renderPager } from '../../components/uiKit.js';
import { formatCurrency, escapeHtml } from '../../utils/formatters.js';
import { billingState, BILLING_LABELS } from './saleStatus.js';

const PAGE_SIZE = 10;

export class BillingController {
  static filter = 'TODOS';
  static page = 1;

  constructor(app) {
    this.app = app;
  }

  render() {
    const sales = this.app.state.storage.get('sales', []);
    const by = (st) => sales.filter(s => billingState(s) === st);
    const pending = by('PENDIENTE'), toIssue = by('POR_EMITIR'), issued = by('EMITIDO'), cancelled = by('ANULADA');
    const sum = (list) => list.reduce((a, s) => a + s.totals.total, 0);
    const boletas = issued.filter(s => s.invoice.type === 'BOLETA').length;

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.innerText = v; };
    set('billKpiPending', pending.length); set('billKpiPendingSub', `${formatCurrency(sum(pending))} por cobrar`);
    set('billKpiToIssue', toIssue.length); set('billKpiToIssueSub', `${formatCurrency(sum(toIssue))} sin comprobante`);
    set('billKpiIssued', issued.length); set('billKpiIssuedSub', `${boletas} boletas · ${issued.length - boletas} facturas`);
    set('billKpiTotal', formatCurrency(sum(issued)));
    set('billKpiTotalSub', `IGV: ${formatCurrency(issued.reduce((a, s) => a + s.totals.taxAmount, 0))}`);

    const chips = [
      { key: 'TODOS', label: `Todas (${sales.length})` },
      { key: 'PENDIENTE', label: `Pendientes de cobro (${pending.length})` },
      { key: 'POR_EMITIR', label: `Por emitir comprobante (${toIssue.length})` },
      { key: 'EMITIDO', label: `Emitidos (${issued.length})` },
      ...(cancelled.length ? [{ key: 'ANULADA', label: `Anuladas (${cancelled.length})` }] : [])
    ];
    const chipBox = document.getElementById('billChips');
    chipBox.innerHTML = chipsHtml(chips, BillingController.filter);
    chipBox.onclick = (e) => {
      const c = e.target.closest('[data-chip]');
      if (c) { BillingController.filter = c.dataset.chip; BillingController.page = 1; this.render(); }
    };
    const search = document.getElementById('billSearchInput');
    search.oninput = () => { BillingController.page = 1; this.render(); };

    const q = normalize(search.value).trim();
    const visible = sales.filter(s =>
      (BillingController.filter === 'TODOS' || billingState(s) === BillingController.filter) &&
      (!q || normalize(`${s.id} ${s.customerName} ${s.invoice?.fullNumber || ''}`).includes(q)));

    set('billCounter', `${visible.length} de ${sales.length} ventas`);
    const tbody = document.getElementById('billTbody');
    if (visible.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-12 text-center text-slate-400">${sales.length === 0 ? 'Aún no hay ventas. Registra una venta o importa un CSV.' : 'No hay ventas con este filtro.'}</td></tr>`;
      renderPager('billPager', { total: 0, page: 1, size: PAGE_SIZE, onPage() {} });
      return;
    }
    const { items, page } = paginate(visible, BillingController.page, PAGE_SIZE);
    BillingController.page = page;

    const isAdmin = this.app.getCurrentRole() === 'ADMINISTRADOR';
    tbody.innerHTML = items.map(s => {
      const st = billingState(s);
      const label = BILLING_LABELS[st];
      const action = st === 'PENDIENTE'
        ? `<button data-bill-open="${escapeHtml(s.id)}" class="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">Cobrar y facturar</button>${isAdmin ? ` <button data-bill-cancel="${escapeHtml(s.id)}" class="px-2.5 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold">Anular</button>` : ''}`
        : st === 'POR_EMITIR' ? `<button data-bill-open="${escapeHtml(s.id)}" class="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white font-semibold">Emitir comprobante</button>`
        : st === 'EMITIDO' ? `<button data-bill-open="${escapeHtml(s.id)}" class="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold">Ver comprobante</button>`
        : '<span class="text-slate-300">—</span>';
      return `
      <tr class="border-b border-slate-100 hover:bg-slate-50 text-xs ${st === 'ANULADA' ? 'opacity-50' : ''}">
        <td class="px-4 py-3"><span class="font-mono font-bold text-blue-600">${escapeHtml(s.id)}</span><span class="block text-[11px] text-slate-400">${escapeHtml(s.sellerName || '')}</span></td>
        <td class="px-4 py-3"><div class="flex items-center gap-2.5">${avatar(s.customerName, 'w-8 h-8 text-[11px]')}<span class="font-medium text-slate-800">${escapeHtml(s.customerName)}</span></div></td>
        <td class="px-4 py-3 text-slate-500">${escapeHtml(s.dateFormatted)}</td>
        <td class="px-4 py-3"><span class="inline-flex px-2 py-0.5 rounded-md border text-[11px] font-semibold ${label.tone}">${label.text}</span></td>
        <td class="px-4 py-3 font-mono text-slate-600">${s.invoice ? `<span class="font-bold text-slate-800">${escapeHtml(s.invoice.fullNumber)}</span><span class="block text-[10px] text-slate-400">${s.invoice.type === 'FACTURA' ? 'Factura' : 'Boleta'}</span>` : '<span class="text-slate-300">—</span>'}</td>
        <td class="px-4 py-3 text-right font-mono font-bold text-slate-900">${formatCurrency(s.totals.total)}</td>
        <td class="px-4 py-3 text-center whitespace-nowrap">${action}</td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('[data-bill-open]').forEach(b => { b.onclick = () => this.app.checkout.open(b.dataset.billOpen); });
    tbody.querySelectorAll('[data-bill-cancel]').forEach(b => {
      b.onclick = async () => {
        const ok = await ConfirmDialog.ask({
          title: 'Anular venta', message: `La venta ${b.dataset.billCancel} se anulará y el stock reservado volverá al inventario.`,
          confirmText: 'Anular venta', tone: 'danger'
        });
        if (!ok) return;
        try { await this.app.state.api.cancelSale(b.dataset.billCancel); this.app.showToast('Venta anulada y stock devuelto.', 'info'); this.app.render(); }
        catch (err) { this.app.showToast(err.message, 'error'); }
      };
    });
    renderPager('billPager', { total: visible.length, page, size: PAGE_SIZE, onPage: (n) => { BillingController.page = n; this.render(); } });
  }
}
