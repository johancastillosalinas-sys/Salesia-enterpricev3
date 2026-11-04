/**
 * @file uiKit.js
 * @description Piezas visuales reutilizables del ERP: íconos, avatares, tarjetas de
 * cliente/producto/vendedor, chips de filtro y paginador.
 */

import { escapeHtml, formatCurrency } from '../utils/formatters.js';

const PATHS = {
  home: 'M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25',
  sales: 'M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z',
  quote: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z',
  users: 'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z',
  tag: 'M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3zM6 6h.008v.008H6V6z',
  cube: 'M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9',
  chart: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z',
  shield: 'M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z',
  clock: 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z',
  plus: 'M12 4.5v15m7.5-7.5h-15',
  search: 'M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z',
  close: 'M6 18L18 6M6 6l12 12',
  check: 'M4.5 12.75l6 6 9-13.5',
  receipt: 'M9 14.25l6-6m4.5-3.493V21.75l-3.75-1.5-3.75 1.5-3.75-1.5-3.75 1.5V4.757c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0c1.1.128 1.907 1.077 1.907 2.185zM9.75 9h.008v.008H9.75V9zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 4.5h.008v.008h-.008V13.5zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z',
  upload: 'M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5',
  download: 'M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3',
  printer: 'M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z',
  lock: 'M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z',
  eye: 'M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178zM15 12a3 3 0 11-6 0 3 3 0 016 0z',
  eyeoff: 'M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88',
  logout: 'M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9',
  bolt: 'M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z',
  trash: 'M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0',
  cash: 'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z',
  card: 'M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z',
  bank: 'M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z',
  phone: 'M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3'
};

export function icon(name, cls = 'w-5 h-5') {
  return `<svg class="${cls}" fill="none" viewBox="0 0 24 24" stroke-width="1.6" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="${PATHS[name] || ''}"/></svg>`;
}

/** Rellena todos los <span data-icon="..."> que haya en pantalla. */
export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(el => {
    el.innerHTML = icon(el.dataset.icon, el.dataset.iconClass || 'w-5 h-5');
  });
}

