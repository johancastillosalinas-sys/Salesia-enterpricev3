/**
 * @file dashboardController.js
 * @description Pantalla de Inicio: indicadores de ventas, tendencia semanal,
 * productos más vendidos y alertas de stock.
 * Recibe la aplicación (`app`) para usar su estado, API y avisos.
 */

import { ChartManager } from '../../components/chartManager.js';
import { formatCurrency, escapeHtml } from '../../utils/formatters.js';
import { isPaid, billingState } from '../billing/saleStatus.js';
import { canAccess } from '../../app/permissions.js';

const pad = n => String(n).padStart(2, '0');
const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export class DashboardController {
  constructor(app) {
    this.app = app;
  }

  render() {
    const allSales = this.app.state.storage.get('sales', []);
    const sales = allSales.filter(isPaid);
    const products = this.app.state.storage.get('products', []);
    this.#renderBanner(allSales, products);
    const activeProducts = products.filter(p => (p.status || 'ACTIVE') === 'ACTIVE');
    const lowStock = activeProducts.filter(p => p.stock <= p.minStock);

    this.#renderKpis(sales, activeProducts, lowStock);
    this.#renderWeeklyTrend(sales);
    this.#renderCategories(sales, products);
    this.#renderTopProducts(sales, products);
    this.#renderLowStock(lowStock);
    this.#renderRecentSales(sales);
  }

  /** Estado vacío (sistema en cero) o aviso de ventas pendientes de cobro. */
  #renderBanner(allSales, products) {
    const box = document.getElementById('dashEmptyState');
    if (!box) return;
    const role = this.app.getCurrentRole();
    const customers = this.app.state.storage.get('customers', []);
    const pending = allSales.filter(s => billingState(s) === 'PENDIENTE');

    if (allSales.length === 0 && products.length === 0 && customers.length === 0) {
      box.className = 'bg-white rounded-2xl border-2 border-dashed border-slate-300 p-8 text-center';
      box.innerHTML = `
        <h4 class="text-base font-extrabold text-slate-900">El sistema está en cero</h4>
        <p class="text-sm text-slate-500 mt-1 max-w-xl mx-auto">No hay clientes, productos ni ventas todavía. Carga un archivo CSV para llenar todos los módulos de una sola vez, o empieza creando registros a mano.</p>
        <div class="mt-4 flex flex-wrap justify-center gap-2">
          ${canAccess(role, 'import') ? '<button data-nav-target="import" class="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold">Importar datos desde CSV</button>' : ''}
          ${canAccess(role, 'customers') ? '<button data-quick="customer" class="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold">Crear un cliente</button>' : ''}
          ${canAccess(role, 'products') ? '<button data-quick="product" class="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold">Crear un producto</button>' : ''}
        </div>`;
    } else if (pending.length > 0 && canAccess(role, 'billing')) {
      const total = pending.reduce((a, s) => a + s.totals.total, 0);
      box.className = 'rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3.5 flex flex-wrap items-center justify-between gap-3';
      box.innerHTML = `
        <p class="text-sm text-amber-900"><strong>${pending.length}</strong> venta${pending.length === 1 ? '' : 's'} pendiente${pending.length === 1 ? '' : 's'} de cobro por <strong>${formatCurrency(total)}</strong>. No cuentan en los ingresos hasta que se cobren.</p>
        <button data-nav-target="billing" class="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold">Ir a Facturación</button>`;
    } else {
      box.className = 'hidden';
      box.innerHTML = '';
    }
  }

  #renderKpis(sales, activeProducts, lowStock) {
    const totalRev = sales.reduce((acc, s) => acc + s.totals.total, 0);
    const todayKey = dayKey(new Date());
    const todaySales = sales.filter(s => dayKey(new Date(s.timestamp)) === todayKey);
    const todayRev = todaySales.reduce((acc, s) => acc + s.totals.total, 0);
    const totalStock = activeProducts.reduce((acc, p) => acc + p.stock, 0);

    const set = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.innerText = text;
    };
    set('kpiTotalSales', sales.length);
    set('kpiTotalRevenue', formatCurrency(totalRev));
    set('kpiToday', todaySales.length);
    set('kpiTodayAmount', formatCurrency(todayRev));
    set('kpiLowStock', lowStock.length);
    set('kpiTotalStock', `${totalStock} uds.`);
    set('kpiStockSub', `En ${activeProducts.length} productos activos`);
  }

  // Ingresos de los últimos 7 días (incluye hoy; los días sin ventas valen 0)
  #renderWeeklyTrend(sales) {
    const totals = {};
    for (const s of sales) {
      const k = dayKey(new Date(s.timestamp));
      totals[k] = (totals[k] || 0) + s.totals.total;
    }
    const labels = [];
    const values = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      labels.push(`${pad(d.getDate())}/${pad(d.getMonth() + 1)}`);
      values.push(Number((totals[dayKey(d)] || 0).toFixed(2)));
    }
    ChartManager.renderTrendChart('dashboardChartTrend', labels, values);
  }

  #renderCategories(sales, products) {
    const catTotals = {};
    for (const s of sales) {
      for (const it of s.items || []) {
        const prod = products.find(p => p.id === it.productId);
        const cat = prod?.categoryName || 'General';
        catTotals[cat] = (catTotals[cat] || 0) + (it.price * it.quantity);
      }
    }
    ChartManager.renderCategoryChart('dashboardChartCategories', catTotals);
  }

  #renderTopProducts(sales, products) {
    const tbody = document.getElementById('dashboardTopProductsTbody');
    if (!tbody) return;

    const byProduct = {};
    for (const s of sales) {
      for (const it of s.items || []) {
        const name = products.find(p => p.id === it.productId)?.name || it.name || it.productId;
        const row = byProduct[it.productId] || (byProduct[it.productId] = { name, units: 0, revenue: 0 });
        row.units += it.quantity;
        row.revenue += it.price * it.quantity;
      }
    }
    const top = Object.values(byProduct).sort((a, b) => b.units - a.units).slice(0, 5);

    tbody.innerHTML = top.length === 0
      ? `<tr><td colspan="3" class="px-4 py-8 text-center text-slate-400">Aún no hay productos vendidos.</td></tr>`
      : top.map(r => `
        <tr class="border-b border-slate-100 hover:bg-slate-50 text-xs">
          <td class="px-4 py-3 text-slate-700">${escapeHtml(r.name)}</td>
          <td class="px-4 py-3 text-right font-mono font-semibold text-slate-900">${r.units}</td>
          <td class="px-4 py-3 text-right font-mono text-slate-700">${formatCurrency(r.revenue)}</td>
        </tr>`).join('');
  }

  #renderLowStock(lowStock) {
    const box = document.getElementById('dashboardLowStockList');
    if (!box) return;

    box.innerHTML = lowStock.length === 0
      ? `<div class="p-4 text-center text-xs text-emerald-700 bg-emerald-50 rounded-lg border border-emerald-200">Todo el inventario está por encima del mínimo.</div>`
      : lowStock.map(p => `
        <div class="flex items-center justify-between gap-3 p-3 rounded-lg border border-amber-200 bg-amber-50/50 text-xs">
          <span class="font-semibold text-amber-900">${escapeHtml(p.name)}</span>
          <span class="font-mono text-slate-700 whitespace-nowrap">${p.stock} uds. (mín. ${p.minStock})</span>
        </div>`).join('');
  }

  #renderRecentSales(sales) {
    const tbody = document.getElementById('dashboardRecentSalesTbody');
    if (!tbody) return;

    if (sales.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-8 text-center text-slate-400">Sin transacciones registradas.</td></tr>`;
      return;
    }
    tbody.innerHTML = sales.slice(0, 5).map(s => `
      <tr class="border-b border-slate-100 hover:bg-slate-50 text-xs">
        <td class="px-4 py-3 font-semibold text-blue-600 font-mono">${escapeHtml(s.id)}</td>
        <td class="px-4 py-3 text-slate-700">${escapeHtml(s.customerName)}</td>
        <td class="px-4 py-3 text-slate-500">${escapeHtml(s.dateFormatted)}</td>
        <td class="px-4 py-3 text-right font-medium text-slate-900">${formatCurrency(s.totals.total)}</td>
        <td class="px-4 py-3 text-center">
          <span class="inline-flex px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            ${escapeHtml(s.status)}
          </span>
        </td>
      </tr>
    `).join('');
  }
}
