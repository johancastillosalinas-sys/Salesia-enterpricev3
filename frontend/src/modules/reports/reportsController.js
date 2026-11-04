/**
 * @file reportsController.js
 * @description Página "Reportes": catálogo de reportes disponibles para tu rol.
 * Cada tarjeta abre la vista previa (ReportViewer) antes de descargar.
 */

import { icon } from '../../components/uiKit.js';
import { escapeHtml } from '../../utils/formatters.js';
import { REPORT_TYPES, canViewReport } from './reportTypes.js';

export class ReportsController {
  constructor(app) {
    this.app = app;
  }

  render() {
    const role = this.app.getCurrentRole();
    const box = document.getElementById('reportsCatalog');
    if (!box) return;
    box.innerHTML = Object.entries(REPORT_TYPES).filter(([k]) => canViewReport(role, k)).map(([key, r]) => `
      <div class="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 flex flex-col kpi-card">
        <span class="w-11 h-11 rounded-xl bg-slate-900 text-white inline-flex items-center justify-center mb-3">${icon(r.icon, 'w-6 h-6')}</span>
        <h4 class="font-bold text-slate-900 text-sm">${escapeHtml(r.title)}</h4>
        <p class="text-xs text-slate-500 mt-1 flex-1 leading-relaxed">${escapeHtml(r.desc)}</p>
        <button data-report="${key}" class="mt-4 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-900 hover:text-white text-slate-700 text-xs font-semibold transition-colors">Ver vista previa</button>
      </div>`).join('');
  }
}
