/**
 * @file securityController.js
 * @description Módulo "Análisis de seguridad": sube un proyecto en ZIP, lo analiza en el navegador,
 * muestra el porcentaje de seguridad y los hallazgos, y abre el informe PDF con vista previa.
 */

import { icon } from '../../components/uiKit.js';
import { escapeHtml } from '../../utils/formatters.js';
import { analyzeProject, LIMITS } from './analyzer.js';
import { ZipArchive } from './zipReader.js';
import { SEV, SEV_ORDER } from './rules.js';
import { gaugeSvg, sevBadge, verdict, SecurityReportViewer } from './securityReport.js';
import { downloadText } from '../../utils/print.js';

const $ = (id) => document.getElementById(id);
const e = escapeHtml;
const fmt = (n) => Number(n).toLocaleString('es-PE');
const fmtBytes = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const scoreColor = (s) => (s >= 90 ? '#16a34a' : s >= 75 ? '#65a30d' : s >= 60 ? '#ca8a04' : s >= 40 ? '#ea580c' : '#b91c1c');
const HISTORY_KEY = 'security_scans';

export class SecurityController {
  constructor(app) {
    this.app = app;
    this.viewer = new SecurityReportViewer(app);
    this.state = 'idle';           // idle | running | done
    this.file = null;
    this.fileObj = null;
    this.includeDeps = false;
    this.analysis = null;
    this.error = '';
    this.sevFilter = 'all';
    this.cancelled = false;
    this.progress = { stage: '', percent: 0, detail: '' };
  }

  render() {
    const root = $('securityRoot');
    if (!root) return;
    if (this.state === 'running') this.#renderRunning();
    else if (this.state === 'done') this.#renderResults();
    else this.#renderIdle();
  }

  #history() { return this.app.state.storage.get(HISTORY_KEY, []); }

