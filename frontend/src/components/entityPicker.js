/**
 * @file entityPicker.js
 * @description Selector de tarjetas en ventana emergente (reemplaza a los <select>).
 * Pensado para muchos registros: búsqueda, chips de filtro y "Mostrar más".
 */

import { Modal } from './modal.js';
import { chipsHtml, icon, normalize } from './uiKit.js';
import { escapeHtml } from '../utils/formatters.js';

const PAGE = 12;
const $ = (id) => document.getElementById(id);

export class EntityPicker {
  static #cfg = null;
  static #limit = PAGE;
  static #chip = '';
  static #wired = false;

  /**
   * @param {object} cfg
   * @param {string} cfg.title / cfg.subtitle  Textos de cabecera
   * @param {() => Array} cfg.items            Devuelve la lista actual (se vuelve a pedir al refrescar)
   * @param {(item) => string} cfg.searchText  Texto sobre el que se busca
   * @param {(item) => string} cfg.renderCard  HTML interno de la tarjeta
   * @param {(item) => void} cfg.onPick        Se llama al elegir una tarjeta
   * @param {boolean} [cfg.closeOnPick=true]   false = se pueden elegir varias (p. ej. productos)
   * @param {Array<{key,label}>} [cfg.chips]   Filtros rápidos
   * @param {(item, key) => boolean} [cfg.chipMatch]
   * @param {(item) => boolean} [cfg.isDisabled]
   * @param {{label:string, handler:Function}|null} [cfg.create] Botón "+ Nuevo ..."
   */
  static open(cfg) {
    EntityPicker.#cfg = { closeOnPick: true, chips: [], ...cfg };
    EntityPicker.#limit = PAGE;
    EntityPicker.#chip = '';
    EntityPicker.#wire();

    $('pickerTitle').innerText = cfg.title;
    $('pickerSubtitle').innerText = cfg.subtitle || '';
    $('pickerSearch').value = '';
    $('pickerSearch').placeholder = cfg.placeholder || 'Buscar...';

    const create = $('pickerCreate');
    create.classList.toggle('hidden', !cfg.create);
    if (cfg.create) create.innerHTML = `${icon('plus', 'w-4 h-4')}<span>${escapeHtml(cfg.create.label)}</span>`;
    $('pickerDone').classList.toggle('hidden', cfg.closeOnPick !== false);

    EntityPicker.refresh();
    Modal.open('pickerModal');
    $('pickerSearch').focus();
  }

  static close() {
    Modal.close('pickerModal', true);
  }

  static #filtered() {
    const cfg = EntityPicker.#cfg;
    const q = normalize($('pickerSearch').value.trim());
    return cfg.items().filter(it =>
      (!q || normalize(cfg.searchText(it)).includes(q)) &&
      (!EntityPicker.#chip || cfg.chipMatch?.(it, EntityPicker.#chip)));
  }

  static refresh() {
    const cfg = EntityPicker.#cfg;
    if (!cfg) return;
    const all = cfg.items();
    const list = EntityPicker.#filtered();
    const shown = list.slice(0, EntityPicker.#limit);

    const chips = $('pickerChips');
    const options = cfg.chips.length ? [{ key: '', label: 'Todos' }, ...cfg.chips] : [];
    chips.innerHTML = chipsHtml(options, EntityPicker.#chip);
    chips.classList.toggle('hidden', options.length === 0);

    $('pickerGrid').innerHTML = shown.length === 0
      ? `<div class="col-span-full py-12 text-center text-sm text-slate-400">
           ${all.length === 0 ? escapeHtml(cfg.emptyText || 'No hay registros disponibles.') : 'Ningún resultado coincide con tu búsqueda.'}
         </div>`
      : shown.map(it => `
          <button type="button" data-pick="${escapeHtml(it.id)}" ${cfg.isDisabled?.(it) ? 'disabled' : ''}
            class="pick-card text-left bg-white border border-slate-200 rounded-xl p-3.5 hover:border-blue-400 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:hover:shadow-none disabled:hover:border-slate-200">
            ${cfg.renderCard(it)}
          </button>`).join('');

    const remaining = list.length - shown.length;
    $('pickerCount').innerText = `${list.length} de ${all.length} resultados`;
    $('pickerMore').classList.toggle('hidden', remaining <= 0);
    $('pickerMore').innerText = `Mostrar más (${remaining} restantes)`;
  }

  static #pick(id) {
    const cfg = EntityPicker.#cfg;
    const item = cfg.items().find(it => String(it.id) === String(id));
    if (!item || cfg.isDisabled?.(item)) return;
    cfg.onPick(item);
    if (cfg.closeOnPick) EntityPicker.close();
    else EntityPicker.refresh();
  }

  static #wire() {
    if (EntityPicker.#wired) return;
    EntityPicker.#wired = true;

    $('pickerSearch').addEventListener('input', () => { EntityPicker.#limit = PAGE; EntityPicker.refresh(); });
    $('pickerSearch').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const first = EntityPicker.#filtered().find(it => !EntityPicker.#cfg.isDisabled?.(it));
      if (first) EntityPicker.#pick(first.id);
    });
    $('pickerGrid').addEventListener('click', (e) => {
      const card = e.target.closest('[data-pick]');
      if (card) EntityPicker.#pick(card.dataset.pick);
    });
    $('pickerChips').addEventListener('click', (e) => {
      const chip = e.target.closest('[data-chip]');
      if (!chip) return;
      EntityPicker.#chip = chip.dataset.chip;
      EntityPicker.#limit = PAGE;
      EntityPicker.refresh();
    });
    $('pickerMore').addEventListener('click', () => { EntityPicker.#limit += PAGE; EntityPicker.refresh(); });
    $('pickerCreate').addEventListener('click', () => EntityPicker.#cfg?.create?.handler());
    $('pickerClose').addEventListener('click', () => EntityPicker.close());
    $('pickerDone').addEventListener('click', () => EntityPicker.close());
  }
}
