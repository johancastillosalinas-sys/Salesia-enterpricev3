/**
 * @file reportDocument.js
 * @description Dibuja un reporte como documento (hoja A4) y lo exporta a CSV.
 */

import { formatCurrency, escapeHtml } from '../../utils/formatters.js';
import { csvEscape } from '../importer/csvParser.js';

const fmtDate = (ms) => (ms ? new Date(ms).toLocaleDateString('es-PE') : '—');
const fmtDateTime = (ms) => (ms ? new Date(ms).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }) : '—');

export function formatValue(type, v) {
  if (v === null || v === undefined || v === '') return '—';
  switch (type) {
    case 'money': return formatCurrency(v);
    case 'int': return Number(v).toLocaleString('es-PE');
    case 'pct': return `${Number(v).toFixed(1)}%`;
    case 'date': return fmtDate(v);
    case 'datetime': return fmtDateTime(v);
    default: return String(v);
  }
}

const isNum = (t) => ['money', 'int', 'pct'].includes(t);

function renderKpis(sec) {
  return `<div class="grid grid-cols-4 gap-2.5 mb-6 doc-block">${sec.items.map(k => `
    <div class="border border-slate-300 rounded-lg px-3 py-2.5">
      <p class="text-[10px] uppercase tracking-wide text-slate-500 leading-tight">${escapeHtml(k.label)}</p>
      <p class="text-[17px] font-extrabold font-mono leading-tight mt-1">${escapeHtml(formatValue(k.type, k.value))}</p>
      ${k.sub ? `<p class="text-[10px] text-slate-400 mt-0.5">${escapeHtml(k.sub)}</p>` : ''}
    </div>`).join('')}</div>`;
}

function renderBars(sec) {
  if (!sec.rows.length) return `<div class="mb-6 doc-block"><h3 class="text-[13px] font-extrabold mb-2">${escapeHtml(sec.title)}</h3><p class="text-slate-400 text-[11px]">Sin datos en el período.</p></div>`;
  const max = Math.max(...sec.rows.map(r => r.value), 1);
  return `<div class="mb-6 doc-block"><h3 class="text-[13px] font-extrabold mb-2">${escapeHtml(sec.title)}</h3>
    <div class="space-y-1.5">${sec.rows.map(r => `
      <div class="flex items-center gap-2 text-[11px]">
        <span class="w-36 shrink-0 truncate text-slate-700" title="${escapeHtml(r.label)}">${escapeHtml(r.label)}</span>
        <span class="flex-1 h-3.5 bg-slate-100 rounded-sm overflow-hidden"><span class="block h-full bg-slate-800 rounded-sm" style="width:${Math.max(1.5, r.value / max * 100)}%"></span></span>
        <span class="w-28 shrink-0 text-right font-mono font-semibold">${escapeHtml(formatValue(sec.type, r.value))}</span>
        ${r.extra ? `<span class="w-16 shrink-0 text-right text-slate-400 text-[10px]">${escapeHtml(r.extra)}</span>` : ''}
      </div>`).join('')}</div></div>`;
}

function renderTable(sec) {
  const limit = sec.limit || Infinity;
  const shown = sec.rows.slice(0, limit);
  const head = sec.columns.map(c => `<th class="py-1.5 px-2 ${isNum(c.type) ? 'text-right' : 'text-left'} font-bold text-[10px] uppercase tracking-wide">${escapeHtml(c.label)}</th>`).join('');
  const body = shown.length === 0
    ? `<tr><td colspan="${sec.columns.length}" class="py-4 text-center text-slate-400">${escapeHtml(sec.empty || 'Sin datos en el período.')}</td></tr>`
    : shown.map((r, i) => `<tr class="${i % 2 ? 'bg-slate-50' : ''}">${sec.columns.map(c => `<td class="py-1.5 px-2 ${isNum(c.type) ? 'text-right font-mono' : ''} border-b border-slate-100">${escapeHtml(formatValue(c.type, r[c.key]))}</td>`).join('')}</tr>`).join('');
  const totals = sec.totals && shown.length
    ? `<tr class="font-extrabold border-t-2 border-slate-900">${sec.columns.map(c => `<td class="py-2 px-2 ${isNum(c.type) ? 'text-right font-mono' : ''}">${sec.totals[c.key] !== undefined ? escapeHtml(formatValue(c.type, sec.totals[c.key])) : ''}</td>`).join('')}</tr>` : '';
  return `<div class="mb-6"><div class="flex items-baseline justify-between mb-2"><h3 class="text-[13px] font-extrabold">${escapeHtml(sec.title)}</h3><span class="text-[10px] text-slate-400">${sec.rows.length.toLocaleString('es-PE')} registro${sec.rows.length === 1 ? '' : 's'}</span></div>
    <table class="text-[11px]"><thead><tr class="bg-slate-900 text-white">${head}</tr></thead><tbody>${body}${totals}</tbody></table>
    ${sec.rows.length > limit ? `<p class="mt-1.5 text-[10px] text-amber-700">Se muestran los primeros ${limit} de ${sec.rows.length.toLocaleString('es-PE')} registros. El archivo Excel (CSV) incluye todos.</p>` : ''}</div>`;
}

