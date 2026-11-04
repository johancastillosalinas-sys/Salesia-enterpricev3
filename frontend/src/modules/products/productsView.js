/**
 * @file productsView.js
 * @description Vista del catálogo de productos y categorías conforme a RF-04:
 * listado con búsqueda y filtro por categoría, alta, edición y desactivación (baja lógica).
 */

import { escapeHtml, formatCurrency } from '../../utils/formatters.js';
import { paginate, renderPager, chipsHtml, normalize } from '../../components/uiKit.js';

const PAGE_SIZE = 10;

export function isProductActive(product) {
  // Los productos del seed inicial ya traen status 'ACTIVE'; si falta, se considera activo.
  return (product.status || 'ACTIVE') === 'ACTIVE';
}

export class ProductsView {
  static page = 1;
  static category = '';

  /**
   * @param {Array} products Lista completa de productos
   * @param {{onEdit?:Function,onToggle?:Function,onPage?:Function}} handlers Acciones por fila
   */
  static render(products = [], handlers = {}, tbodyId = 'productsTableTbody') {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    const text = normalize(document.getElementById('productsSearchInput')?.value || '').trim();
    const showInactive = !!document.getElementById('productsShowInactive')?.checked;

    const visible = products.filter(p => {
      if (!showInactive && !isProductActive(p)) return false;
      if (ProductsView.category && p.categoryId !== ProductsView.category) return false;
      if (!text) return true;
      return [p.id, p.sku, p.name, p.categoryName].some(v => normalize(v).includes(text));
    });

    // Indicadores de la parte superior
    const activos = products.filter(isProductActive);
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.innerText = v; };
    set('productsKpiActive', activos.length);
    set('productsKpiValue', formatCurrency(activos.reduce((a, p) => a + (Number(p.cost) || 0) * (Number(p.stock) || 0), 0)));
    set('productsKpiLow', activos.filter(p => p.stock > 0 && p.stock <= p.minStock).length);
    set('productsKpiOut', activos.filter(p => p.stock <= 0).length);
    set('productsCounter', `${visible.length} mostrados · ${activos.length} activos de ${products.length}`);

    if (visible.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-12 text-center text-slate-400">${
        products.length === 0 ? 'Sin productos en catálogo. Pulsa “Nuevo producto”.' : 'Ningún producto coincide con el filtro.'
      }</td></tr>`;
      renderPager('productsPager', { total: 0, page: 1, size: PAGE_SIZE, onPage() {} });
      return;
    }

    const { items, page } = paginate(visible, ProductsView.page, PAGE_SIZE);
    ProductsView.page = page;

    tbody.innerHTML = items.map(p => {
      const active = isProductActive(p);
      const out = p.stock <= 0;
      const low = !out && p.stock <= p.minStock;
      const stockTone = out ? 'bg-slate-200 text-slate-700' : low ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800';
      return `
      <tr class="border-b border-slate-100 hover:bg-slate-50 text-xs ${active ? '' : 'opacity-60'}">
        <td class="px-4 py-3">
          <p class="font-semibold text-slate-900">${escapeHtml(p.name)}</p>
          <p class="text-[11px] font-mono text-cyan-700">${escapeHtml(p.sku)}</p>
        </td>
        <td class="px-4 py-3 text-slate-500">${escapeHtml(p.categoryName || p.category)}</td>
        <td class="px-4 py-3 text-right font-mono font-bold text-slate-900">${formatCurrency(p.price)}</td>
        <td class="px-4 py-3 text-center">
          <span class="inline-flex px-2 py-0.5 rounded text-[11px] font-bold ${stockTone}">${out ? 'Agotado' : `${escapeHtml(p.stock)} ${escapeHtml(p.unit)}`}</span>
          <span class="block text-[10px] text-slate-400 mt-0.5">mín. ${escapeHtml(p.minStock)}</span>
        </td>
        <td class="px-4 py-3 text-center">
          <span class="inline-flex px-2 py-0.5 rounded text-[11px] font-bold ${active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}">${active ? 'Activo' : 'Inactivo'}</span>
        </td>
        <td class="px-4 py-3 text-center whitespace-nowrap">
          <button data-prod-edit="${escapeHtml(p.id)}" class="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold">Editar</button>
          <button data-prod-toggle="${escapeHtml(p.id)}" class="px-2.5 py-1 rounded font-semibold ${active ? 'bg-rose-50 hover:bg-rose-100 text-rose-700' : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'}">${active ? 'Desactivar' : 'Reactivar'}</button>
        </td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('[data-prod-edit]').forEach(b => { b.onclick = () => handlers.onEdit?.(b.getAttribute('data-prod-edit')); });
    tbody.querySelectorAll('[data-prod-toggle]').forEach(b => { b.onclick = () => handlers.onToggle?.(b.getAttribute('data-prod-toggle')); });

    renderPager('productsPager', {
      total: visible.length, page, size: PAGE_SIZE,
      onPage: (n) => { ProductsView.page = n; handlers.onPage?.(); }
    });
  }

  /** Dibuja los chips de categorías (conserva la selección actual). */
  static fillCategoryFilter(categories = []) {
    const box = document.getElementById('productsCategoryChips');
    if (!box) return;
    if (!categories.some(c => c.id === ProductsView.category)) ProductsView.category = '';
    box.innerHTML = chipsHtml([{ key: '', label: 'Todas' }, ...categories.map(c => ({ key: c.id, label: c.name }))], ProductsView.category);
  }

  /** Abre el modal en modo "nuevo" (product = null) o "editar". */
  static openForm(product = null, categories = []) {
    const modal = document.getElementById('productModal');
    if (!modal) return;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };

    const catList = document.getElementById('productCategoryList');
    if (catList) catList.innerHTML = categories.map(c => `<option value="${escapeHtml(c.name)}"></option>`).join('');

    set('productFormId', product?.id || '');
    set('productFormSku', product?.sku);
    set('productFormName', product?.name);
    set('productFormCategory', product?.categoryName || '');
    set('productFormPrice', product?.price);
    set('productFormCost', product?.cost ?? 0);
    set('productFormStock', product ? product.stock : 0);
    set('productFormMinStock', product?.minStock ?? 5);
    set('productFormUnit', product?.unit || 'UND');

    // En edición el stock no se modifica aquí: solo desde Inventario y Ventas.
    const stockInput = document.getElementById('productFormStock');
    const stockNote = document.getElementById('productFormStockNote');
    if (stockInput) stockInput.disabled = !!product;
    if (stockNote) {
      stockNote.innerText = product
        ? 'El stock se modifica desde Inventario.'
        : 'Stock inicial del producto.';
    }

    const title = document.getElementById('productModalTitle');
    if (title) title.innerText = product ? `Editar producto ${product.id}` : 'Nuevo producto';
    ProductsView.setFormError('');
    modal.classList.remove('hidden');
    document.getElementById('productFormSku')?.focus();
  }

  static closeForm() {
    document.getElementById('productModal')?.classList.add('hidden');
  }

  static setFormError(message) {
    const el = document.getElementById('productFormError');
    if (!el) return;
    el.innerText = message || '';
    el.classList.toggle('hidden', !message);
  }

  static readForm() {
    const val = id => document.getElementById(id)?.value ?? '';
    return {
      id: val('productFormId'),
      sku: val('productFormSku'),
      name: val('productFormName'),
      categoryName: val('productFormCategory'),
      price: val('productFormPrice'),
      cost: val('productFormCost'),
      stock: val('productFormStock'),
      minStock: val('productFormMinStock'),
      unit: val('productFormUnit')
    };
  }
}