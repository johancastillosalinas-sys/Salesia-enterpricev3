/**
 * @file customersView.js
 * @description Vista y gestión del catálogo de clientes conforme a RF-03:
 * listado con búsqueda, alta, edición y desactivación (baja lógica).
 */

import { escapeHtml, formatCurrency } from '../../utils/formatters.js';
import { avatar, segmentBadge, paginate, renderPager, normalize } from '../../components/uiKit.js';

const PAGE_SIZE = 10;

export function isCustomerActive(customer) {
  // Los clientes del seed inicial no tienen "status": se consideran activos.
  return (customer.status || 'ACTIVE') === 'ACTIVE';
}

export class CustomersView {
  static page = 1;
  static segment = '';

  /**
   * @param {Array} customers Lista completa de clientes
   * @param {{onEdit?:Function,onToggle?:Function}} handlers Acciones por fila
   */
  static render(customers = [], handlers = {}, tbodyId = 'customersTableTbody') {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    const text = normalize(document.getElementById('customersSearchInput')?.value || '').trim();
    const showInactive = !!document.getElementById('customersShowInactive')?.checked;

    const visible = customers.filter(c => {
      if (!showInactive && !isCustomerActive(c)) return false;
      if (CustomersView.segment && c.segment !== CustomersView.segment) return false;
      if (!text) return true;
      return [c.id, c.name, c.docNumber, c.email, c.segment].some(v => normalize(v).includes(text));
    });

    // Indicadores de la parte superior
    const activos = customers.filter(isCustomerActive);
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.innerText = v; };
    set('customersKpiTotal', customers.length);
    set('customersKpiActive', activos.length);
    set('customersKpiCorp', activos.filter(c => c.segment === 'Corporativo').length);
    set('customersKpiCredit', formatCurrency(activos.reduce((a, c) => a + (Number(c.creditLimit) || 0), 0)));
    set('customersCounter', `${visible.length} mostrados · ${activos.length} activos de ${customers.length}`);

    if (visible.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-12 text-center text-slate-400">${
        customers.length === 0 ? 'Sin clientes registrados. Pulsa “Nuevo cliente”.' : 'Ningún cliente coincide con el filtro.'
      }</td></tr>`;
      renderPager('customersPager', { total: 0, page: 1, size: PAGE_SIZE, onPage() {} });
      return;
    }

    const { items, page } = paginate(visible, CustomersView.page, PAGE_SIZE);
    CustomersView.page = page;

    tbody.innerHTML = items.map(c => {
      const active = isCustomerActive(c);
      return `
      <tr class="border-b border-slate-100 hover:bg-slate-50 text-xs ${active ? '' : 'opacity-60'}">
        <td class="px-4 py-3">
          <div class="flex items-center gap-3">
            ${avatar(c.name)}
            <div class="min-w-0">
              <p class="font-semibold text-slate-900 truncate">${escapeHtml(c.name)}</p>
              <p class="text-[11px] text-slate-400 font-mono">${escapeHtml(c.id)}</p>
            </div>
          </div>
        </td>
        <td class="px-4 py-3 font-mono text-slate-600">${escapeHtml(c.docType)} ${escapeHtml(c.docNumber)}</td>
        <td class="px-4 py-3">${segmentBadge(c.segment)}</td>
        <td class="px-4 py-3 text-slate-500">${escapeHtml(c.email)}<span class="block text-[11px] text-slate-400">${escapeHtml(c.phone || '')}</span></td>
        <td class="px-4 py-3 text-right font-mono font-bold text-slate-900">${formatCurrency(c.creditLimit)}</td>
        <td class="px-4 py-3 text-center">
          <span class="inline-flex px-2 py-0.5 rounded text-[11px] font-bold ${active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}">${active ? 'Activo' : 'Inactivo'}</span>
        </td>
        <td class="px-4 py-3 text-center whitespace-nowrap">
          <button data-cust-edit="${escapeHtml(c.id)}" class="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold">Editar</button>
          <button data-cust-toggle="${escapeHtml(c.id)}" class="px-2.5 py-1 rounded font-semibold ${active ? 'bg-rose-50 hover:bg-rose-100 text-rose-700' : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'}">${active ? 'Desactivar' : 'Reactivar'}</button>
        </td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('[data-cust-edit]').forEach(b => { b.onclick = () => handlers.onEdit?.(b.getAttribute('data-cust-edit')); });
    tbody.querySelectorAll('[data-cust-toggle]').forEach(b => { b.onclick = () => handlers.onToggle?.(b.getAttribute('data-cust-toggle')); });

    renderPager('customersPager', {
      total: visible.length, page, size: PAGE_SIZE,
      onPage: (n) => { CustomersView.page = n; handlers.onPage?.(); }
    });
  }

    /** Llena un <select> con los clientes activos (conserva la selección actual). */
  static fillSelect(selectId, customers = []) {
    const select = document.getElementById(selectId);
    if (!select) return;
    const prev = select.value;
    const active = customers.filter(isCustomerActive);
    select.innerHTML = active.map(c =>
      `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)} (${escapeHtml(c.docType)} ${escapeHtml(c.docNumber)})</option>`
    ).join('');
    if (active.some(c => c.id === prev)) select.value = prev;
  }

  /** Abre el modal en modo "nuevo" (customer = null) o "editar". */
  static openForm(customer = null) {
    const modal = document.getElementById('customerModal');
    if (!modal) return;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };

    set('customerFormId', customer?.id || '');
    set('customerFormDocType', customer?.docType || 'RUC');
    set('customerFormDocNumber', customer?.docNumber);
    set('customerFormName', customer?.name);
    set('customerFormSegment', customer?.segment || 'Pyme');
    set('customerFormEmail', customer?.email);
    set('customerFormPhone', customer?.phone);
    set('customerFormCredit', customer?.creditLimit ?? 10000);

    const title = document.getElementById('customerModalTitle');
    if (title) title.innerText = customer ? `Editar cliente ${customer.id}` : 'Nuevo cliente';
    CustomersView.setFormError('');
    modal.classList.remove('hidden');
    document.getElementById('customerFormName')?.focus();
  }

  static closeForm() {
    document.getElementById('customerModal')?.classList.add('hidden');
  }

  static setFormError(message) {
    const el = document.getElementById('customerFormError');
    if (!el) return;
    el.innerText = message || '';
    el.classList.toggle('hidden', !message);
  }

  static readForm() {
    const val = id => document.getElementById(id)?.value ?? '';
    return {
      id: val('customerFormId'),
      docType: val('customerFormDocType'),
      docNumber: val('customerFormDocNumber'),
      name: val('customerFormName'),
      segment: val('customerFormSegment'),
      email: val('customerFormEmail'),
      phone: val('customerFormPhone'),
      creditLimit: val('customerFormCredit')
    };
  }
}