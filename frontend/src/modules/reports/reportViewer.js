/**
 * @file reportViewer.js
 * @description Vista previa de un reporte como documento, con filtro de período y descarga
 * en PDF (impresión del documento) o Excel (CSV). Se abre desde cualquier módulo.
 */

import { Modal } from '../../components/modal.js';
import { icon, chipsHtml } from '../../components/uiKit.js';
import { printModal, downloadText } from '../../utils/print.js';
import { escapeHtml } from '../../utils/formatters.js';
import { buildReport } from './reportBuilder.js';
import { renderReportHtml, reportToCsv } from './reportDocument.js';
import { REPORT_TYPES, canViewReport } from './reportTypes.js';

const $ = (id) => document.getElementById(id);
const PRESETS = [{ key: 'todo', label: 'Todo' }, { key: 'hoy', label: 'Hoy' }, { key: '7d', label: 'Últimos 7 días' }, { key: '30d', label: 'Últimos 30 días' }, { key: 'mes', label: 'Este mes' }];
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
const toInput = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10).replace(/./, c => c) : '');
const localInput = (ms) => { if (!ms) return ''; const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export class ReportViewer {
  constructor(app) {
    this.app = app;
    this.type = null;
    this.preset = 'todo';
    this.range = {};
    this.report = null;
  }

  open(type, preset = 'todo') {
    const user = this.app.state.storage.get('currentUser', {});
    if (!canViewReport(user.role, type)) { this.app.showToast('Tu rol no tiene acceso a este reporte.', 'warning'); return; }
    this.type = type;
    this.#setPreset(preset);
    this.#renderShell();
    this.#renderPaper();
    Modal.open('reportModal');
    $('reportModal').scrollTop = 0;
    $('reportPanel').scrollTop = 0;
  }

  #setPreset(key) {
    this.preset = key;
    const now = new Date();
    if (key === 'todo') this.range = {};
    else if (key === 'hoy') this.range = { from: startOfDay(now), to: endOfDay(now) };
    else if (key === '7d') this.range = { from: startOfDay(new Date(now.getTime() - 6 * 86400000)), to: endOfDay(now) };
    else if (key === '30d') this.range = { from: startOfDay(new Date(now.getTime() - 29 * 86400000)), to: endOfDay(now) };
    else if (key === 'mes') this.range = { from: new Date(now.getFullYear(), now.getMonth(), 1).getTime(), to: endOfDay(now) };
  }

  #renderShell() {
    const def = REPORT_TYPES[this.type];
    $('reportPanel').innerHTML = `
      <div class="no-print sticky top-0 z-10 bg-white border-b border-slate-200 rounded-t-2xl px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div class="flex items-center gap-2.5 mr-auto">
          <span class="w-9 h-9 rounded-xl bg-slate-900 text-white inline-flex items-center justify-center">${icon(def.icon, 'w-5 h-5')}</span>
          <div><p class="text-sm font-extrabold text-slate-900 leading-tight">${escapeHtml(def.title)}</p><p class="text-[11px] text-slate-400 leading-tight">Vista previa · revisa antes de descargar</p></div>
        </div>
        <button type="button" id="rpPdf" class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold" title="En la ventana de impresión elige &quot;Guardar como PDF&quot;">${icon('download', 'w-4 h-4')} Descargar PDF</button>
        <button type="button" id="rpCsv" class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold">${icon('download', 'w-4 h-4')} Descargar Excel (CSV)</button>
        <button type="button" id="rpClose" class="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Cerrar">${icon('close')}</button>
        <div class="basis-full flex flex-wrap items-center gap-2">
          <span class="text-[11px] font-semibold text-slate-500 mr-1">Período:</span>
          <div id="rpPresets" class="flex flex-wrap gap-1.5">${chipsHtml(PRESETS, this.preset)}</div>
          <span class="ml-2 text-[11px] text-slate-400">o</span>
          <input type="date" id="rpFrom" class="text-xs px-2 py-1.5 rounded-lg border border-slate-200" value="${localInput(this.range.from)}" aria-label="Desde">
          <span class="text-[11px] text-slate-400">a</span>
          <input type="date" id="rpTo" class="text-xs px-2 py-1.5 rounded-lg border border-slate-200" value="${localInput(this.range.to)}" aria-label="Hasta">
        </div>
      </div>
      <div class="print-scroll p-3 sm:p-6"><div id="rpPaperHost"></div></div>`;

    $('rpClose').onclick = () => Modal.close('reportModal');
    $('rpPdf').onclick = () => printModal('reportModal');
    $('rpCsv').onclick = () => downloadText(`${this.report.code}.csv`, reportToCsv(this.report));
    $('rpPresets').onclick = (e) => {
      const chip = e.target.closest('[data-chip]');
      if (!chip) return;
      this.#setPreset(chip.dataset.chip);
      $('rpPresets').innerHTML = chipsHtml(PRESETS, this.preset);
      $('rpFrom').value = localInput(this.range.from);
      $('rpTo').value = localInput(this.range.to);
      this.#renderPaper();
    };
    const custom = () => {
      const f = $('rpFrom').value, t = $('rpTo').value;
      this.preset = 'custom';
      this.range = { from: f ? startOfDay(new Date(`${f}T00:00:00`)) : undefined, to: t ? endOfDay(new Date(`${t}T00:00:00`)) : undefined };
      $('rpPresets').innerHTML = chipsHtml(PRESETS, '');
      this.#renderPaper();
    };
    $('rpFrom').onchange = custom;
    $('rpTo').onchange = custom;
  }

  #renderPaper() {
    const st = this.app.state.storage;
    this.report = buildReport(this.type, { storage: st, range: this.range, user: st.get('currentUser', {}) });
    $('rpPaperHost').innerHTML = renderReportHtml(this.report);
  }
}