  // ------------------------------------------------------------------ 1. subir
  #renderIdle() {
    const history = this.#history();
    $('securityRoot').innerHTML = `
      <div class="grid lg:grid-cols-3 gap-6">
        <div class="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
          <h4 class="font-bold text-slate-900 text-sm mb-1">Sube el proyecto que quieres analizar</h4>
          <p class="text-xs text-slate-500 mb-4">Comprime la carpeta de <strong>cualquier proyecto</strong> (Node, Python, PHP, Java, .NET, Go…) en un archivo <strong>.zip</strong> y súbelo.</p>
          <label id="secDrop" for="secFile" class="block border-2 border-dashed ${this.file ? 'border-emerald-300 bg-emerald-50/40' : 'border-slate-300'} rounded-2xl p-9 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/40 transition-colors">
            <span class="inline-flex w-12 h-12 rounded-full ${this.file ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-50 text-blue-600'} items-center justify-center mb-3">${icon(this.file ? 'check' : 'upload', 'w-6 h-6')}</span>
            ${this.file
              ? `<span class="block text-sm font-bold text-slate-900">${e(this.file.name)}</span><span class="block text-xs text-slate-500 mt-1">${fmtBytes(this.file.size)}${this.file.entries ? ` · ${fmt(this.file.entries)} archivos` : ''} · haz clic para cambiar</span>`
              : `<span class="block text-sm font-semibold text-slate-800">Arrastra tu .zip aquí o haz clic para elegirlo</span><span class="block text-xs text-slate-400 mt-1">Hasta ${Math.round(LIMITS.maxZipBytes / 1048576)} MB y ${fmt(LIMITS.maxEntries)} archivos</span>`}
            <input id="secFile" type="file" accept=".zip,application/zip,application/x-zip-compressed" class="hidden">
          </label>
          <label class="mt-4 flex items-start gap-2 text-xs text-slate-600 cursor-pointer"><input id="secDeps" type="checkbox" class="mt-0.5 rounded border-slate-300" ${this.includeDeps ? 'checked' : ''}>
            <span>Incluir también carpetas de dependencias y compilación (<span class="font-mono">node_modules, vendor, dist…</span>). Es más lento y suele generar ruido; por defecto solo se señala que están incluidas.</span></label>
          <p id="secError" class="${this.error ? '' : 'hidden'} mt-4 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">${e(this.error)}</p>
          <button id="secAnalyze" ${this.file ? '' : 'disabled'} class="mt-5 w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow-md disabled:opacity-40 disabled:cursor-not-allowed">${icon('lock', 'w-4 h-4')} Analizar proyecto</button>
        </div>
        <div class="space-y-6">
          <div class="bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
            <h4 class="font-bold text-slate-900 text-sm mb-3">Qué revisa el análisis</h4>
            <ul class="space-y-2 text-xs text-slate-600">
              ${[['Secretos y credenciales', 'claves de nube, tokens, contraseñas, archivos .env'], ['Código inseguro', 'inyección SQL y de comandos, eval, XSS, deserialización'], ['Criptografía y autenticación', 'hashes débiles, cookies, JWT'], ['Dependencias', 'versiones con vulnerabilidades conocidas'], ['Configuración', 'Docker, CI/CD, CORS, modo debug'], ['Buenas prácticas', '.gitignore, pruebas, política de seguridad']]
                .map(([t, d]) => `<li class="flex gap-2"><span class="text-emerald-600 font-black">✓</span><span><strong class="text-slate-800">${t}:</strong> ${d}</span></li>`).join('')}
            </ul>
          </div>
          <div class="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-xs text-emerald-900 leading-relaxed">
            <p class="font-bold mb-1 flex items-center gap-1.5">${icon('lock', 'w-4 h-4')} Tu código no sale de tu equipo</p>
            El ZIP se lee y analiza dentro de tu navegador. No se sube a ningún servidor.
          </div>
        </div>
      </div>
      ${history.length ? `
      <div class="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div class="px-6 py-4 border-b border-slate-100"><h4 class="font-bold text-slate-900 text-sm">Análisis recientes</h4><p class="text-[11px] text-slate-400 mt-0.5">Resumen de los últimos análisis en este navegador</p></div>
        <div class="overflow-x-auto"><table class="w-full text-left text-xs"><thead class="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200"><tr><th class="px-4 py-3">Proyecto</th><th class="px-4 py-3">Fecha</th><th class="px-4 py-3 text-center">Puntaje</th><th class="px-4 py-3 text-center">Críticos / Altos</th><th class="px-4 py-3 text-right">Archivos</th></tr></thead>
        <tbody id="secHistoryBody">${history.map(h => `<tr class="border-b border-slate-100"><td class="px-4 py-2.5 font-semibold text-slate-800">${e(h.project)}</td><td class="px-4 py-2.5 text-slate-500">${new Date(h.at).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })}</td>
          <td class="px-4 py-2.5 text-center"><span class="font-mono font-extrabold" style="color:${scoreColor(h.score)}">${h.score}%</span> <span class="text-slate-400">${e(h.grade)}</span></td><td class="px-4 py-2.5 text-center font-mono">${h.critical} / ${h.high}</td><td class="px-4 py-2.5 text-right font-mono">${fmt(h.files)}</td></tr>`).join('')}</tbody></table></div>
      </div>` : ''}`;

