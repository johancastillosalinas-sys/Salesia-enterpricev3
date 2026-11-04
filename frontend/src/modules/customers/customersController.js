/**
 * @file customersController.js
 * @description Gestión de clientes (RF-03).
 * Recibe la aplicación (`app`) para usar su estado, API y avisos.
 */

import { CustomersView, isCustomerActive } from './customersView.js';
import { ConfirmDialog } from '../../components/modal.js';
import { chipsHtml, bindSegmented } from '../../components/uiKit.js';

const SEGMENTS = ['Corporativo', 'Pyme', 'Profesional', 'Personal'];

export class CustomersController {
  constructor(app) {
    this.app = app;
    this.afterSave = null;
  }

  /** Conecta la ventana de alta/edición. Se llama una vez al iniciar (sirve desde cualquier pantalla). */
  bindModal() {
    bindSegmented('customerFormDocType', 'customerFormDocTypeSeg', ['RUC', 'DNI']);
    bindSegmented('customerFormSegment', 'customerFormSegmentSeg', SEGMENTS);
    document.getElementById('btnCancelCustomer').onclick = () => CustomersView.closeForm();
    document.getElementById('btnSaveCustomer').onclick = () => this.saveForm();
  }

  render() {
    const customers = this.app.state.storage.get('customers', []);
    const rerender = () => this.render();
    const resetAndRender = () => { CustomersView.page = 1; this.render(); };

    const chips = document.getElementById('customersSegmentChips');
    if (chips) {
      chips.innerHTML = chipsHtml([{ key: '', label: 'Todos' }, ...SEGMENTS.map(s => ({ key: s, label: s }))], CustomersView.segment);
      chips.onclick = (e) => {
        const chip = e.target.closest('[data-chip]');
        if (chip) { CustomersView.segment = chip.dataset.chip; resetAndRender(); }
      };
    }

    CustomersView.render(customers, {
      onEdit: (id) => this.openForm(id),
      onToggle: (id) => this.toggleStatus(id),
      onPage: rerender
    });

    const search = document.getElementById('customersSearchInput');
    const inactive = document.getElementById('customersShowInactive');
    if (search) search.oninput = resetAndRender;
    if (inactive) inactive.onchange = resetAndRender;

    const btnNew = document.getElementById('btnNewCustomer');
    if (btnNew) btnNew.onclick = () => this.openForm(null);
  }

  /**
   * @param {string|null} id Cliente a editar (null = nuevo)
   * @param {(created:object)=>void} [onSaved] Se llama al CREAR un cliente (p. ej. para elegirlo en una venta)
   */
  openForm(id, onSaved = null) {
    this.afterSave = onSaved;
    const customer = id ? this.app.state.storage.get('customers', []).find(c => c.id === id) : null;
    CustomersView.openForm(customer || null);
  }

  async saveForm() {
    const btn = document.getElementById('btnSaveCustomer');
    const data = CustomersView.readForm();
    try {
      if (btn) btn.disabled = true;
      if (data.id) {
        await this.app.state.api.updateCustomer(data.id, data);
        this.app.showToast(`Cliente ${data.id} actualizado.`, 'success');
      } else {
        const created = await this.app.state.api.createCustomer(data);
        this.app.showToast(`Cliente ${created.id} creado correctamente.`, 'success');
        const callback = this.afterSave;
        this.afterSave = null;
        CustomersView.closeForm();
        callback?.(created);
      }
      CustomersView.closeForm();
      this.render();
    } catch (e) {
      CustomersView.setFormError(e.message);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async toggleStatus(id) {
    const customer = this.app.state.storage.get('customers', []).find(c => c.id === id);
    if (!customer) return;
    const willDeactivate = isCustomerActive(customer);
    const ok = await ConfirmDialog.ask({
      title: willDeactivate ? 'Desactivar cliente' : 'Reactivar cliente',
      message: willDeactivate
        ? `“${customer.name}” no aparecerá en nuevas ventas ni cotizaciones, pero su historial se conserva.`
        : `“${customer.name}” volverá a estar disponible para ventas y cotizaciones.`,
      confirmText: willDeactivate ? 'Desactivar' : 'Reactivar',
      tone: willDeactivate ? 'danger' : 'primary'
    });
    if (!ok) return;
    try {
      await this.app.state.api.setCustomerStatus(id, willDeactivate ? 'INACTIVE' : 'ACTIVE');
      this.app.showToast(`Cliente ${willDeactivate ? 'desactivado' : 'reactivado'}.`, 'info');
      this.render();
    } catch (e) {
      this.app.showToast(e.message, 'error');
    }
  }
}
