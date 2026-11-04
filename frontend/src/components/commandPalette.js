/**
 * @file commandPalette.js
 * @description Buscador global (Ctrl + K): acciones rápidas, ir a un módulo y
 * encontrar clientes o productos escribiendo su nombre.
 */

import { Modal } from './modal.js';
import { icon, normalize, avatar } from './uiKit.js';
import { PAGE_META } from '../app/pages.js';
import { ROUTE_ORDER, canAccess } from '../app/permissions.js';
import { escapeHtml } from '../utils/formatters.js';

const $ = (id) => document.getElementById(id);

export class CommandPalette {
  static #app = null;
  static #items = [];
  static #selected = 0;

  static init(app) {
    CommandPalette.#app = app;
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        CommandPalette.open();
      }
    });
    $('btnPalette')?.addEventListener('click', () => CommandPalette.open());
    $('paletteInput').addEventListener('input', () => { CommandPalette.#selected = 0; CommandPalette.#render(); });
    $('paletteInput').addEventListener('keydown', (e) => {
      const n = CommandPalette.#items.length;
      if (e.key === 'ArrowDown') { e.preventDefault(); CommandPalette.#selected = (CommandPalette.#selected + 1) % Math.max(n, 1); CommandPalette.#render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); CommandPalette.#selected = (CommandPalette.#selected - 1 + n) % Math.max(n, 1); CommandPalette.#render(); }
      else if (e.key === 'Enter') { e.preventDefault(); CommandPalette.#run(CommandPalette.#selected); }
    });
    $('paletteList').addEventListener('click', (e) => {
      const row = e.target.closest('[data-idx]');
      if (row) CommandPalette.#run(parseInt(row.dataset.idx, 10));
    });
  }

  static open() {
    $('paletteInput').value = '';
    CommandPalette.#selected = 0;
    CommandPalette.#render();
    Modal.open('paletteModal');
    $('paletteInput').focus();
  }

  static #build(query) {
    const app = CommandPalette.#app;
    const role = app.getCurrentRole();
    const items = [];

    const actions = [
      { action: 'sale', route: 'pos', label: 'Nueva venta', hint: 'Emitir una venta', icon: 'sales' },
      { action: 'quote', route: 'quotes', label: 'Nueva cotización', hint: 'Preparar un presupuesto', icon: 'quote' },
      { action: 'customer', route: 'customers', label: 'Nuevo cliente', hint: 'Registrar un cliente', icon: 'users' },
      { action: 'product', route: 'products', label: 'Nuevo producto', hint: 'Agregar al catálogo', icon: 'tag' }
    ];
    for (const a of actions) {
      if (canAccess(role, a.route)) items.push({ group: 'Crear', ...a, icon: 'plus', run: () => app.quick(a.action) });
    }
    for (const route of ROUTE_ORDER) {
      if (!canAccess(role, route)) continue;
      const m = PAGE_META[route];
      items.push({ group: 'Ir a', label: m.title, hint: m.subtitle, icon: m.icon, run: () => app.router.navigate(route) });
    }

    const q = normalize(query).trim();
    let result = q ? items.filter(i => normalize(`${i.label} ${i.hint}`).includes(q)) : items;

    if (q.length >= 2) {
      const storage = app.state.storage;
      if (canAccess(role, 'customers')) {
        storage.get('customers', []).filter(c => normalize(`${c.name} ${c.docNumber} ${c.email}`).includes(q)).slice(0, 4)
          .forEach(c => result.push({ group: 'Clientes', label: c.name, hint: `${c.docType} ${c.docNumber}`, avatarName: c.name, run: () => CommandPalette.#goSearch('customers', 'customersSearchInput', c.name) }));
      }
      if (canAccess(role, 'products')) {
        storage.get('products', []).filter(p => normalize(`${p.name} ${p.sku}`).includes(q)).slice(0, 4)
          .forEach(p => result.push({ group: 'Productos', label: p.name, hint: `${p.sku} · stock ${p.stock}`, icon: 'tag', run: () => CommandPalette.#goSearch('products', 'productsSearchInput', p.sku) }));
      }
    }
    return result;
  }

  static #goSearch(route, inputId, text) {
    const app = CommandPalette.#app;
    app.router.navigate(route);
    const input = $(inputId);
    if (input) { input.value = text; input.dispatchEvent(new Event('input')); }
  }

  static #render() {
    CommandPalette.#items = CommandPalette.#build($('paletteInput').value);
    const items = CommandPalette.#items;
    let lastGroup = '';
    $('paletteList').innerHTML = items.length === 0
      ? '<div class="py-10 text-center text-sm text-slate-400">Sin resultados.</div>'
      : items.map((it, i) => {
        const header = it.group !== lastGroup
          ? `<div class="px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">${escapeHtml(it.group)}</div>` : '';
        lastGroup = it.group;
        return `${header}
          <button type="button" data-idx="${i}" class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left ${i === CommandPalette.#selected ? 'bg-blue-50' : 'hover:bg-slate-50'}">
            ${it.avatarName ? avatar(it.avatarName, 'w-8 h-8 text-[11px]') : `<span class="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 inline-flex items-center justify-center">${icon(it.icon, 'w-4 h-4')}</span>`}
            <span class="min-w-0 flex-1"><span class="block text-sm font-semibold text-slate-800 truncate">${escapeHtml(it.label)}</span><span class="block text-[11px] text-slate-400 truncate">${escapeHtml(it.hint || '')}</span></span>
          </button>`;
      }).join('');
    $('paletteList').querySelector(`[data-idx="${CommandPalette.#selected}"]`)?.scrollIntoView({ block: 'nearest' });
  }

  static #run(index) {
    const item = CommandPalette.#items[index];
    if (!item) return;
    Modal.close('paletteModal', true);
    item.run();
  }
}
