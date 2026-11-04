/**
 * @file importController.js
 * @description Asistente "Importar datos": 1 Archivo → 2 Columnas → 3 Revisión → 4 Listo.
 * Un solo CSV llena clientes, productos, ventas con comprobante, cotizaciones, inventario y reportes.
 */

import { icon } from '../../components/uiKit.js';
import { ConfirmDialog } from '../../components/modal.js';
import { escapeHtml, formatCurrency } from '../../utils/formatters.js';
import { downloadText } from '../../utils/print.js';
import { canAccess } from '../../app/permissions.js';
import { parseCsv, toCsv } from './csvParser.js';
import { FIELDS, autoMap } from './fieldMap.js';
import { buildPlan, applyPlan } from './csvImporter.js';
import { templateCsv, sampleCsv } from './sampleData.js';

const $ = (id) => document.getElementById(id);
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_ROWS = 20000;

export class ImportController {
  constructor(app) {
    this.app = app;
    this.#reset();
  }

  #reset() {
    this.step = 1;
    this.file = null;
    this.parsed = null;
    this.mapping = {};
    this.plan = null;
    this.mode = 'merge';
    this.result = null;
    this.error = '';
  }

  /** Al volver a esta pantalla después de terminar una importación, se empieza de nuevo. */
  onEnter() {
    if (this.step === 4) this.#reset();
  }

  #counts() {
    const st = this.app.state.storage;
    return { customers: st.get('customers', []).length, products: st.get('products', []).length, sales: st.get('sales', []).length, quotes: st.get('quotes', []).length };
  }

  render() {
    const root = $('importRoot');
    if (!root) return;
    const steps = ['Archivo', 'Columnas', 'Revisión', 'Listo'];
    const stepper = steps.map((label, i) => {
      const n = i + 1, done = n < this.step, cur = n === this.step;
      return `<div class="flex items-center gap-2 ${i ? 'flex-1' : ''}">${i ? `<span class="flex-1 h-0.5 ${done || cur ? 'bg-blue-600' : 'bg-slate-200'}"></span>` : ''}
        <span class="w-7 h-7 rounded-full text-xs font-bold inline-flex items-center justify-center ${done ? 'bg-blue-600 text-white' : cur ? 'bg-blue-600 text-white ring-4 ring-blue-100' : 'bg-slate-200 text-slate-500'}">${done ? icon('check', 'w-4 h-4') : n}</span>
        <span class="text-xs font-semibold ${cur ? 'text-slate-900' : 'text-slate-400'}">${label}</span></div>`;
    }).join('');
    root.innerHTML = `<div class="mb-6 max-w-2xl flex items-center gap-2">${stepper}</div><div id="impBody"></div>`;
    ({ 1: () => this.#stepFile(), 2: () => this.#stepMap(), 3: () => this.#stepReview(), 4: () => this.#stepDone() })[this.step]();
  }

  // ------------------------------------------------------------------ 1. archivo
  #stepFile() {
    const c = this.#counts();
    const empty = c.customers + c.products + c.sales + c.quotes === 0;
    $('impBody').innerHTML = `
      <div class="grid lg:grid-cols-3 gap-6">
        <div class="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
          <h4 class="font-bold text-slate-900 text-sm mb-1">Elige tu archivo CSV</h4>
          <p class="text-xs text-slate-500 mb-4">Con un solo archivo se llenan <strong>Clientes, Productos, Inventario, Ventas, Facturación, Cotizaciones y Reportes</strong>.</p>
          <label id="impDrop" for="impFile" class="block border-2 border-dashed border-slate-300 rounded-2xl p-10 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/40 transition-colors">
            <span class="inline-flex w-12 h-12 rounded-full bg-blue-50 text-blue-600 items-center justify-center mb-3">${icon('upload', 'w-6 h-6')}</span>
            <span class="block text-sm font-semibold text-slate-800">Arrastra tu archivo aquí o haz clic para elegirlo</span>
            <span class="block text-xs text-slate-400 mt-1">.csv · separador coma, punto y coma o tabulación · hasta 8 MB</span>
            <input id="impFile" type="file" accept=".csv,.txt,text/csv" class="hidden">
          </label>
          <p id="impError" class="${this.error ? '' : 'hidden'} mt-3 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">${escapeHtml(this.error)}</p>
          <div class="mt-5 rounded-xl px-4 py-3 text-xs ${empty ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-amber-50 border border-amber-200 text-amber-900'}">
            ${empty ? '<strong>El sistema está en cero.</strong> Al importar se llenarán todos los módulos.'
              : `<strong>El sistema ya tiene datos:</strong> ${c.customers} clientes, ${c.products} productos, ${c.sales} ventas, ${c.quotes} cotizaciones. En el paso 3 elegirás si reemplazarlos o agregar a ellos.`}
          </div>
        </div>
        <div class="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-3">
          <h4 class="font-bold text-slate-900 text-sm">¿No tienes un archivo?</h4>
          <button id="impSampleLoad" class="w-full px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold">Cargar datos de ejemplo</button>
          <button id="impSampleDl" class="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold">${icon('download', 'w-4 h-4')} Descargar CSV de ejemplo</button>
          <button id="impTemplateDl" class="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold">${icon('download', 'w-4 h-4')} Descargar plantilla vacía</button>
          <details class="text-xs text-slate-500 pt-2 border-t border-slate-100">
            <summary class="cursor-pointer font-semibold text-slate-700">¿Cómo debe ser el archivo?</summary>
            <ul class="mt-2 space-y-1.5 list-disc pl-4 leading-relaxed">
              <li>Cada fila es <strong>un producto de una venta</strong> (varias filas con el mismo folio forman una venta).</li>
              <li>Obligatorio: <strong>producto</strong>, <strong>precio</strong> y <strong>cantidad</strong>.</li>
              <li>Con la columna <em>tipo</em> puedes mezclar VENTA, COTIZACION, PRODUCTO y CLIENTE.</li>
              <li>Los nombres de columnas pueden variar: el sistema las reconoce y tú puedes corregirlas en el paso 2.</li>
            </ul>
          </details>
        </div>
      </div>`;

    const input = $('impFile'), drop = $('impDrop');
    input.onchange = () => input.files[0] && this.#handleFile(input.files[0]);
    ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('border-blue-400', 'bg-blue-50/40'); }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('border-blue-400', 'bg-blue-50/40'); }));
    drop.addEventListener('drop', (e) => { const f = e.dataTransfer?.files?.[0]; if (f) this.#handleFile(f); });
    $('impTemplateDl').onclick = () => downloadText('plantilla_salesia.csv', templateCsv());
    $('impSampleDl').onclick = () => downloadText('ejemplo_salesia.csv', sampleCsv());
    $('impSampleLoad').onclick = () => this.#loadParsed(parseCsv(sampleCsv()), 'datos_de_ejemplo.csv', true);
  }

  async #handleFile(file) {
    this.error = '';
    if (file.size > MAX_BYTES) { this.error = 'El archivo supera los 8 MB.'; this.#stepFile(); return; }
    try {
      const buf = await file.arrayBuffer();
      let text = new TextDecoder('utf-8').decode(buf);
      if (text.includes('\uFFFD')) text = new TextDecoder('windows-1252').decode(buf);
      this.#loadParsed(parseCsv(text), file.name, false);
    } catch {
      this.error = 'No se pudo leer el archivo.'; this.#stepFile();
    }
  }

  #loadParsed(parsed, name, skipMapping) {
    this.error = '';
    if (parsed.headers.length < 2 || parsed.rows.length === 0) { this.error = 'El archivo está vacío o no parece un CSV con encabezados.'; this.render(); return; }
    if (parsed.rows.length > MAX_ROWS) { this.error = `El archivo tiene ${parsed.rows.length.toLocaleString('es-PE')} filas; el máximo es ${MAX_ROWS.toLocaleString('es-PE')}.`; this.render(); return; }
    this.file = { name };
    this.parsed = parsed;
    this.mapping = autoMap(parsed.headers);
    if (skipMapping) { this.#toReview(); return; }
    this.step = 2;
    this.render();
  }

  // ------------------------------------------------------------------ 2. columnas
  #missing() {
    return FIELDS.filter(f => f.required && this.mapping[f.key] === undefined);
  }

  #stepMap() {
    const p = this.parsed;
    const sample = p.rows[0] || [];
    const missing = this.#missing();
    const rows = FIELDS.map(f => {
      const idx = this.mapping[f.key];
      return `
        <tr class="border-b border-slate-100 text-xs">
          <td class="px-4 py-2.5"><span class="font-semibold text-slate-800">${escapeHtml(f.label)}</span>${f.required ? '<span class="text-rose-500 ml-1">*</span>' : ''}${f.hint ? `<span class="block text-[11px] text-slate-400">${escapeHtml(f.hint)}</span>` : ''}</td>
          <td class="px-4 py-2.5">
            <select data-field="${f.key}" class="w-full p-2 rounded-lg border ${idx !== undefined ? 'border-emerald-300 bg-emerald-50/50' : f.required ? 'border-rose-300 bg-rose-50/50' : 'border-slate-200 bg-white'} text-xs">
              <option value="">— No usar —</option>
              ${p.headers.map((h, i) => `<option value="${i}" ${idx === i ? 'selected' : ''}>${escapeHtml(h || `(columna ${i + 1})`)}</option>`).join('')}
            </select></td>
          <td class="px-4 py-2.5 font-mono text-[11px] text-slate-500 max-w-[220px] truncate">${idx !== undefined ? escapeHtml(sample[idx] ?? '') : ''}</td>
        </tr>`;
    }).join('');

    $('impBody').innerHTML = `
      <div class="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div class="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div><h4 class="font-bold text-slate-900 text-sm">Revisa qué columna es cada dato</h4>
            <p class="text-[11px] text-slate-400 mt-0.5 font-mono">${escapeHtml(this.file.name)} · ${p.rows.length.toLocaleString('es-PE')} filas · ${p.headers.length} columnas · separador "${p.delimiter === '\t' ? 'tab' : escapeHtml(p.delimiter)}"</p></div>
          <span class="text-xs font-semibold ${missing.length ? 'text-rose-600' : 'text-emerald-600'}">${missing.length ? `Falta indicar: ${missing.map(f => f.label).join(', ')}` : `✓ ${Object.keys(this.mapping).length} columnas reconocidas`}</span>
        </div>
        <div class="overflow-x-auto max-h-[420px] overflow-y-auto"><table class="w-full text-left">
          <thead class="bg-slate-50 text-slate-500 text-xs font-semibold border-b border-slate-200 sticky top-0"><tr><th class="px-4 py-2.5">Dato del sistema</th><th class="px-4 py-2.5 w-64">Columna de tu archivo</th><th class="px-4 py-2.5">Ejemplo</th></tr></thead>
          <tbody>${rows}</tbody></table></div>
        <details class="border-t border-slate-100"><summary class="px-6 py-3 text-xs font-semibold text-slate-600 cursor-pointer">Vista previa de las primeras filas del archivo</summary>
          <div class="overflow-x-auto px-6 pb-4"><table class="text-[11px] w-full"><thead><tr>${p.headers.map(h => `<th class="px-2 py-1 text-left text-slate-500 whitespace-nowrap">${escapeHtml(h)}</th>`).join('')}</tr></thead>
          <tbody>${p.rows.slice(0, 5).map(r => `<tr class="border-t border-slate-100">${p.headers.map((_, i) => `<td class="px-2 py-1 whitespace-nowrap text-slate-600">${escapeHtml(r[i] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>
        <div class="px-6 py-4 border-t border-slate-100 flex justify-between">
          <button id="impBack" class="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100">← Cambiar archivo</button>
          <button id="impValidate" ${missing.length ? 'disabled' : ''} class="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed">Revisar datos →</button>
        </div>
      </div>`;
    $('impBody').querySelectorAll('select[data-field]').forEach(sel => {
      sel.onchange = () => {
        if (sel.value === '') delete this.mapping[sel.dataset.field];
        else this.mapping[sel.dataset.field] = parseInt(sel.value, 10);
        this.#stepMap();
      };
    });
    $('impBack').onclick = () => { this.#reset(); this.render(); };
    $('impValidate').onclick = () => this.#toReview();
  }

  // ------------------------------------------------------------------ 3. revisión
  #toReview() {
    this.plan = buildPlan(this.parsed, this.mapping);
    const c = this.#counts();
    this.mode = c.customers + c.products + c.sales + c.quotes === 0 ? 'merge' : 'merge';
    this.step = 3;
    this.render();
  }

  #stepReview() {
    const pl = this.plan, st = pl.stats;
    const c = this.#counts();
    const hasData = c.customers + c.products + c.sales + c.quotes > 0;
    const card = (label, value, sub = '') => `<div class="bg-white rounded-xl border border-slate-200 p-4"><span class="text-xs text-slate-400 block">${label}</span><span class="text-2xl font-extrabold font-mono text-slate-900">${value}</span>${sub ? `<span class="block text-[11px] text-slate-400">${sub}</span>` : ''}</div>`;
    const modeCard = (id, title, desc, tone) => `
      <button type="button" data-mode="${id}" class="seg-btn text-left p-4 rounded-xl border ${this.mode === id ? `${tone} ring-1` : 'border-slate-200 bg-white hover:border-slate-300'}">
        <span class="block text-sm font-extrabold text-slate-900">${title}</span><span class="block text-[11px] text-slate-500 mt-0.5">${desc}</span></button>`;
    const sampleErrors = pl.errors.slice(0, 25);

    $('impBody').innerHTML = `
      <div class="space-y-5">
        <div class="bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
          <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div><h4 class="font-bold text-slate-900 text-sm">Esto es lo que se va a cargar</h4><p class="text-[11px] text-slate-400 mt-0.5 font-mono">${escapeHtml(this.file.name)}</p></div>
            <div class="text-xs"><span class="font-semibold text-emerald-700">${pl.valid.toLocaleString('es-PE')} filas válidas</span>${pl.errorCount ? ` · <span class="font-semibold text-rose-600">${pl.errorCount.toLocaleString('es-PE')} con error (se omiten)</span>` : ''} de ${pl.totalRows.toLocaleString('es-PE')}</div>
          </div>
          <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            ${card('Clientes', st.customers)}${card('Productos', st.products, `${st.categories} categorías`)}${card('Vendedores', st.sellers)}
            ${card('Ventas', st.sales, 'cobradas y facturadas')}${card('Cotizaciones', st.quotes)}${card('Inventario', st.products, 'con kárdex de movimientos')}
          </div>
          ${pl.warnings.docs ? `<p class="mt-3 text-[11px] text-amber-700">⚠ ${pl.warnings.docs} fila(s) con RUC/DNI inválido: el cliente se carga sin documento (podrás completarlo después).</p>` : ''}
        </div>
        ${pl.errorCount ? `
        <div class="bg-white rounded-2xl border border-rose-200 shadow-xs overflow-hidden">
          <div class="px-6 py-3 bg-rose-50 border-b border-rose-200 flex items-center justify-between"><h4 class="font-bold text-rose-800 text-sm">Filas con error</h4>
            <button id="impErrDl" class="text-xs font-semibold text-rose-700 hover:underline">Descargar lista de errores</button></div>
          <ul class="max-h-48 overflow-y-auto divide-y divide-slate-100 text-xs">${sampleErrors.map(e => `<li class="px-6 py-2"><span class="font-mono font-bold text-slate-500">Fila ${e.line}</span> · ${escapeHtml(e.message)}</li>`).join('')}
            ${pl.errorCount > sampleErrors.length ? `<li class="px-6 py-2 text-slate-400">… y ${(pl.errorCount - sampleErrors.length).toLocaleString('es-PE')} más.</li>` : ''}</ul>
        </div>` : ''}
        ${hasData ? `
        <div class="bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
          <h4 class="font-bold text-slate-900 text-sm mb-3">El sistema ya tiene datos: ¿qué hacemos con ellos?</h4>
          <div class="grid sm:grid-cols-2 gap-3">
            ${modeCard('merge', 'Agregar a lo existente', 'Mantiene todo lo actual y suma lo nuevo (sin duplicar clientes ni productos).', 'border-blue-500 bg-blue-50 ring-blue-500')}
            ${modeCard('replace', 'Reemplazar todo', 'Borra clientes, productos, ventas y cotizaciones actuales y carga solo este archivo.', 'border-rose-500 bg-rose-50 ring-rose-500')}
          </div>
        </div>` : ''}
        <div class="flex justify-between">
          <button id="impBack" class="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100">← Volver</button>
          <button id="impRun" ${pl.valid === 0 ? 'disabled' : ''} class="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold shadow-md disabled:opacity-40 disabled:cursor-not-allowed">Importar ahora</button>
        </div>
        <p id="impRunError" class="hidden text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2"></p>
      </div>`;

    $('impBody').querySelectorAll('[data-mode]').forEach(b => { b.onclick = () => { this.mode = b.dataset.mode; this.#stepReview(); }; });
    $('impBack').onclick = () => { this.step = this.file.name === 'datos_de_ejemplo.csv' ? 1 : 2; this.render(); };
    if ($('impErrDl')) $('impErrDl').onclick = () => downloadText('errores_importacion.csv', toCsv(['fila', 'error'], pl.errors.map(e => [e.line, e.message])));
    $('impRun').onclick = () => this.#run(hasData);
  }

  async #run(hasData) {
    if (hasData && this.mode === 'replace') {
      const ok = await ConfirmDialog.ask({ title: 'Reemplazar todos los datos', message: 'Se borrarán los clientes, productos, ventas y cotizaciones actuales. Esta acción no se puede deshacer.', confirmText: 'Reemplazar', tone: 'danger' });
      if (!ok) return;
    }
    const btn = $('impRun');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span><span class="ml-2">Importando…</span>';
    await new Promise(r => setTimeout(r, 60));
    try {
      this.result = applyPlan(this.app, this.plan, this.mode, this.file.name);
      this.step = 4;
      this.app.render();
      this.render();
    } catch (e) {
      btn.disabled = false;
      btn.innerText = 'Importar ahora';
      const box = $('impRunError');
      box.innerText = `No se pudo importar: ${e.message} No se modificó ningún dato.`;
      box.classList.remove('hidden');
    }
  }

  // ------------------------------------------------------------------ 4. listo
  #stepDone() {
    const r = this.result;
    const role = this.app.getCurrentRole();
    const item = (n, label) => `<div class="bg-white rounded-xl border border-slate-200 p-4 text-center"><span class="block text-2xl font-extrabold font-mono text-slate-900">${n}</span><span class="text-[11px] text-slate-500">${label}</span></div>`;
    $('impBody').innerHTML = `
      <div class="bg-white rounded-2xl border border-emerald-200 shadow-xs p-8 text-center">
        <span class="pop-in inline-flex w-16 h-16 rounded-full bg-emerald-600 text-white items-center justify-center mb-3">${icon('check', 'w-9 h-9')}</span>
        <h4 class="text-lg font-extrabold text-slate-900">Importación completada</h4>
        <p class="text-sm text-slate-500 mt-1">Todos los módulos ya tienen datos.</p>
        <div class="grid grid-cols-2 md:grid-cols-5 gap-3 mt-6 max-w-3xl mx-auto">
          ${item(r.customers, 'clientes')}${item(r.products, 'productos')}${item(r.sales, 'ventas facturadas')}${item(r.quotes, 'cotizaciones')}${item(r.movements, 'movimientos de inventario')}
        </div>
        ${r.skippedDuplicates ? `<p class="mt-4 text-[11px] text-slate-500">${r.skippedDuplicates} venta(s)/cotización(es) ya existían (mismo folio) y no se duplicaron.</p>` : ''}
        ${r.stockClamped ? `<p class="mt-4 text-[11px] text-amber-700">⚠ En ${r.stockClamped} venta(s) el stock inicial no alcanzaba: el stock de esos productos quedó en 0.</p>` : ''}
        <div class="mt-6 flex flex-wrap justify-center gap-2">
          ${canAccess(role, 'dashboard') ? '<button data-nav-target="dashboard" class="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold">Ir al Inicio</button>' : ''}
          ${canAccess(role, 'billing') ? '<button data-nav-target="billing" class="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold">Ver Facturación</button>' : ''}
          ${canAccess(role, 'reports') ? '<button data-nav-target="reports" class="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold">Ver Reportes</button>' : ''}
          <button id="impAnother" class="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100">Importar otro archivo</button>
        </div>
      </div>`;
    $('impAnother').onclick = () => { this.#reset(); this.render(); };
  }
}