    const input = $('secFile'), drop = $('secDrop');
    input.onchange = () => input.files[0] && this.#pick(input.files[0]);
    ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, (x) => { x.preventDefault(); drop.classList.add('border-blue-400'); }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, (x) => { x.preventDefault(); drop.classList.remove('border-blue-400'); }));
    drop.addEventListener('drop', (x) => { const f = x.dataTransfer?.files?.[0]; if (f) this.#pick(f); });
    $('secDeps').onchange = () => { this.includeDeps = $('secDeps').checked; };
    $('secAnalyze').onclick = () => this.#run();
  }

  async #pick(file) {
    this.error = '';
    this.file = null;
    this.fileObj = null;
    if (!/\.zip$/i.test(file.name)) { this.error = 'El archivo debe ser un .zip. Comprime la carpeta de tu proyecto e inténtalo de nuevo.'; this.render(); return; }
    if (file.size > LIMITS.maxZipBytes) { this.error = `El ZIP pesa ${fmtBytes(file.size)}; el máximo es ${Math.round(LIMITS.maxZipBytes / 1048576)} MB.`; this.render(); return; }
    if (file.size === 0) { this.error = 'El archivo está vacío.'; this.render(); return; }
    try {   // lectura rápida del directorio: valida el ZIP y muestra cuántos archivos trae
      const zip = new ZipArchive(await file.arrayBuffer());
      this.file = { name: file.name, size: file.size, entries: zip.entries.filter(x => !x.isDir).length };
      this.fileObj = file;
    } catch (err) {
      this.error = err.message || 'No se pudo leer el ZIP.';
    }
    if (this.state === 'idle') this.render();
  }

  // ------------------------------------------------------------------ 2. analizar
  async #run() {
    if (!this.fileObj) return;
    this.state = 'running';
    this.cancelled = false;
    this.progress = { stage: 'Preparando…', percent: 1, detail: '' };
    this.render();
    try {
      const buffer = await this.fileObj.arrayBuffer();
      const user = this.app.state.storage.get('currentUser', {});
      this.analysis = await analyzeProject(buffer, { fileName: this.fileObj.name, includeDeps: this.includeDeps, user: { name: user.name, role: user.role } }, (p) => {
        if (this.cancelled) throw new Error('CANCELLED');
        this.progress = p;
        this.#updateProgress();
      });
      this.#saveHistory();
      this.state = 'done';
      this.sevFilter = 'all';
    } catch (err) {
      this.state = 'idle';
      this.error = err.message === 'CANCELLED' ? '' : `No se pudo analizar el proyecto: ${err.message}`;
    }
    this.render();
  }

  #saveHistory() {
    const a = this.analysis;
    const list = [{ project: a.meta.projectName, at: a.meta.analyzedAt, score: a.score.value, grade: `${a.score.grade.letter} · ${a.score.grade.name}`,
      critical: a.score.bySeverity.critical, high: a.score.bySeverity.high, files: a.inventory.analyzedFiles }, ...this.#history()].slice(0, 10);
    this.app.state.storage.set(HISTORY_KEY, list);
    this.app.state.api.logAudit('SECURITY_SCAN', 'security', `Análisis de seguridad de "${a.meta.projectName}": ${a.score.value}% (${a.score.grade.name}); ${a.findings.length} tipos de hallazgos`);
  }

  #renderRunning() {
    $('securityRoot').innerHTML = `
      <div class="max-w-2xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-xs p-8 text-center">
        <span class="spinner dark" style="width:38px;height:38px;border-width:3px"></span>
        <h4 class="font-bold text-slate-900 mt-4">Analizando <span class="font-mono">${e(this.file?.name || '')}</span></h4>
        <p id="secStage" class="text-sm text-slate-500 mt-1">${e(this.progress.stage)}</p>
        <div class="mt-5 h-2.5 rounded-full bg-slate-100 overflow-hidden"><div id="secBar" class="h-full rounded-full bg-blue-600 transition-all" style="width:${this.progress.percent}%"></div></div>
        <p class="mt-2 text-[11px] text-slate-400 font-mono"><span id="secPct">${this.progress.percent}%</span> · <span id="secDetail">${e(this.progress.detail || '')}</span></p>
        <button id="secCancel" class="mt-6 px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100">Cancelar</button>
      </div>`;
    $('secCancel').onclick = () => { this.cancelled = true; };
  }

  #updateProgress() {
    if (!$('secBar')) return;
    $('secBar').style.width = `${this.progress.percent}%`;
    $('secPct').innerText = `${this.progress.percent}%`;
    $('secStage').innerText = this.progress.stage;
    $('secDetail').innerText = this.progress.detail || '';
  }

  // ------------------------------------------------------------------ 3. resultados
  #renderResults() {
    const a = this.analysis, g = a.score.grade;
    const totalInstances = a.findings.reduce((n, f) => n + f.count, 0);
    const kpi = (label, value, sub = '') => `<div class="bg-white rounded-xl border border-slate-200 p-4"><span class="text-xs text-slate-400 block">${label}</span><span class="text-2xl font-extrabold font-mono text-slate-900">${value}</span>${sub ? `<span class="block text-[11px] text-slate-400">${sub}</span>` : ''}</div>`;
    const chips = [['all', `Todos (${a.findings.length})`], ...SEV_ORDER.filter(s => a.score.bySeverity[s]).map(s => [s, `${SEV[s].label} (${a.score.bySeverity[s]})`])];

    $('securityRoot').innerHTML = `
      <div class="space-y-6">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div><h4 class="font-extrabold text-slate-900 text-lg">${e(a.meta.projectName)}</h4>
            <p class="text-[11px] text-slate-400 font-mono">${e(a.meta.fileName)} · ${fmtBytes(a.meta.zipBytes)} · analizado en ${(a.meta.durationMs / 1000).toFixed(1)} s</p></div>
          <div class="flex flex-wrap gap-2">
            <button id="secOpenReport" class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-sm">${icon('printer', 'w-4 h-4')} Ver informe PDF</button>
            <button id="secDlJson" class="px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold">Descargar datos (JSON)</button>
            <button id="secNew" class="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100">Analizar otro proyecto</button>
          </div>
        </div>

        <div class="grid lg:grid-cols-3 gap-6">
          <div class="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 text-center">
            <p class="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Seguridad del proyecto</p>
            <div class="flex justify-center" id="secGauge">${gaugeSvg(a.score.value, g.color, 190, `GRADO ${g.letter} · ${g.name.toUpperCase()}`)}</div>
            <p class="mt-3 text-sm font-semibold" style="color:${g.color}">Riesgo ${e(g.risk.toLowerCase())}</p>
            <p class="mt-1 text-xs text-slate-500 leading-relaxed">${e(verdict(a))}</p>
            ${a.score.caps.length ? `<p class="mt-3 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-left">Puntaje limitado a ${Math.min(...a.score.caps.map(c => c.max))}%: ${e(a.score.caps.map(c => c.reason.toLowerCase()).join('; '))}.</p>` : ''}
          </div>
          <div class="lg:col-span-2 space-y-6">
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
              ${kpi('Archivos analizados', fmt(a.inventory.analyzedFiles), `de ${fmt(a.inventory.totalFiles)} en el ZIP`)}${kpi('Líneas revisadas', fmt(a.inventory.totalLines))}
              ${kpi('Tipos de hallazgos', fmt(a.findings.length), `${fmt(totalInstances)} ocurrencias`)}${kpi('Dependencias', fmt(a.dependencies.total), `${a.dependencies.flagged.length} vulnerables`)}
            </div>
            <div class="bg-white rounded-2xl border border-slate-200 shadow-xs p-5">
              <div class="flex flex-wrap gap-2 mb-4">${SEV_ORDER.map(s => `<span class="px-3 py-1.5 rounded-lg text-xs font-bold" style="background:${SEV[s].soft};color:${SEV[s].color};border:1px solid ${SEV[s].color}33"><span class="font-mono text-sm">${a.score.bySeverity[s]}</span> ${SEV[s].label}</span>`).join('')}</div>
              <p class="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Puntaje por categoría</p>
              <div class="space-y-2">${a.score.byCategory.map(c => `
                <div class="flex items-center gap-3 text-xs"><span class="w-52 shrink-0 text-slate-700 font-medium">${e(c.category)}</span>
                <div class="flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden"><div class="h-full rounded-full" style="width:${Math.max(2, c.score)}%;background:${scoreColor(c.score)}"></div></div>
                <span class="w-10 text-right font-mono font-extrabold" style="color:${scoreColor(c.score)}">${c.score}%</span></div>`).join('')}</div>
            </div>
          </div>
        </div>

        <div class="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div class="px-6 py-4 border-b border-slate-100"><h4 class="font-bold text-slate-900 text-sm">Hallazgos</h4><p class="text-[11px] text-slate-400 mt-0.5">Haz clic en un hallazgo para ver dónde está y cómo corregirlo. Los secretos aparecen enmascarados.</p></div>
          <div id="secChips" class="px-6 py-3 border-b border-slate-100 bg-slate-50/60 flex flex-wrap gap-2">${chips.map(([k, l]) => `<button type="button" data-sev="${k}" class="px-3 py-1.5 rounded-full text-xs font-semibold border ${this.sevFilter === k ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}">${l}</button>`).join('')}</div>
          <div id="secFindings" class="divide-y divide-slate-100"></div>
        </div>

        <div class="grid lg:grid-cols-2 gap-6">
          <div class="bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
            <h4 class="font-bold text-slate-900 text-sm mb-3">Inventario del proyecto</h4>
            <div class="space-y-1.5">${a.inventory.languages.slice(0, 8).map(l => `<div class="flex items-center gap-3 text-xs"><span class="w-28 shrink-0 font-medium text-slate-700">${e(l.name)}</span><div class="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden"><div class="h-full rounded-full bg-blue-700" style="width:${Math.max(2, l.pct)}%"></div></div><span class="w-14 text-right font-mono text-slate-500">${l.pct}%</span></div>`).join('') || '<p class="text-xs text-slate-400">Sin lenguajes reconocidos.</p>'}</div>
            <p class="mt-4 text-[11px] text-slate-500">${a.inventory.frameworks.length ? a.inventory.frameworks.map(f => `<span class="inline-block mr-1.5 mb-1 px-2 py-0.5 rounded bg-slate-100 border border-slate-200 font-semibold text-slate-700">${e(f)}</span>`).join('') : 'No se identificaron frameworks conocidos.'}</p>
          </div>
          <div class="bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
            <h4 class="font-bold text-slate-900 text-sm mb-3">Controles de seguridad</h4>
            <ul class="space-y-1.5 text-xs">${a.controls.map(c => `<li class="flex gap-2 ${c.present ? 'text-slate-700' : 'text-slate-400'}"><span class="${c.present ? 'text-emerald-600' : 'text-slate-300'} font-black">${c.present ? '✓' : '○'}</span>${e(c.label)}</li>`).join('')}</ul>
          </div>
        </div>
      </div>`;

    this.#renderFindings();
    $('secChips').onclick = (ev) => { const b = ev.target.closest('[data-sev]'); if (b) { this.sevFilter = b.dataset.sev; this.#renderResults(); } };
    $('secOpenReport').onclick = () => this.viewer.open(this.analysis);
    $('secDlJson').onclick = () => downloadText(`analisis-${a.meta.projectName}.json`, JSON.stringify(this.analysis, null, 2), 'application/json;charset=utf-8', false);
    $('secNew').onclick = () => { this.state = 'idle'; this.file = null; this.fileObj = null; this.analysis = null; this.error = ''; this.render(); };
  }

  #renderFindings() {
    const list = this.analysis.findings.filter(f => this.sevFilter === 'all' || f.severity === this.sevFilter);
    $('secFindings').innerHTML = list.length === 0
      ? `<div class="px-6 py-10 text-center text-sm ${this.analysis.findings.length ? 'text-slate-400' : 'text-emerald-700 font-semibold'}">${this.analysis.findings.length ? 'No hay hallazgos con este filtro.' : 'No se detectaron hallazgos con las reglas actuales.'}</div>`
      : list.map(f => `
        <details class="group">
          <summary class="px-6 py-3.5 flex items-center gap-3 cursor-pointer hover:bg-slate-50 list-none">
            <span class="font-mono text-[11px] text-slate-400 w-10 shrink-0">${f.id}</span>
            <span class="shrink-0">${sevBadge(f.severity)}</span>
            <span class="flex-1 min-w-0"><span class="block text-sm font-semibold text-slate-900">${e(f.title)}</span><span class="block text-[11px] text-slate-400">${e(f.category)} · ${e(f.cwe)}</span></span>
            <span class="font-mono text-xs font-bold text-slate-600 shrink-0">×${fmt(f.count)}</span>
          </summary>
          <div class="px-6 pb-5 pl-[4.75rem] text-xs text-slate-600 space-y-3">
            <p class="leading-relaxed">${e(f.description)}</p>
            <div><p class="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Ubicaciones</p>
              <div class="rounded-lg border border-slate-200 divide-y divide-slate-100 max-h-56 overflow-y-auto">${f.instances.slice(0, 25).map(i => `<div class="px-3 py-1.5 flex gap-3"><span class="font-mono text-[11px] text-blue-700 w-2/5 shrink-0 break-all">${e(i.file)}${i.line ? `:${i.line}` : ''}</span><span class="font-mono text-[11px] text-slate-500 break-all">${e(i.snippet || i.note || '')}</span></div>`).join('')}</div>
              ${f.count > 25 ? `<p class="text-[11px] text-slate-400 mt-1">… y ${fmt(f.count - 25)} más (incluidas en la exportación JSON/CSV).</p>` : ''}</div>
            <div class="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-emerald-900"><strong>Cómo corregirlo:</strong> ${e(f.recommendation)}</div>
            <p class="text-[10px] text-slate-400">${e(f.owasp)}</p>
          </div>
        </details>`).join('');
  }
}