export function renderReportHtml(report) {
  const c = report.company || {};
  const body = report.sections.map(s => (s.kind === 'kpis' ? renderKpis(s) : s.kind === 'bars' ? renderBars(s) : renderTable(s))).join('');
  const gen = new Date(report.generatedAt);
  return `
  <div id="reportPaper" class="doc-sheet mx-auto max-w-[860px] p-10 border border-slate-200 shadow-sm">
    <div class="flex items-start justify-between gap-6 pb-4 border-b-2 border-slate-900">
      <div class="flex gap-3">
        <div class="w-11 h-11 rounded-xl bg-slate-900 text-white font-black text-lg flex items-center justify-center shrink-0">S</div>
        <div><p class="text-[14px] font-extrabold leading-tight">${escapeHtml(c.name || 'SalesIA Enterprise S.A.C.')}</p>
          <p class="text-[10px] text-slate-500 leading-snug mt-0.5">RUC ${escapeHtml(c.ruc || '')}<br>${escapeHtml(c.address || '')}</p></div>
      </div>
      <div class="text-right"><p class="text-[10px] font-bold tracking-[.2em] text-slate-500">REPORTE</p><p class="text-[11px] font-mono font-bold">${escapeHtml(report.code)}</p></div>
    </div>
    <div class="py-5"><h1 class="text-[22px] font-black tracking-tight leading-tight">${escapeHtml(report.title)}</h1><p class="text-[11px] text-slate-500 mt-1">${escapeHtml(report.subtitle)}</p></div>
    <div class="grid grid-cols-4 gap-3 pb-5 mb-6 border-b border-slate-200 text-[11px]">
      <div><p class="text-[9px] uppercase tracking-wide text-slate-400">Período</p><p class="font-semibold">${escapeHtml(report.period)}</p></div>
      <div><p class="text-[9px] uppercase tracking-wide text-slate-400">Generado por</p><p class="font-semibold">${escapeHtml(report.generatedBy.name)}</p><p class="text-slate-400 text-[10px]">${escapeHtml(report.generatedBy.role)}</p></div>
      <div><p class="text-[9px] uppercase tracking-wide text-slate-400">Fecha de emisión</p><p class="font-semibold">${gen.toLocaleDateString('es-PE')} ${gen.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}</p></div>
      <div><p class="text-[9px] uppercase tracking-wide text-slate-400">Moneda</p><p class="font-semibold">Soles (PEN)</p></div>
    </div>
    ${body}
    <div class="pt-3 mt-4 border-t border-slate-300 flex justify-between text-[9px] text-slate-400"><span>SalesIA Enterprise · Documento generado automáticamente (datos simulados)</span><span class="font-mono">${escapeHtml(report.code)}</span></div>
  </div>`;
}

/** CSV con todas las secciones (incluye todos los registros, sin el límite de la vista previa). */
export function reportToCsv(report) {
  const out = [[report.title], [report.company?.name || ''], ['Período', report.period], ['Emitido', new Date(report.generatedAt).toLocaleString('es-PE')], ['Generado por', report.generatedBy.name], []];
  const raw = (type, v) => {
    if (v === null || v === undefined) return '';
    if (type === 'date') return v ? new Date(v).toISOString().slice(0, 10) : '';
    if (type === 'datetime') { if (!v) return ''; const d = new Date(v); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; }
    return v;
  };
  for (const s of report.sections) {
    if (s.kind === 'kpis') { out.push(['Indicadores']); s.items.forEach(k => out.push([k.label, raw(k.type, k.value)])); }
    else if (s.kind === 'bars') { out.push([s.title]); s.rows.forEach(r => out.push([r.label, r.value, r.extra || ''])); }
    else {
      out.push([s.title]);
      out.push(s.columns.map(c => c.label));
      s.rows.forEach(r => out.push(s.columns.map(c => raw(c.type, r[c.key]))));
      if (s.totals) out.push(s.columns.map(c => (s.totals[c.key] !== undefined ? raw(c.type, s.totals[c.key]) : '')));
    }
    out.push([]);
  }
  return out.map(r => r.map(v => csvEscape(v)).join(',')).join('\r\n');
}
