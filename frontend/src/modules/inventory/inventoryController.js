/**
 * @file inventoryController.js
 * @description Almacén e inventario.
 * Recibe la aplicación (`app`) para usar su estado, API y avisos.
 */

import { formatCurrency, escapeHtml } from '../../utils/formatters.js';

export class InventoryController {
  constructor(app) {
    this.app = app;
  }

  render() {
    const products = this.app.state.storage.get('products', []);
    const movements = this.app.state.storage.get('inventory_movements', []);
    const tbody = document.getElementById('inventoryTableTbody');
    const movTbody = document.getElementById('inventoryMovementsTbody');

    if (tbody) {
      tbody.innerHTML = products.map(p => `
        <tr class="border-b border-slate-100 hover:bg-slate-50 text-xs">
          <td class="px-4 py-3 font-mono font-semibold text-cyan-700">${escapeHtml(p.sku)}</td>
          <td class="px-4 py-3 font-medium text-slate-800">${escapeHtml(p.name)}</td>
          <td class="px-4 py-3 text-slate-500">${escapeHtml(p.categoryName || p.category)}</td>
          <td class="px-4 py-3 text-right font-mono font-bold">${formatCurrency(p.price)}</td>
          <td class="px-4 py-3 text-center">
            <span class="inline-flex px-2 py-0.5 rounded text-[11px] font-bold ${p.stock <= p.minStock ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'}">
              ${escapeHtml(p.stock)} ${escapeHtml(p.unit)}
            </span>
          </td>
          <td class="px-4 py-3 text-center text-slate-400 font-mono">${escapeHtml(p.minStock)}</td>
          <td class="px-4 py-3 text-center">
            <button data-restock="${escapeHtml(p.id)}" class="px-2.5 py-1 text-xs font-semibold rounded bg-slate-100 hover:bg-slate-200 text-slate-700">
              +10 Uds.
            </button>
          </td>
        </tr>
      `).join('');

      tbody.querySelectorAll('[data-restock]').forEach(b => {
        b.onclick = async () => {
          try {
            const prod = await this.app.state.api.restockProduct(b.getAttribute('data-restock'), 10);
            this.render();
            this.app.showToast(`Stock de "${prod.name}" incrementado en 10 uds.`, 'info');
          } catch (e) {
            this.app.showToast(e.message, 'error');
          }
        };
      });
    }

    if (movTbody) {
      if (movements.length === 0) {
        movTbody.innerHTML = `<tr><td colspan="6" class="px-4 py-4 text-center text-slate-400 text-xs">Sin movimientos de almacén.</td></tr>`;
      } else {
        movTbody.innerHTML = movements.slice(0, 10).map(m => `
          <tr class="border-b border-slate-100 text-xs">
            <td class="px-3 py-2 font-mono text-slate-400">${escapeHtml(m.dateFormatted)}</td>
            <td class="px-3 py-2 font-mono text-cyan-700 font-bold">${escapeHtml(m.sku)}</td>
            <td class="px-3 py-2 font-medium">${escapeHtml(m.productName)}</td>
            <td class="px-3 py-2 text-center">
              <span class="px-2 py-0.5 rounded text-[10px] font-bold ${m.type.includes('SALIDA') ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}">
                ${escapeHtml(m.type)}
              </span>
            </td>
            <td class="px-3 py-2 text-center font-bold">${escapeHtml(m.quantity)}</td>
            <td class="px-3 py-2 font-mono text-slate-500">${escapeHtml(m.referenceId)}</td>
          </tr>
        `).join('');
      }
    }
  }
}