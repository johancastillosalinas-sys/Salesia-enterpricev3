/**
 * @file auditController.js
 * @description Auditoría de operaciones (RF-22).
 * Recibe la aplicación (`app`) para usar su estado, API y avisos.
 */

import { escapeHtml } from '../../utils/formatters.js';

export class AuditController {
  constructor(app) {
    this.app = app;
  }

  async render() {
    const logs = await this.app.state.api.getAuditLogs();
    const tbody = document.getElementById('auditTableTbody');
    if (!tbody) return;

    // Llenar selectores con los valores existentes (conservando la selección actual)
    const fillSelect = (id, label, values) => {
      const sel = document.getElementById(id);
      if (!sel) return;
      const prev = sel.value;
      sel.innerHTML = `<option value="">${label}</option>` +
        values.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
      if (values.includes(prev)) sel.value = prev;
    };
    fillSelect('auditActionFilter', 'Todas las acciones', [...new Set(logs.map(l => l.action))].sort());
    fillSelect('auditRoleFilter', 'Todos los roles', [...new Set(logs.map(l => l.userRole))].sort());

    // Leer filtros
    const text = (document.getElementById('auditSearchInput')?.value || '').trim().toLowerCase();
    const action = document.getElementById('auditActionFilter')?.value || '';
    const role = document.getElementById('auditRoleFilter')?.value || '';
    const fromVal = document.getElementById('auditDateFrom')?.value || '';
    const toVal = document.getElementById('auditDateTo')?.value || '';
    const from = fromVal ? new Date(`${fromVal}T00:00:00`).getTime() : null;
    const to = toVal ? new Date(`${toVal}T23:59:59.999`).getTime() : null;

    const visible = logs.filter(l => {
      if (action && l.action !== action) return false;
      if (role && l.userRole !== role) return false;
      if (from !== null && !(l.timestamp >= from)) return false;
      if (to !== null && !(l.timestamp <= to)) return false;
      if (text) {
        const hay = [l.action, l.entity, l.details, l.userId, l.userRole]
          .some(v => String(v || '').toLowerCase().includes(text));
        if (!hay) return false;
      }
      return true;
    });

    const counter = document.getElementById('auditCounter');
    if (counter) counter.innerText = `${visible.length} de ${logs.length} registros`;

    // Conectar eventos de filtros
    const rerender = () => this.render();
    const search = document.getElementById('auditSearchInput');
    if (search) search.oninput = rerender;
    ['auditActionFilter', 'auditRoleFilter', 'auditDateFrom', 'auditDateTo'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.onchange = rerender;
    });
    const btnClear = document.getElementById('btnAuditClear');
    if (btnClear) {
      btnClear.onclick = () => {
        ['auditSearchInput', 'auditActionFilter', 'auditRoleFilter', 'auditDateFrom', 'auditDateTo'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.value = '';
        });
        rerender();
      };
    }

    if (visible.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-8 text-center text-slate-400 text-xs">${
        logs.length === 0 ? 'Sin registros de auditoría.' : 'Ningún registro coincide con los filtros.'
      }</td></tr>`;
      return;
    }

    tbody.innerHTML = visible.map(l => `
      <tr class="border-b border-slate-100 hover:bg-slate-50 text-xs">
        <td class="px-4 py-3 font-mono text-slate-400">${escapeHtml(l.dateFormatted)}</td>
        <td class="px-4 py-3 font-bold text-blue-700">${escapeHtml(l.action)}</td>
        <td class="px-4 py-3 font-mono text-cyan-800">${escapeHtml(l.entity)}</td>
        <td class="px-4 py-3 font-medium text-slate-600">${escapeHtml(l.userRole)} (${escapeHtml(l.userId)})</td>
        <td class="px-4 py-3 text-slate-700">${escapeHtml(l.details)}</td>
      </tr>
    `).join('');
  }
}