/** Quita tildes y pasa a minúsculas, para buscar sin importar acentos. */
export function normalize(text) {
  return String(text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// --------------------------------------------------------------- avatares y etiquetas
const TONES = ['bg-blue-100 text-blue-700', 'bg-cyan-100 text-cyan-700', 'bg-emerald-100 text-emerald-700',
  'bg-violet-100 text-violet-700', 'bg-amber-100 text-amber-700', 'bg-rose-100 text-rose-700'];

export function initials(name) {
  const words = String(name || '?').replace(/[^\p{L}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] || '?') + (words[1]?.[0] || '')).toUpperCase();
}

export function avatar(name, size = 'w-10 h-10 text-sm') {
  let h = 0;
  for (const ch of String(name || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `<span class="${size} shrink-0 rounded-xl font-bold inline-flex items-center justify-center ${TONES[h % TONES.length]}">${escapeHtml(initials(name))}</span>`;
}

const SEGMENT_TONES = {
  Corporativo: 'bg-blue-50 text-blue-700 border-blue-200',
  Pyme: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  Profesional: 'bg-violet-50 text-violet-700 border-violet-200',
  Personal: 'bg-slate-100 text-slate-600 border-slate-200'
};
export function segmentBadge(segment) {
  const tone = SEGMENT_TONES[segment] || SEGMENT_TONES.Personal;
  return `<span class="inline-flex px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wide ${tone}">${escapeHtml(segment || 'Sin segmento')}</span>`;
}

// --------------------------------------------------------------- contenido de tarjetas
export function customerCardHtml(c, extra = '') {
  return `
    <div class="flex items-start gap-3">
      ${avatar(c.name)}
      <div class="min-w-0 flex-1">
        <p class="font-semibold text-slate-900 text-sm leading-tight truncate">${escapeHtml(c.name)}</p>
        <p class="text-[11px] font-mono text-slate-500 mt-0.5">${escapeHtml(c.docType)} ${escapeHtml(c.docNumber)}</p>
        <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
          ${segmentBadge(c.segment)}
          ${c.email ? `<span class="text-[11px] text-slate-400 truncate">${escapeHtml(c.email)}</span>` : ''}
        </div>
      </div>
      ${extra}
    </div>`;
}

export function sellerCardHtml(s, extra = '') {
  return `
    <div class="flex items-center gap-3">
      ${avatar(s.name)}
      <div class="min-w-0 flex-1">
        <p class="font-semibold text-slate-900 text-sm leading-tight truncate">${escapeHtml(s.name)}</p>
        <p class="text-[11px] text-slate-400 truncate">${escapeHtml(s.email || '')}</p>
      </div>
      ${extra}
    </div>`;
}

export function productCardHtml(p, { qty = 0, trackStock = true } = {}) {
  const out = trackStock && p.stock <= 0;
  const low = trackStock && !out && p.stock <= p.minStock;
  const stockTone = out ? 'bg-slate-200 text-slate-600' : low ? 'bg-amber-100 text-amber-800' : 'bg-emerald-50 text-emerald-700';
  return `
    <div class="flex flex-col h-full ${out ? 'opacity-60' : ''}">
      <div class="flex items-center justify-between gap-2 mb-2">
        <span class="text-[11px] font-mono font-bold text-cyan-700 bg-cyan-50 px-2 py-0.5 rounded truncate">${escapeHtml(p.sku)}</span>
        <span class="text-[11px] font-semibold px-2 py-0.5 rounded ${stockTone}">${out ? 'Agotado' : `Stock ${escapeHtml(p.stock)}`}</span>
      </div>
      <p class="font-semibold text-slate-900 text-sm leading-snug">${escapeHtml(p.name)}</p>
      <p class="text-[11px] text-slate-400 mt-0.5">${escapeHtml(p.categoryName || p.category || '')}</p>
      <div class="mt-auto pt-3 flex items-center justify-between">
        <span class="text-sm font-extrabold text-slate-900">${formatCurrency(p.price)}</span>
        ${qty > 0 ? `<span class="text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">× ${qty} agregado</span>` : ''}
      </div>
    </div>`;
}

// --------------------------------------------------------------- chips y paginación
export function chipsHtml(options, active = '') {
  return options.map(o => `
    <button type="button" data-chip="${escapeHtml(o.key)}" class="px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
      o.key === active ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}">
      ${escapeHtml(o.label)}
    </button>`).join('');
}

export function paginate(list, page, size) {
  const pages = Math.max(1, Math.ceil(list.length / size));
  const current = Math.min(Math.max(1, page), pages);
  return { items: list.slice((current - 1) * size, current * size), page: current, pages };
}

export function renderPager(containerId, { total, page, size, onPage }) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (total <= size) { el.innerHTML = ''; return; }
  const pages = Math.ceil(total / size);
  const from = (page - 1) * size + 1;
  const to = Math.min(total, page * size);
  const start = Math.max(1, Math.min(page - 2, pages - 4));
  const nums = [];
  for (let n = start; n <= Math.min(pages, start + 4); n++) nums.push(n);
  const btn = (label, target, { active = false, disabled = false } = {}) => `
    <button type="button" ${disabled ? 'disabled' : `data-page="${target}"`} class="min-w-8 h-8 px-2 rounded-lg text-xs font-semibold ${
      active ? 'bg-blue-600 text-white' : disabled ? 'text-slate-300 cursor-not-allowed' : 'text-slate-600 hover:bg-slate-100'}">${label}</button>`;
  el.innerHTML = `
    <div class="flex flex-col sm:flex-row items-center justify-between gap-2 px-4 py-3 border-t border-slate-100 text-xs text-slate-500">
      <span>Mostrando ${from}–${to} de ${total}</span>
      <div class="flex items-center gap-1">
        ${btn('‹', page - 1, { disabled: page <= 1 })}
        ${nums.map(n => btn(n, n, { active: n === page })).join('')}
        ${btn('›', page + 1, { disabled: page >= pages })}
      </div>
    </div>`;
  el.querySelectorAll('[data-page]').forEach(b => { b.onclick = () => onPage(parseInt(b.dataset.page, 10)); });
}

/**
 * Convierte un <input type="hidden"> en un control de botones (en vez de un <select>).
 * El código que lee o escribe `input.value` sigue funcionando igual.
 */
export function bindSegmented(inputId, containerId, options) {
  const input = document.getElementById(inputId);
  const box = document.getElementById(containerId);
  if (!input || !box || input.__seg) return;
  input.__seg = true;
  const base = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  const paint = () => {
    box.innerHTML = options.map(o => `
      <button type="button" data-val="${escapeHtml(o)}" class="seg-btn flex-1 px-3 py-2 rounded-lg border text-xs font-semibold ${
        o === base.get.call(input) ? 'border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-500' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}">${escapeHtml(o)}</button>`).join('');
  };
  Object.defineProperty(input, 'value', {
    configurable: true,
    get() { return base.get.call(this); },
    set(v) { base.set.call(this, v); paint(); }
  });
  box.onclick = (e) => { const b = e.target.closest('[data-val]'); if (b) input.value = b.dataset.val; };
  paint();
}
