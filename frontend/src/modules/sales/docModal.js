/**
 * @file docModal.js
 * @description Ventana emergente para crear una VENTA o una COTIZACIÓN.
 * Cliente, vendedor y productos se eligen en tarjetas (EntityPicker), no en listas
 * desplegables, y desde ahí mismo se puede dar de alta un cliente o producto nuevo.
 */

import { Modal, ConfirmDialog } from '../../components/modal.js';
import { EntityPicker } from '../../components/entityPicker.js';
import { icon, customerCardHtml, sellerCardHtml, productCardHtml } from '../../components/uiKit.js';
import { isCustomerActive } from '../customers/customersView.js';
import { isProductActive } from '../products/productsView.js';
import { QuoteEngine } from '../quotes/quoteEngine.js';
import { canAccess } from '../../app/permissions.js';
import { formatCurrency, escapeHtml } from '../../utils/formatters.js';

const $ = (id) => document.getElementById(id);

const section = (n, title, body) => `
  <section>
    <div class="flex items-center gap-2 mb-2.5">
      <span class="w-5 h-5 rounded-full bg-slate-900 text-white text-[11px] font-bold inline-flex items-center justify-center">${n}</span>
      <h5 class="text-xs font-bold uppercase tracking-wider text-slate-500">${title}</h5>
    </div>
    ${body}
  </section>`;

export class DocModal {
  constructor(app) {
    this.app = app;
    this.mode = 'sale';
    this.customer = null;
    this.seller = null;
    this.cart = [];
    this.busy = false;
  }

  get isSale() { return this.mode === 'sale'; }
  get storage() { return this.app.state.storage; }

  // ------------------------------------------------------------------ apertura
  open(mode = 'sale') {
    this.mode = mode;
    this.customer = null;
    this.cart = [];
    this.busy = false;
    this.seller = this.#defaultSeller();

    this.#renderShell();
    this.renderCustomer();
    this.renderSeller();
    this.renderLines();
    this.renderSummary();

    $('docModal').__beforeClose = () => this.#confirmDiscard();
    Modal.open('docModal');
  }

