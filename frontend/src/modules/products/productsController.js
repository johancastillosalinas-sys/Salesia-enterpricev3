/**
 * @file productsController.js
 * @description Catálogo de productos (RF-04).
 * Recibe la aplicación (`app`) para usar su estado, API y avisos.
 */

import { ProductsView, isProductActive } from './productsView.js';
import { ConfirmDialog } from '../../components/modal.js';

export class ProductsController {
  constructor(app) {
    this.app = app;
    this.afterSave = null;
  }

  /** Conecta la ventana de alta/edición. Se llama una vez al iniciar (sirve desde cualquier pantalla). */
  bindModal() {
    document.getElementById('btnCancelProduct').onclick = () => ProductsView.closeForm();
    document.getElementById('btnSaveProduct').onclick = () => this.saveForm();
  }

  render() {
    const products = this.app.state.storage.get('products', []);
    const rerender = () => this.render();
    const resetAndRender = () => { ProductsView.page = 1; this.render(); };

    ProductsView.fillCategoryFilter(this.app.state.storage.get('categories', []));
    const chips = document.getElementById('productsCategoryChips');
    if (chips) {
      chips.onclick = (e) => {
        const chip = e.target.closest('[data-chip]');
        if (chip) { ProductsView.category = chip.dataset.chip; resetAndRender(); }
      };
    }

    ProductsView.render(products, {
      onEdit: (id) => this.openForm(id),
      onToggle: (id) => this.toggleStatus(id),
      onPage: rerender
    });

    const search = document.getElementById('productsSearchInput');
    const inactive = document.getElementById('productsShowInactive');
    if (search) search.oninput = resetAndRender;
    if (inactive) inactive.onchange = resetAndRender;

    const btnNew = document.getElementById('btnNewProduct');
    if (btnNew) btnNew.onclick = () => this.openForm(null);
  }

  /**
   * @param {string|null} id Producto a editar (null = nuevo)
   * @param {(created:object)=>void} [onSaved] Se llama al CREAR un producto
   */
  openForm(id, onSaved = null) {
    this.afterSave = onSaved;
    const product = id ? this.app.state.storage.get('products', []).find(p => p.id === id) : null;
    ProductsView.openForm(product || null, this.app.state.storage.get('categories', []));
  }

  async saveForm() {
    const btn = document.getElementById('btnSaveProduct');
    const data = ProductsView.readForm();
    try {
      if (btn) btn.disabled = true;
      if (data.id) {
        await this.app.state.api.updateProduct(data.id, data);
        this.app.showToast(`Producto ${data.id} actualizado.`, 'success');
      } else {
        const created = await this.app.state.api.createProduct(data);
        this.app.showToast(`Producto ${created.id} creado correctamente.`, 'success');
        const callback = this.afterSave;
        this.afterSave = null;
        ProductsView.closeForm();
        callback?.(created);
      }
      ProductsView.closeForm();
      this.render();
    } catch (e) {
      ProductsView.setFormError(e.message);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async toggleStatus(id) {
    const product = this.app.state.storage.get('products', []).find(p => p.id === id);
    if (!product) return;
    const willDeactivate = isProductActive(product);
    const ok = await ConfirmDialog.ask({
      title: willDeactivate ? 'Desactivar producto' : 'Reactivar producto',
      message: willDeactivate
        ? `“${product.name}” no aparecerá en nuevas ventas ni cotizaciones, pero su historial se conserva.`
        : `“${product.name}” volverá a estar disponible para vender.`,
      confirmText: willDeactivate ? 'Desactivar' : 'Reactivar',
      tone: willDeactivate ? 'danger' : 'primary'
    });
    if (!ok) return;
    try {
      await this.app.state.api.setProductStatus(id, willDeactivate ? 'INACTIVE' : 'ACTIVE');
      this.app.showToast(`Producto ${willDeactivate ? 'desactivado' : 'reactivado'}.`, 'info');
      this.render();
    } catch (e) {
      this.app.showToast(e.message, 'error');
    }
  }
}
