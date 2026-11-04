/**
 * @file securityReport.js
 * @description Informe de análisis de seguridad como documento (portada, resumen ejecutivo,
 * metodología, inventario, hallazgos, dependencias, controles y plan de remediación),
 * con vista previa antes de exportar a PDF, JSON o CSV.
 */

import { Modal } from '../../components/modal.js';
import { icon } from '../../components/uiKit.js';
import { escapeHtml } from '../../utils/formatters.js';
import { printModal, downloadText } from '../../utils/print.js';
import { csvEscape } from '../importer/csvParser.js';
import { SEV, SEV_ORDER, LINE_RULES, FILE_RULES, DOCKER_RULES } from './rules.js';
import { DECAY } from './analyzer.js';
import { ADVISORIES } from './advisories.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Number(n).toLocaleString('es-PE');
const fmtBytes = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const e = escapeHtml;

export function gaugeSvg(score, color, size = 180, label = '') {
  const r = 54, c = 2 * Math.PI * r;
  return `<svg width="${size}" height="${size}" viewBox="0 0 140 140" role="img" aria-label="Puntaje de seguridad ${score}%">
    <circle cx="70" cy="70" r="${r}" fill="none" stroke="#e2e8f0" stroke-width="12"/>
    ${score > 0 ? `<circle cx="70" cy="70" r="${r}" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${(c * score / 100).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 70 70)"/>` : ''}
    <text x="70" y="68" text-anchor="middle" font-size="34" font-weight="900" fill="#0f172a" font-family="Inter,Arial,sans-serif">${score}%</text>
    <text x="70" y="88" text-anchor="middle" font-size="9" font-weight="700" fill="${color}" font-family="Inter,Arial,sans-serif">${e(label)}</text>
  </svg>`;
}

export const sevBadge = (sev) => `<span style="background:${SEV[sev].soft};color:${SEV[sev].color};border:1px solid ${SEV[sev].color}33" class="inline-block px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wide">${SEV[sev].label}</span>`;
const bar = (pct, color) => `<span class="block h-2.5 rounded-sm bg-slate-100 overflow-hidden"><span class="block h-full rounded-sm" style="width:${Math.max(1, Math.min(100, pct))}%;background:${color}"></span></span>`;
const scoreColor = (s) => (s >= 90 ? '#16a34a' : s >= 75 ? '#65a30d' : s >= 60 ? '#ca8a04' : s >= 40 ? '#ea580c' : '#b91c1c');

export function verdict(a) {
  return {
    A: 'El proyecto muestra buenas prácticas y no se detectaron riesgos relevantes con este análisis automático.',
    B: 'Hay riesgos moderados que conviene corregir pronto, preferentemente antes del siguiente despliegue.',
    C: 'Se detectaron riesgos que deben corregirse antes de publicar o entregar el proyecto.',
    D: 'Hay riesgos altos: no se recomienda publicar el proyecto sin corregir primero los hallazgos prioritarios.',
    E: 'Riesgo crítico: hay secretos expuestos o vulnerabilidades graves que requieren acción inmediata.'
  }[a.score.grade.letter];
}

function effort(f) {
  if (f.category === 'Secretos y credenciales' || f.category === 'Dependencias' || f.category === 'Buenas prácticas') return 'Bajo';
  if (f.category === 'Configuración e infraestructura') return f.severity === 'high' ? 'Medio' : 'Bajo';
  return f.count > 5 ? 'Alto' : 'Medio';
}

function priorityOf(f) {
  if (f.severity === 'critical' || (f.severity === 'high' && f.category === 'Secretos y credenciales')) return 1;
  if (f.severity === 'high' || f.severity === 'medium') return 2;
  return 3;
}

const PRIORITIES = { 1: ['Inmediata', '0 – 48 horas', '#b91c1c'], 2: ['Corto plazo', '1 – 2 semanas', '#ea580c'], 3: ['Mediano plazo', '1 – 2 meses', '#2563eb'] };

const page = (inner, { cover = false, project, code, section } = {}) => `
  <div class="doc-sheet report-page mx-auto max-w-[860px] ${cover ? '' : 'p-10'} border border-slate-200 shadow-sm" ${cover ? 'style="padding:0;overflow:hidden"' : ''}>
    ${cover ? '' : `<div class="flex justify-between items-center pb-2 mb-6 border-b border-slate-300 text-[9px] text-slate-400 uppercase tracking-wider"><span>Informe de seguridad · ${e(project)}</span><span>${e(section || '')} · ${e(code)}</span></div>`}
    ${inner}
    ${cover ? '' : '<div class="mt-8 pt-2 border-t border-slate-200 text-[9px] text-slate-400 text-center">Confidencial · Generado por SalesIA Enterprise · Análisis estático automatizado: no sustituye una auditoría de seguridad profesional</div>'}
  </div>`;

const h2 = (n, t, extra = '') => `<h2 class="text-[17px] font-black tracking-tight text-slate-900 mb-1 ${extra}"><span class="text-slate-400 mr-2">${n}.</span>${t}</h2><div class="h-[3px] w-12 bg-slate-900 mb-4"></div>`;
const h3 = (t) => `<h3 class="text-[12px] font-extrabold uppercase tracking-wide text-slate-700 mt-5 mb-2">${t}</h3>`;
const th = (cols) => `<thead><tr class="bg-slate-900 text-white">${cols.map(([t, al]) => `<th class="py-1.5 px-2 ${al === 'r' ? 'text-right' : 'text-left'} text-[10px] uppercase tracking-wide font-bold">${t}</th>`).join('')}</tr></thead>`;
const td = (v, al = 'l', cls = '') => `<td class="py-1.5 px-2 border-b border-slate-100 ${al === 'r' ? 'text-right font-mono' : ''} ${cls}">${v}</td>`;

function hash(str) { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; return h; }

export function renderSecurityReport(a, user = {}) {
  const code = `SEG-${new Date(a.meta.analyzedAt).toISOString().slice(0, 10).replace(/-/g, '')}-${String(Math.abs(hash(a.meta.projectName + a.meta.analyzedAt)) % 10000).padStart(4, '0')}`;
  const project = a.meta.projectName;
  const g = a.score.grade;
  const totalInstances = a.findings.reduce((n, f) => n + f.count, 0);
  const date = new Date(a.meta.analyzedAt);
  const ctx = { project, code };
  const pages = [];

  // ================= PORTADA
  pages.push(page(`
    <div style="background:linear-gradient(135deg,#0f172a 0%,#1e3a8a 60%,#0e7490 100%);color:#fff;padding:56px 56px 44px">
      <p style="letter-spacing:.3em;font-size:10px;font-weight:700;opacity:.75;margin:0 0 28px">SALESIA ENTERPRISE · SEGURIDAD DE SOFTWARE</p>
      <h1 style="font-size:36px;line-height:1.05;font-weight:900;margin:0 0 10px;letter-spacing:-.02em">Informe de Análisis<br>de Seguridad</h1>
      <p style="font-size:14px;opacity:.9;margin:0 0 36px">Evaluación estática del proyecto <strong>${e(project)}</strong></p>
      <div style="display:flex;align-items:center;gap:32px;background:#fff;border-radius:18px;padding:24px 32px;color:#0f172a">
        ${gaugeSvg(a.score.value, g.color, 170, `GRADO ${g.letter}`)}
        <div>
          <p style="font-size:10px;font-weight:700;letter-spacing:.15em;color:#64748b;margin:0">NIVEL DE SEGURIDAD</p>
          <p style="font-size:30px;font-weight:900;margin:2px 0 6px;color:${g.color}">${e(g.name)}</p>
          <p style="font-size:12px;color:#334155;margin:0 0 10px">Riesgo <strong>${e(g.risk.toLowerCase())}</strong> · ${fmt(a.findings.length)} tipos de hallazgos (${fmt(totalInstances)} ocurrencias)</p>
          <div style="display:flex;gap:6px;flex-wrap:wrap">${SEV_ORDER.filter(s => a.score.bySeverity[s]).map(s => `<span style="background:${SEV[s].soft};color:${SEV[s].color};border:1px solid ${SEV[s].color}44;border-radius:6px;padding:2px 8px;font-size:11px;font-weight:800">${a.score.bySeverity[s]} ${SEV[s].label}${a.score.bySeverity[s] > 1 ? 's' : ''}</span>`).join('') || '<span style="font-size:11px;color:#16a34a;font-weight:700">Sin hallazgos</span>'}</div>
        </div>
      </div>
    </div>
    <div style="padding:36px 56px 40px">
      <table class="text-[12px]" style="width:100%"><tbody>
        ${[['Archivo analizado', a.meta.fileName], ['Tamaño del ZIP', fmtBytes(a.meta.zipBytes)], ['Archivos / líneas analizadas', `${fmt(a.inventory.analyzedFiles)} archivos · ${fmt(a.inventory.totalLines)} líneas`],
          ['Fecha del análisis', `${date.toLocaleDateString('es-PE', { dateStyle: 'long' })} ${date.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}`],
          ['Generado por', user.name ? `${user.name} (${user.role})` : '—'], ['Código del informe', code], ['Versión del analizador', `v${a.meta.analyzerVersion} · ${(a.meta.durationMs / 1000).toFixed(1)} s`]]
          .map(([k, v]) => `<tr><td class="py-2 text-slate-500 w-52 border-b border-slate-100">${k}</td><td class="py-2 font-semibold border-b border-slate-100">${e(v)}</td></tr>`).join('')}
      </tbody></table>
      <div style="margin-top:28px;border:1px solid #e2e8f0;border-radius:10px;padding:14px 18px;background:#f8fafc;font-size:10.5px;color:#475569;line-height:1.55">
        <strong>Contenido:</strong> 1 Resumen ejecutivo · 2 Alcance y metodología · 3 Inventario del proyecto · 4 Resultados por categoría · 5 Hallazgos detallados · 6 Dependencias · 7 Controles de seguridad · 8 Plan de remediación.
        Documento confidencial: contiene ubicaciones de posibles debilidades. Los secretos detectados se muestran enmascarados.
      </div>
    </div>`, { cover: true, ...ctx }));

  // ================= 1. RESUMEN EJECUTIVO
  const sevTotal = SEV_ORDER.reduce((n, s) => n + a.score.bySeverity[s], 0) || 1;
  const top = a.findings.slice(0, 5);
  const firstSteps = [];
  if (a.findings.some(f => f.category === 'Secretos y credenciales' && ['critical', 'high'].includes(f.severity))) firstSteps.push('Revocar y rotar de inmediato todas las credenciales, claves y tokens expuestos, y retirarlos del código y del historial de Git.');
  if (a.findings.some(f => f.category === 'Código inseguro' && ['critical', 'high'].includes(f.severity))) firstSteps.push('Corregir las vulnerabilidades de inyección y ejecución de código (SQL, comandos, eval) usando consultas parametrizadas y validación de entradas.');
  if (a.dependencies.flagged.length) firstSteps.push(`Actualizar las ${a.dependencies.flagged.length} dependencias con vulnerabilidades conocidas y verificar con una herramienta de auditoría de paquetes.`);
  if (a.findings.some(f => f.category === 'Configuración e infraestructura')) firstSteps.push('Endurecer la configuración: contenedores sin privilegios, CORS restringido, modo debug desactivado y permisos mínimos en el CI.');
  if (!firstSteps.length) firstSteps.push('Mantener las buenas prácticas actuales, automatizar el análisis en cada cambio y repetir esta evaluación periódicamente.');

  pages.push(page(`
    ${h2(1, 'Resumen ejecutivo')}
    <div class="flex items-center gap-6 mb-5 doc-block">
      <div class="shrink-0">${gaugeSvg(a.score.value, g.color, 130, `GRADO ${g.letter}`)}</div>
      <div class="text-[12px] leading-relaxed text-slate-700">
        <p class="mb-2">El proyecto <strong>${e(project)}</strong> obtuvo un puntaje de seguridad de <strong style="color:${g.color}">${a.score.value}%</strong> (grado <strong>${g.letter} · ${e(g.name)}</strong>, riesgo ${e(g.risk.toLowerCase())}).</p>
        <p class="mb-2">${e(verdict(a))}</p>
        <p>Se revisaron <strong>${fmt(a.inventory.analyzedFiles)}</strong> archivos (<strong>${fmt(a.inventory.totalLines)}</strong> líneas) y se identificaron <strong>${fmt(a.findings.length)}</strong> tipos de hallazgos con <strong>${fmt(totalInstances)}</strong> ocurrencias.</p>
        ${a.score.caps.length ? `<p class="mt-2 text-[11px] px-3 py-2 rounded" style="background:#fff7ed;border:1px solid #fed7aa;color:#9a3412"><strong>Nota:</strong> el puntaje se limitó a ${Math.min(...a.score.caps.map(c => c.max))}% porque ${e(a.score.caps.map(c => c.reason.toLowerCase()).join('; '))}. Sin ese límite habría sido ${a.score.raw}%.</p>` : ''}
      </div>
    </div>
    ${h3('Distribución por severidad')}
    <div class="doc-block">
      <div class="flex h-5 rounded overflow-hidden mb-2 border border-slate-200">${SEV_ORDER.filter(s => a.score.bySeverity[s]).map(s => `<span style="width:${a.score.bySeverity[s] / sevTotal * 100}%;background:${SEV[s].color}" title="${SEV[s].label}"></span>`).join('') || '<span style="width:100%;background:#16a34a"></span>'}</div>
      <div class="grid grid-cols-5 gap-2 text-center">${SEV_ORDER.map(s => `<div class="rounded border border-slate-200 py-2"><p class="text-[18px] font-black font-mono" style="color:${SEV[s].color}">${a.score.bySeverity[s]}</p><p class="text-[9px] uppercase tracking-wide text-slate-500">${SEV[s].label}</p></div>`).join('')}</div>
    </div>
    ${h3('Principales riesgos')}
    ${top.length ? `<table class="text-[11px]">${th([['#'], ['Hallazgo'], ['Severidad'], ['Ocurrencias', 'r']])}<tbody>${top.map(f => `<tr>${td(f.id)}${td(`<strong>${e(f.title)}</strong><span class="block text-[10px] text-slate-400">${e(f.category)}</span>`)}${td(sevBadge(f.severity))}${td(fmt(f.count), 'r')}</tr>`).join('')}</tbody></table>` : '<p class="text-[12px] text-emerald-700 font-semibold">No se detectaron hallazgos con las reglas actuales.</p>'}
    ${h3('Qué hacer primero')}
    <ol class="list-decimal pl-5 space-y-1.5 text-[12px] text-slate-700 leading-relaxed">${firstSteps.map(s => `<li>${e(s)}</li>`).join('')}</ol>`,
    { ...ctx, section: '1 · Resumen' }));

  // ================= 2. ALCANCE Y METODOLOGÍA
  const nRules = LINE_RULES.length + FILE_RULES.length + DOCKER_RULES.length;
  pages.push(page(`
    ${h2(2, 'Alcance y metodología')}
    ${h3('Alcance del análisis')}
    <table class="text-[11px]">${th([['Concepto'], ['Cantidad', 'r']])}<tbody>
      ${[['Archivos en el ZIP', a.inventory.totalFiles], ['Archivos analizados (contenido)', a.inventory.analyzedFiles], ['Líneas de texto revisadas', a.inventory.totalLines],
        ['Omitidos: carpetas de dependencias o compilación', a.inventory.skipped.excluded], ['Omitidos: archivos binarios (imágenes, fuentes…)', a.inventory.skipped.binary], ['Omitidos: archivos minificados', a.inventory.skipped.minified],
        ['Omitidos: demasiado grandes (> 2 MB)', a.inventory.skipped.tooLarge], ['Omitidos: cifrados o ilegibles', a.inventory.skipped.encrypted + a.inventory.skipped.unreadable]]
        .map(([k, v]) => `<tr>${td(k)}${td(fmt(v), 'r')}</tr>`).join('')}
    </tbody></table>
    ${h3('Qué se evalúa')}
    <p class="text-[11px] text-slate-600 leading-relaxed mb-2">El análisis es <strong>estático</strong>: lee el código y la configuración sin ejecutarlos. Aplica ${nRules} reglas de detección agrupadas en seis categorías, alineadas con OWASP Top 10 (2021) y CWE:</p>
    <ul class="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px] text-slate-700 list-disc pl-5">
      <li><strong>Secretos y credenciales:</strong> claves de nube, tokens, contraseñas, llaves privadas, archivos .env.</li>
      <li><strong>Código inseguro:</strong> inyección SQL y de comandos, eval, XSS, deserialización.</li>
      <li><strong>Criptografía y autenticación:</strong> hashes débiles, aleatoriedad predecible, cookies, JWT.</li>
      <li><strong>Dependencias:</strong> versiones con vulnerabilidades conocidas, falta de lockfile.</li>
      <li><strong>Configuración e infraestructura:</strong> Docker, CI/CD, CORS, modo debug.</li>
      <li><strong>Buenas prácticas:</strong> .gitignore, política de seguridad, pruebas, análisis automático.</li>
    </ul>
    ${h3('Cómo se calcula el porcentaje')}
    <div class="text-[11px] text-slate-700 leading-relaxed doc-block">
      <p class="mb-2">Cada tipo de hallazgo resta una <strong>penalización</strong> según su severidad. Si se repite, la penalización crece un 25 % por ocurrencia adicional (hasta 7 repeticiones). Las buenas prácticas detectadas suman un bono (máx. 8 puntos de penalización). El resultado se convierte a porcentaje con una curva decreciente: <span class="font-mono">puntaje = 100 × e<sup>−(penalización − bono) / ${DECAY}</sup></span>.</p>
      <table class="mb-2">${th([['Severidad'], ['Penalización base', 'r'], ['Tope del puntaje si existe', 'r']])}<tbody>
        ${[['critical', '20', '64 % (3 o más tipos: 44 %; 6 o más: 34 %)'], ['high', '10', '89 % (4 o más tipos: 74 %)'], ['medium', '5', '—'], ['low', '2', '—'], ['info', '0,5', '—']].map(([s, w, c]) => `<tr>${td(sevBadge(s))}${td(w, 'r')}${td(c, 'r', 'text-[10px]')}</tr>`).join('')}
      </tbody></table>
      <p>Bandas: <strong>A</strong> Excelente ≥ 90 · <strong>B</strong> Buena 75–89 · <strong>C</strong> Regular 60–74 · <strong>D</strong> Deficiente 40–59 · <strong>E</strong> Crítica &lt; 40.</p>
    </div>
    ${h3('Limitaciones')}
    <ul class="list-disc pl-5 space-y-1 text-[11px] text-slate-600 leading-relaxed">
      <li>Son heurísticas por línea: pueden existir <strong>falsos positivos</strong> (alertas que no son un riesgo real) y <strong>falsos negativos</strong> (riesgos no detectados).</li>
      <li>No ejecuta el programa ni prueba la red, la base de datos ni la infraestructura real; no reemplaza pruebas de penetración ni revisión de arquitectura.</li>
      <li>La lista de dependencias vulnerables es <strong>indicativa y sin conexión</strong>; confirma con npm audit, pip-audit u OWASP Dependency-Check.</li>
      <li>Las rutas de archivos de prueba o documentación se reportan con severidad reducida.</li>
    </ul>`, { ...ctx, section: '2 · Metodología' }));

  // ================= 3. INVENTARIO + 4. CATEGORÍAS
  pages.push(page(`
    ${h2(3, 'Inventario del proyecto')}
    <div class="grid grid-cols-4 gap-2 mb-4 doc-block">${[['Archivos', a.inventory.totalFiles], ['Líneas', a.inventory.totalLines], ['Lenguajes', a.inventory.languages.length], ['Dependencias', a.inventory.dependencies]].map(([k, v]) => `<div class="border border-slate-300 rounded-lg px-3 py-2"><p class="text-[9px] uppercase tracking-wide text-slate-500">${k}</p><p class="text-[18px] font-black font-mono">${fmt(v)}</p></div>`).join('')}</div>
    ${h3('Lenguajes y formatos')}
    ${a.inventory.languages.length ? `<table class="text-[11px]">${th([['Lenguaje'], ['Archivos', 'r'], ['Líneas', 'r'], ['Proporción']])}<tbody>${a.inventory.languages.slice(0, 10).map(l => `<tr>${td(`<strong>${e(l.name)}</strong>`)}${td(fmt(l.files), 'r')}${td(fmt(l.lines), 'r')}${td(`<div class="flex items-center gap-2"><div class="flex-1">${bar(l.pct, '#1e3a8a')}</div><span class="w-10 text-right font-mono text-[10px]">${l.pct}%</span></div>`)}</tr>`).join('')}</tbody></table>` : '<p class="text-[11px] text-slate-400">Sin archivos de texto reconocidos.</p>'}
    ${h3('Tecnologías y herramientas detectadas')}
    <p class="text-[11px]">${a.inventory.frameworks.length ? a.inventory.frameworks.map(f => `<span class="inline-block mr-1.5 mb-1 px-2 py-0.5 rounded bg-slate-100 border border-slate-200 font-semibold">${e(f)}</span>`).join('') : '<span class="text-slate-400">No se identificaron frameworks conocidos.</span>'}</p>
    ${h3('Manifiestos de dependencias')}
    ${a.inventory.manifests.length ? `<table class="text-[11px]">${th([['Archivo'], ['Tipo'], ['Dependencias', 'r']])}<tbody>${a.inventory.manifests.map(m => `<tr>${td(`<span class="font-mono text-[10px]">${e(m.path)}</span>`)}${td(e(m.type))}${td(fmt(m.count), 'r')}</tr>`).join('')}</tbody></table>` : '<p class="text-[11px] text-slate-400">No se encontraron manifiestos de dependencias.</p>'}
    ${h3('Carpetas principales')}
    <table class="text-[11px]">${th([['Carpeta'], ['Archivos', 'r']])}<tbody>${a.inventory.folders.map(f => `<tr>${td(`<span class="font-mono text-[10px]">${e(f.name)}</span>`)}${td(fmt(f.count), 'r')}</tr>`).join('')}</tbody></table>
    ${h2(4, 'Resultados por categoría', 'mt-8')}
    <div class="space-y-2.5 doc-block">${a.score.byCategory.map(c => `
      <div class="flex items-center gap-3 text-[11px]"><span class="w-48 shrink-0 font-semibold">${e(c.category)}</span><div class="flex-1">${bar(c.score, scoreColor(c.score))}</div>
      <span class="w-12 text-right font-mono font-extrabold" style="color:${scoreColor(c.score)}">${c.score}%</span><span class="w-28 text-right text-slate-400 text-[10px]">${c.findings} tipos · ${fmt(c.instances)} ocurr.</span></div>`).join('')}</div>`,
    { ...ctx, section: '3-4 · Inventario y categorías' }));

  // ================= 5. HALLAZGOS DETALLADOS
  const findingBlock = (f) => `
    <div class="finding-card border border-slate-300 rounded-lg mb-4 overflow-hidden" style="break-inside:avoid">
      <div class="flex items-start justify-between gap-3 px-4 py-2.5" style="background:${SEV[f.severity].soft};border-bottom:1px solid ${SEV[f.severity].color}33">
        <div><p class="text-[10px] font-mono text-slate-500">${f.id}</p><p class="text-[13px] font-extrabold text-slate-900 leading-snug">${e(f.title)}</p></div>
        <div class="text-right shrink-0">${sevBadge(f.severity)}<p class="text-[10px] text-slate-500 mt-1">${fmt(f.count)} ocurrencia${f.count === 1 ? '' : 's'}</p></div>
      </div>
      <div class="px-4 py-3 text-[11px] leading-relaxed">
        <p class="text-[10px] text-slate-500 mb-2"><strong>Categoría:</strong> ${e(f.category)} · <strong>${e(f.cwe)}</strong> · ${e(f.owasp)}</p>
        <p class="mb-2"><strong>Descripción.</strong> ${e(f.description)}</p>
        <p class="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">Ubicaciones</p>
        <table class="mb-2" style="table-layout:fixed">${f.instances.slice(0, 6).map(i => `<tr><td class="py-1 pr-2 font-mono text-[10px] text-slate-700 align-top border-b border-slate-100" style="width:38%;word-break:break-all">${e(i.file)}${i.line ? `:${i.line}` : ''}</td><td class="py-1 font-mono text-[10px] text-slate-500 align-top border-b border-slate-100" style="word-break:break-all">${e(i.snippet || i.note || '')}${i.snippet && i.note ? `<span class="block text-[9px] text-slate-400 italic">${e(i.note)}</span>` : ''}</td></tr>`).join('')}</table>
        ${f.count > 6 ? `<p class="text-[10px] text-slate-400 mb-2">… y ${fmt(f.count - 6)} ocurrencia(s) más (disponibles en la exportación JSON/CSV).</p>` : ''}
        <div class="rounded px-3 py-2" style="background:#f0fdf4;border:1px solid #bbf7d0"><strong class="text-emerald-800">Recomendación.</strong> <span class="text-slate-700">${e(f.recommendation)}</span></div>
      </div>
    </div>`;
  const grouped = SEV_ORDER.map(s => [s, a.findings.filter(f => f.severity === s)]).filter(([, l]) => l.length);
  pages.push(page(`
    ${h2(5, 'Hallazgos detallados')}
    ${grouped.length ? grouped.map(([s, list]) => `<h3 class="text-[12px] font-extrabold uppercase tracking-wide mt-4 mb-2 flex items-center gap-2" style="color:${SEV[s].color}"><span class="inline-block w-2.5 h-2.5 rounded-sm" style="background:${SEV[s].color}"></span>Severidad ${SEV[s].label.toLowerCase()} (${list.length})</h3>${list.map(findingBlock).join('')}`).join('')
      : '<p class="text-[12px] text-emerald-700 font-semibold">No se detectaron hallazgos con las reglas actuales.</p>'}`, { ...ctx, section: '5 · Hallazgos' }));

  // ================= 6. DEPENDENCIAS + 7. CONTROLES
  const flagged = a.dependencies.flagged;
  const present = a.controls.filter(c => c.present), missing = a.controls.filter(c => !c.present);
  pages.push(page(`
    ${h2(6, 'Dependencias')}
    <p class="text-[11px] text-slate-600 mb-3">Se identificaron <strong>${fmt(a.dependencies.total)}</strong> dependencias declaradas; <strong style="color:${flagged.length ? '#b91c1c' : '#16a34a'}">${flagged.length}</strong> coinciden con vulnerabilidades conocidas de la lista de referencia.</p>
    ${flagged.length ? `<table class="text-[11px]">${th([['Paquete'], ['Versión'], ['Aviso'], ['Severidad'], ['Corregido en']])}<tbody>${flagged.map(d => `<tr>${td(`<strong>${e(d.name)}</strong><span class="block text-[9px] text-slate-400 font-mono">${e(d.file)}</span>`)}${td(`<span class="font-mono">${e(d.version)}</span>${d.resolved ? '<span class="block text-[9px] text-slate-400">lockfile</span>' : ''}`)}${td(`<span class="font-mono text-[10px]">${e(d.advisory.id)}</span><span class="block text-[10px] text-slate-500">${e(d.advisory.title)}</span>`)}${td(sevBadge(d.advisory.severity))}${td(`<span class="font-mono">${e(d.advisory.fixed)}+</span>`)}</tr>`).join('')}</tbody></table>`
      : '<p class="text-[11px] text-emerald-700 font-semibold">Ninguna dependencia coincide con los avisos conocidos.</p>'}
    <p class="text-[10px] text-slate-400 mt-2">Lista indicativa y sin conexión (${ADVISORIES.length} componentes frecuentes). Para un análisis completo usa npm audit, pip-audit, OWASP Dependency-Check o Dependabot.</p>
    ${h2(7, 'Controles de seguridad', 'mt-8')}
    <div class="grid grid-cols-2 gap-4 doc-block">
      <div><p class="text-[10px] font-bold uppercase tracking-wide text-emerald-700 mb-1.5">Detectados (${present.length})</p>${present.length ? present.map(c => `<p class="text-[11px] py-1 border-b border-slate-100"><span class="text-emerald-600 font-black mr-1.5">✓</span>${e(c.label)}</p>`).join('') : '<p class="text-[11px] text-slate-400">Ninguno.</p>'}</div>
      <div><p class="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">No detectados (${missing.length})</p>${missing.length ? missing.map(c => `<p class="text-[11px] py-1 border-b border-slate-100 text-slate-600"><span class="text-slate-400 font-black mr-1.5">○</span>${e(c.label)}</p>`).join('') : '<p class="text-[11px] text-emerald-700">Todos detectados.</p>'}</div>
    </div>
    <p class="text-[10px] text-slate-400 mt-2">“No detectado” no implica que falte: el análisis solo reconoce los controles por su nombre o dependencia típica.</p>`, { ...ctx, section: '6-7 · Dependencias y controles' }));

  // ================= 8. PLAN DE REMEDIACIÓN
  const plan = [1, 2, 3].map(p => [p, a.findings.filter(f => priorityOf(f) === p)]).filter(([, l]) => l.length);
  pages.push(page(`
    ${h2(8, 'Plan de remediación priorizado')}
    <p class="text-[11px] text-slate-600 mb-3">Orden sugerido de corrección según severidad y esfuerzo estimado. Los plazos son una referencia para un equipo pequeño.</p>
    ${plan.length ? plan.map(([p, list]) => `
      <div class="mb-4 doc-block"><p class="text-[11px] font-extrabold uppercase tracking-wide mb-1.5" style="color:${PRIORITIES[p][2]}">Prioridad ${p} · ${PRIORITIES[p][0]} <span class="font-semibold normal-case text-slate-400">(${PRIORITIES[p][1]})</span></p>
      <table class="text-[11px]">${th([['ID'], ['Acción recomendada'], ['Severidad'], ['Esfuerzo']])}<tbody>${list.map(f => `<tr>${td(f.id)}${td(`<strong>${e(f.title)}</strong><span class="block text-[10px] text-slate-500">${e(f.recommendation)}</span>`)}${td(sevBadge(f.severity))}${td(effort(f))}</tr>`).join('')}</tbody></table></div>`).join('')
      : '<p class="text-[12px] text-emerald-700 font-semibold">No hay acciones pendientes con las reglas actuales.</p>'}
    <div class="mt-6 rounded-lg px-4 py-3 text-[10.5px] text-slate-600 leading-relaxed" style="background:#f8fafc;border:1px solid #e2e8f0">
      <strong>Aviso:</strong> este informe se generó con análisis estático automatizado y debe interpretarse como una guía de priorización, no como una certificación de seguridad. Tras corregir los hallazgos, vuelve a analizar el proyecto para verificar la mejora, y complementa con revisión manual, pruebas de penetración y análisis de dependencias.
    </div>`, { ...ctx, section: '8 · Plan de remediación' }));

  return { html: `<div id="secReportPaper" class="space-y-6">${pages.join('')}</div>`, code };
}

export function findingsToCsv(a) {
  const rows = [['ID', 'Severidad', 'Categoría', 'Hallazgo', 'CWE', 'OWASP', 'Archivo', 'Línea', 'Evidencia (enmascarada)', 'Recomendación']];
  for (const f of a.findings) for (const i of f.instances) rows.push([f.id, SEV[f.severity].label, f.category, f.title, f.cwe, f.owasp, i.file, i.line || '', i.snippet || i.note || '', f.recommendation]);
  return rows.map(r => r.map(v => csvEscape(v)).join(',')).join('\r\n');
}

// ---------------------------------------------------------------- vista previa
export class SecurityReportViewer {
  constructor(app) { this.app = app; this.analysis = null; this.code = ''; }

  open(analysis) {
    this.analysis = analysis;
    const user = this.app.state.storage.get('currentUser', {});
    const { html, code } = renderSecurityReport(analysis, user);
    this.code = code;
    $('reportPanel').innerHTML = `
      <div class="no-print sticky top-0 z-10 bg-white border-b border-slate-200 rounded-t-2xl px-5 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <div class="flex items-center gap-2.5 mr-auto">
          <span class="w-9 h-9 rounded-xl bg-slate-900 text-white inline-flex items-center justify-center">${icon('lock', 'w-5 h-5')}</span>
          <div><p class="text-sm font-extrabold text-slate-900 leading-tight">Informe de seguridad · ${e(analysis.meta.projectName)}</p><p class="text-[11px] text-slate-400 leading-tight">Vista previa · revisa el documento antes de exportarlo</p></div>
        </div>
        <button type="button" id="secPdf" class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold" title="En la ventana de impresión elige &quot;Guardar como PDF&quot;">${icon('download', 'w-4 h-4')} Exportar PDF</button>
        <button type="button" id="secCsv" class="px-3.5 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold">Hallazgos (CSV)</button>
        <button type="button" id="secJson" class="px-3.5 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold">Datos (JSON)</button>
        <button type="button" id="secClose" class="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Cerrar">${icon('close')}</button>
      </div>
      <div class="print-scroll p-3 sm:p-6">${html}</div>`;
    $('secClose').onclick = () => Modal.close('reportModal');
    $('secPdf').onclick = () => printModal('reportModal');
    $('secCsv').onclick = () => downloadText(`${this.code}-hallazgos.csv`, findingsToCsv(this.analysis));
    $('secJson').onclick = () => downloadText(`${this.code}.json`, JSON.stringify({ informe: this.code, ...this.analysis }, null, 2), 'application/json;charset=utf-8', false);
    Modal.open('reportModal');
    $('reportPanel').scrollTop = 0;
  }
}