  /** Vendedores posibles: usuarios con rol de venta + vendedores importados (sin repetir nombres). */
  #sellerOptions() {
    const fromUsers = this.storage.get('users', []).filter(u => ['ADMINISTRADOR', 'VENDEDOR'].includes(u.role))
      .map(u => ({ id: u.id, name: u.name, email: u.email }));
    const names = new Set(fromUsers.map(u => u.name.toLowerCase()));
    const imported = this.storage.get('sellers', []).filter(s => !names.has(String(s.name).toLowerCase()));
    return [...fromUsers, ...imported];
  }

  #defaultSeller() {
    const user = this.storage.get('currentUser', {});
    const options = this.#sellerOptions();
    return options.find(s => s.id === user.id) || options[0] || null;
  }

  async #confirmDiscard() {
    if (!this.customer && this.cart.length === 0) return true;
    return ConfirmDialog.ask({
      title: '¿Descartar el borrador?',
      message: `Si cierras esta ventana se perderá ${this.isSale ? 'la venta' : 'la cotización'} que estás preparando.`,
      confirmText: 'Descartar', cancelText: 'Seguir editando', tone: 'danger'
    });
  }

  // ------------------------------------------------------------------ estructura
  #renderShell() {
    const isSale = this.isSale;
    $('docModalPanel').innerHTML = `
      <div class="flex items-start justify-between gap-4 px-6 py-4 border-b border-slate-100">
        <div class="flex items-center gap-3">
          <span class="w-10 h-10 rounded-xl ${isSale ? 'bg-blue-600' : 'bg-cyan-600'} text-white inline-flex items-center justify-center">${icon(isSale ? 'sales' : 'quote')}</span>
          <div>
            <h3 class="text-base font-extrabold text-slate-900">${isSale ? 'Nueva venta' : 'Nueva cotización'}</h3>
            <p class="text-xs text-slate-500">${isSale
              ? 'Elige el cliente y los productos. El cobro y la boleta o factura se hacen en el siguiente paso.'
              : 'Prepara un presupuesto. No descuenta stock hasta convertirlo en venta.'}</p>
          </div>
        </div>
        <button type="button" id="docClose" class="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Cerrar">${icon('close')}</button>
      </div>

      <div class="grid lg:grid-cols-5">
        <div class="lg:col-span-3 px-6 py-5 space-y-6 max-h-[62vh] overflow-y-auto">
          ${section(1, 'Cliente', '<div id="docCustomer"></div>')}
          ${isSale
            ? section(2, 'Vendedor', '<div id="docSeller"></div>')
            : section(2, 'Condiciones', `
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <label class="block"><span class="font-semibold text-slate-700 block mb-1">Descuento global (%)</span>
                    <input id="docGlobalDisc" type="number" min="0" max="50" value="0" class="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 font-mono"></label>
                  <label class="block sm:col-span-2"><span class="font-semibold text-slate-700 block mb-1">Notas / validez</span>
                    <input id="docNotes" type="text" placeholder="Ej. Validez 15 días, entrega en almacén" class="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50"></label>
                </div>`)}
          ${section(3, 'Productos', `
            <div id="docLines" class="space-y-2"></div>
            <button type="button" id="docAddProducts" class="mt-3 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              ${icon('plus', 'w-4 h-4')}<span>Agregar productos</span>
            </button>`)}
        </div>

        <aside class="lg:col-span-2 bg-slate-50 border-t lg:border-t-0 lg:border-l border-slate-100 px-6 py-5 flex flex-col gap-4">
          <h5 class="text-xs font-bold uppercase tracking-wider text-slate-500">Resumen</h5>
          <div id="docSummary" class="flex-1"></div>
          <p id="docError" class="hidden text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2"></p>
          <div class="space-y-2">
            <button type="button" id="docSubmit" class="w-full py-3 rounded-xl text-white font-bold text-xs tracking-wide shadow-md transition-all disabled:opacity-40 disabled:cursor-not-allowed ${isSale ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20' : 'bg-cyan-600 hover:bg-cyan-700 shadow-cyan-500/20'}"></button>
            <button type="button" id="docCancel" class="w-full py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-800">Cancelar</button>
          </div>
        </aside>
      </div>`;

    $('docClose').onclick = $('docCancel').onclick = () => Modal.close('docModal');
    $('docCustomer').onclick = (e) => { if (e.target.closest('[data-act="customer"]')) this.pickCustomer(); };
    if (isSale) {
      $('docSeller').onclick = (e) => { if (e.target.closest('[data-act="seller"]')) this.pickSeller(); };
    } else {
      $('docGlobalDisc').oninput = () => this.renderSummary();
    }
    $('docAddProducts').onclick = () => this.pickProducts();
    $('docLines').onclick = (e) => this.#onLineClick(e);
    $('docLines').onchange = (e) => this.#onLineChange(e);
    $('docSubmit').onclick = () => this.submit();
  }

  // ------------------------------------------------------------------ piezas
  renderCustomer() {
    const c = this.customer;
    $('docCustomer').innerHTML = c
      ? `<button type="button" data-act="customer" class="pick-card w-full text-left bg-white border border-slate-200 rounded-xl p-3.5 hover:border-blue-400">
           ${customerCardHtml(c, '<span class="text-xs font-semibold text-blue-600 shrink-0">Cambiar</span>')}
         </button>`
      : `<button type="button" data-act="customer" class="w-full border-2 border-dashed border-slate-300 rounded-xl p-5 text-center hover:border-blue-400 hover:bg-blue-50/40 transition-colors">
           <span class="block text-sm font-semibold text-slate-700">Seleccionar cliente</span>
           <span class="block text-xs text-slate-400 mt-0.5">Busca por nombre, RUC/DNI o segmento</span>
         </button>`;
  }

  renderSeller() {
    const el = $('docSeller');
    if (!el) return;
    const s = this.seller;
    el.innerHTML = s
      ? `<button type="button" data-act="seller" class="pick-card w-full text-left bg-white border border-slate-200 rounded-xl p-3 hover:border-blue-400">
           ${sellerCardHtml(s, '<span class="text-xs font-semibold text-blue-600 shrink-0">Cambiar</span>')}
         </button>`
      : `<button type="button" data-act="seller" class="w-full border-2 border-dashed border-slate-300 rounded-xl p-4 text-xs font-semibold text-slate-600">Seleccionar vendedor</button>`;
  }

  renderLines() {
    const isSale = this.isSale;
    if (this.cart.length === 0) {
      $('docLines').innerHTML = `<div class="text-center text-xs text-slate-400 bg-white border border-dashed border-slate-300 rounded-xl py-6">Aún no agregaste productos.</div>`;
      return;
    }
    $('docLines').innerHTML = this.cart.map((it, i) => {
      const disc = it.discountPct || 0;
      const line = it.price * it.quantity * (1 - disc / 100);
      return `
      <div class="bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap items-center gap-x-3 gap-y-2" data-idx="${i}">
        <div class="min-w-0 flex-1 basis-40">
          <p class="text-sm font-semibold text-slate-800 truncate">${escapeHtml(it.name)}</p>
          <p class="text-[11px] text-slate-400 font-mono">${escapeHtml(it.sku)} · ${formatCurrency(it.price)} c/u</p>
        </div>
        ${isSale ? '' : `
          <label class="text-[11px] text-slate-400 flex items-center gap-1">Desc. %
            <input data-field="disc" type="number" min="0" max="30" value="${disc}" class="w-14 p-1.5 rounded-lg border border-slate-200 text-center font-mono text-xs text-slate-800"></label>`}
        <div class="flex items-center gap-1">
          <button type="button" data-act="dec" class="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold" aria-label="Quitar uno">−</button>
          <input data-field="qty" type="number" min="1" value="${it.quantity}" class="w-12 p-1.5 rounded-lg border border-slate-200 text-center font-mono text-xs font-bold">
          <button type="button" data-act="inc" class="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold" aria-label="Sumar uno">+</button>
        </div>
        <span class="w-24 text-right text-sm font-bold text-slate-900">${formatCurrency(line)}</span>
        <button type="button" data-act="del" class="p-1.5 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50" aria-label="Quitar producto">${icon('trash', 'w-4 h-4')}</button>
      </div>`;
    }).join('');
  }

  #totals() {
    const globalDisc = this.isSale ? 0 : (parseFloat($('docGlobalDisc')?.value) || 0);
    return QuoteEngine.calculateTotals(this.cart, globalDisc);
  }

  #missing() {
    const missing = [];
    if (!this.customer) missing.push('cliente');
    if (this.isSale && !this.seller) missing.push('vendedor');
    if (this.cart.length === 0) missing.push('productos');
    return missing;
  }

  renderSummary() {
    const t = this.#totals();
    const units = this.cart.reduce((a, it) => a + it.quantity, 0);
    const row = (label, value, strong = false) => `
      <div class="flex justify-between ${strong ? 'text-sm font-extrabold text-slate-900 pt-3 mt-1 border-t border-slate-200' : 'text-xs text-slate-500'}">
        <span>${label}</span><span class="font-mono ${strong ? (this.isSale ? 'text-blue-600 text-base' : 'text-cyan-700 text-base') : ''}">${value}</span>
      </div>`;
    $('docSummary').innerHTML = `
      <div class="space-y-2">
        <div class="flex justify-between text-xs text-slate-500"><span>Productos</span><span class="font-mono">${this.cart.length} · ${units} uds.</span></div>
        ${row('Subtotal', formatCurrency(t.subtotal))}
        ${t.discountAmount > 0 ? row('Descuento global', `− ${formatCurrency(t.discountAmount)}`) : ''}
        ${row('IGV (18%)', formatCurrency(t.taxAmount))}
        ${row(this.isSale ? 'Total de la venta' : 'Total presupuestado', formatCurrency(t.total), true)}
      </div>`;

    const missing = this.#missing();
    const btn = $('docSubmit');
    btn.disabled = missing.length > 0 || this.busy;
    btn.innerText = missing.length > 0
      ? `Falta: ${missing.join(', ')}`
      : this.isSale ? `Registrar venta y continuar · ${formatCurrency(t.total)}` : 'Guardar cotización';
    this.#setError('');
  }

  #setError(message) {
    const el = $('docError');
    if (!el) return;
    el.innerText = message || '';
    el.classList.toggle('hidden', !message);
  }

  // ------------------------------------------------------------------ selectores
  pickCustomer() {
    const role = this.app.getCurrentRole();
    EntityPicker.open({
      title: 'Seleccionar cliente',
      subtitle: 'Solo se muestran clientes activos.',
      placeholder: 'Buscar por nombre, RUC/DNI, correo o segmento...',
      emptyText: 'Aún no hay clientes. Crea el primero.',
      items: () => this.storage.get('customers', []).filter(isCustomerActive),
      searchText: c => `${c.name} ${c.docNumber} ${c.docType} ${c.email} ${c.segment} ${c.id}`,
      chips: ['Corporativo', 'Pyme', 'Profesional', 'Personal'].map(s => ({ key: s, label: s })),
      chipMatch: (c, seg) => c.segment === seg,
      renderCard: c => customerCardHtml(c, c.id === this.customer?.id ? `<span class="text-blue-600 shrink-0">${icon('check', 'w-5 h-5')}</span>` : ''),
      onPick: c => { this.customer = c; this.renderCustomer(); this.renderSummary(); },
      create: canAccess(role, 'customers') ? {
        label: 'Nuevo cliente',
        handler: () => this.app.customers.openForm(null, (created) => {
          EntityPicker.close();
          this.customer = created;
          this.renderCustomer();
          this.renderSummary();
        })
      } : null
    });
  }

  pickSeller() {
    EntityPicker.open({
      title: 'Seleccionar vendedor',
      placeholder: 'Buscar vendedor...',
      items: () => this.#sellerOptions(),
      searchText: s => `${s.name} ${s.email}`,
      renderCard: s => sellerCardHtml(s, s.id === this.seller?.id ? `<span class="text-blue-600 shrink-0">${icon('check', 'w-5 h-5')}</span>` : ''),
      onPick: s => { this.seller = s; this.renderSeller(); this.renderSummary(); }
    });
  }

  pickProducts() {
    const isSale = this.isSale;
    const role = this.app.getCurrentRole();
    EntityPicker.open({
      title: 'Agregar productos',
      subtitle: isSale ? 'Toca un producto para sumarlo. Puedes elegir varios.' : 'Toca un producto para sumarlo al presupuesto.',
      placeholder: 'Buscar por nombre, SKU o categoría...',
      emptyText: 'No hay productos activos.',
      closeOnPick: false,
      items: () => this.storage.get('products', []).filter(isProductActive),
      searchText: p => `${p.name} ${p.sku} ${p.categoryName} ${p.id}`,
      chips: this.storage.get('categories', []).map(c => ({ key: c.id, label: c.name })),
      chipMatch: (p, cat) => p.categoryId === cat,
      isDisabled: p => isSale && p.stock <= 0,
      renderCard: p => productCardHtml(p, { qty: this.cart.find(l => l.productId === p.id)?.quantity || 0, trackStock: isSale }),
      onPick: p => this.addProduct(p),
      create: canAccess(role, 'products') ? {
        label: 'Nuevo producto',
        handler: () => this.app.products.openForm(null, () => EntityPicker.refresh())
      } : null
    });
  }

  // ------------------------------------------------------------------ carrito
  addProduct(p) {
    const line = this.cart.find(l => l.productId === p.id);
    if (line) {
      if (this.isSale && line.quantity >= p.stock) {
        this.app.showToast(`Solo hay ${p.stock} uds. de "${p.name}".`, 'warning');
        return;
      }
      line.quantity++;
    } else {
      this.cart.push({
        productId: p.id, name: p.name, sku: p.sku, price: p.price, quantity: 1,
        ...(this.isSale ? {} : { discountPct: 0 })
      });
    }
    this.renderLines();
    this.renderSummary();
  }

  #stockOf(productId) {
    return this.storage.get('products', []).find(p => p.id === productId)?.stock ?? Infinity;
  }

  #setQuantity(idx, value) {
    const line = this.cart[idx];
    if (!line) return;
    let qty = Math.max(1, parseInt(value, 10) || 1);
    if (this.isSale) {
      const max = this.#stockOf(line.productId);
      if (qty > max) {
        qty = max;
        this.app.showToast(`Solo hay ${max} uds. de "${line.name}".`, 'warning');
      }
    }
    line.quantity = qty;
  }

  #onLineClick(e) {
    const btn = e.target.closest('[data-act]');
    const row = e.target.closest('[data-idx]');
    if (!btn || !row) return;
    const idx = parseInt(row.dataset.idx, 10);
    const line = this.cart[idx];
    if (btn.dataset.act === 'del') this.cart.splice(idx, 1);
    else if (btn.dataset.act === 'inc') this.#setQuantity(idx, line.quantity + 1);
    else if (btn.dataset.act === 'dec') {
      if (line.quantity > 1) line.quantity--;
      else this.cart.splice(idx, 1);
    }
    this.renderLines();
    this.renderSummary();
  }

  #onLineChange(e) {
    const field = e.target.dataset.field;
    const row = e.target.closest('[data-idx]');
    if (!field || !row) return;
    const idx = parseInt(row.dataset.idx, 10);
    if (field === 'qty') this.#setQuantity(idx, e.target.value);
    if (field === 'disc') this.cart[idx].discountPct = Math.min(30, Math.max(0, parseFloat(e.target.value) || 0));
    this.renderLines();
    this.renderSummary();
  }

  // ------------------------------------------------------------------ guardar
  async submit() {
    if (this.busy || this.#missing().length > 0) return;
    this.busy = true;
    this.renderSummary();
    $('docSubmit').disabled = true;

    try {
      if (this.isSale) {
        const sale = await this.app.state.api.createSale({
          customerId: this.customer.id,
          customerName: this.customer.name,
          sellerId: this.seller.id,
          sellerName: this.seller.name,
          items: this.cart.map(it => ({ ...it }))
        });
        Modal.close('docModal', true);
        this.app.checkout.open(sale.id);
      } else {
        const quote = this.app.state.quoteEngine.createQuote({
          customerId: this.customer.id,
          customerName: this.customer.name,
          items: this.cart.map(it => ({ ...it })),
          discountPct: parseFloat($('docGlobalDisc')?.value) || 0,
          notes: $('docNotes')?.value || ''
        });
        Modal.close('docModal', true);
        this.app.showToast(`Cotización ${quote.id} guardada.`, 'success');
        this.app.quotes.render();
      }
    } catch (err) {
      this.busy = false;
      this.renderSummary();
      this.#setError(err.message);
    } finally {
      this.busy = false;
    }
  }
}
