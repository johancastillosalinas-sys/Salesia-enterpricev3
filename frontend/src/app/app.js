/**
 * @file app.js
 * @description Orquestador integral de SalesIA Enterprise conforme a todas las fases y especificaciones del Plan de Desarrollo:
 * Simulación 100% en LocalStorage, Secuencia Consecutiva y Cotizador Sandbox Desacoplado.
 */

import { AppState } from './state.js';
import { AppRouter } from './router.js';
import { canAccess, firstAllowedRoute } from './permissions.js';
import { DashboardController } from '../modules/dashboard/dashboardController.js';
import { PosController } from '../modules/sales/salesController.js';
import { QuotesController } from '../modules/quotes/quotesController.js';
import { InventoryController } from '../modules/inventory/inventoryController.js';
import { CustomersController } from '../modules/customers/customersController.js';
import { ProductsController } from '../modules/products/productsController.js';
import { ReportsController } from '../modules/reports/reportsController.js';
import { AuditController } from '../modules/audit/auditController.js';
import { HistoryController } from '../modules/history/historyController.js';
import { StressTestRunner } from '../hooks/useStressTest.js';
import { formatCurrency } from '../utils/formatters.js';
import { Modal, ConfirmDialog } from '../components/modal.js';
import { CommandPalette } from '../components/commandPalette.js';
import { hydrateIcons, avatar } from '../components/uiKit.js';
import { DocModal } from '../modules/sales/docModal.js';
import { PAGE_META } from './pages.js';
import { AuthService } from '../modules/auth/authService.js';
import { LoginController } from '../modules/auth/loginController.js';
import { canViewReport } from '../modules/reports/reportTypes.js';
import { BillingService } from '../services/billingService.js';
import { CheckoutModal } from '../modules/billing/checkoutModal.js';
import { BillingController } from '../modules/billing/billingController.js';
import { ImportController } from '../modules/importer/importController.js';
import { ReportViewer } from '../modules/reports/reportViewer.js';
import { SecurityController } from '../modules/security/securityController.js';


class Application {
  constructor() {
    this.state = new AppState();
    this.router = new AppRouter();
    this.audit = new AuditController(this);
    this.history = new HistoryController(this);
    this.reports = new ReportsController(this);
    this.customers = new CustomersController(this);
    this.products = new ProductsController(this);
    this.inventory = new InventoryController(this);
    this.dashboard = new DashboardController(this);
    this.quotes = new QuotesController(this);
    this.pos = new PosController(this);
    this.docModal = new DocModal(this);
    this.billing = new BillingService(this.state.storage, this.state.api);
    this.checkout = new CheckoutModal(this);
    this.billingPage = new BillingController(this);
    this.importer = new ImportController(this);
    this.reportViewer = new ReportViewer(this);
    this.security = new SecurityController(this);
    this.auth = new AuthService(this.state.storage, this.state.api);
    this.login = new LoginController(this);

    window.__SALESIA_APP__ = this;
  }

  init() {
    Modal.init();
    hydrateIcons();
    this.customers.bindModal();
    this.products.bindModal();
    CommandPalette.init(this);
    this.bindQuickActions();
    this.bindMobileMenu();
    this.router.onRouteChange((route) => { if (route === 'import') this.importer.onEnter(); this.updatePageHeader(route); this.renderRoute(route); });
        this.router.setGuard((route) => {
      const allowed = canAccess(this.getCurrentRole(), route);
      if (!allowed) this.showToast('Tu rol no tiene acceso a este módulo.', 'warning');
      return allowed;
    });
    this.bindGlobalEvents();
    this.subscribeToDomainEvents();
    this.bindUserMenu();
    this.login.bind();

    const user = this.auth.restore();
    if (user) this.startSession(user);
    else this.login.show();
  }

  /** Abre la sesión de un usuario ya autenticado y muestra su primer módulo. */
  startSession(user) {
    this.state.storage.set('currentUser', user);
    this.login.hide();
    this.updateRolePermissionsUI(user.role);
    this.updatePageHeader(this.router.getCurrentRoute());
    this.render();
  }

  logout() {
    this.auth.logout();
    location.reload();
  }

  bindUserMenu() {
    const menu = document.getElementById('userMenu');
    document.getElementById('userMenuBtn')?.addEventListener('click', (e) => { e.stopPropagation(); menu.classList.toggle('hidden'); });
    document.addEventListener('click', (e) => { if (!e.target.closest('#userMenu')) menu?.classList.add('hidden'); });
    document.getElementById('btnLogout')?.addEventListener('click', () => this.logout());
  }

  /** Título y migas de pan de la barra superior según el módulo activo. */
  updatePageHeader(route) {
    const meta = PAGE_META[route];
    if (!meta) return;
    const set = (id, text) => { const el = document.getElementById(id); if (el) el.innerText = text; };
    set('pageTitle', meta.title);
    set('pageCrumb', meta.title);
    set('pageSubtitle', meta.subtitle);
    document.title = `${meta.title} · SalesIA Enterprise`;
  }

  /** Acciones de creación disponibles desde cualquier pantalla (botones, Ctrl+K). */
  quick(action) {
    if (action === 'sale') this.docModal.open('sale');
    else if (action === 'quote') this.docModal.open('quote');
    else if (action === 'customer') this.customers.openForm(null);
    else if (action === 'product') this.products.openForm(null);
  }

  bindQuickActions() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-quick]');
      if (btn) this.quick(btn.getAttribute('data-quick'));
      const rep = e.target.closest('[data-report]');
      if (rep) this.reportViewer?.open(rep.getAttribute('data-report'));
    });
  }

  bindMobileMenu() {
    const sidebar = document.getElementById('sidebar');
    document.getElementById('mobileMenuBtn')?.addEventListener('click', () => sidebar?.classList.toggle('-translate-x-full'));
    // Al elegir un módulo en pantallas pequeñas, se cierra el menú
    sidebar?.addEventListener('click', (e) => {
      if (e.target.closest('[data-nav-target]')) sidebar.classList.add('-translate-x-full');
    });
  }

  getCurrentRole() {
    return this.state.storage.get('currentUser', null)?.role || null;
  }

  updateRolePermissionsUI(role) {

    // Usuario activo en la barra superior
    const user = this.state.storage.get('currentUser', {});
    const name = user.name || role;
    const avatarBox = document.getElementById('topbarAvatar');
    if (avatarBox) avatarBox.innerHTML = avatar(name, 'w-8 h-8 text-[11px]');
    const nameEl = document.getElementById('topbarUserName');
    if (nameEl) nameEl.innerText = name;
    const roleEl = document.getElementById('topbarUserRole');
    if (roleEl) roleEl.innerText = role;
    const setText = (id, t) => { const el = document.getElementById(id); if (el) el.innerText = t; };
    setText('userMenuName', name);
    setText('userMenuEmail', user.email || '');
    setText('userMenuRole', role);
    document.getElementById('btnSystemReset')?.classList.toggle('hidden', role !== 'ADMINISTRADOR');

    // Botones "Reporte": solo los que el rol puede ver
    document.querySelectorAll('[data-report]').forEach(el => {
      el.classList.toggle('hidden', !canViewReport(role, el.getAttribute('data-report')));
    });

    // Acciones rápidas: solo las que el rol puede usar
    const QUICK_ROUTE = { sale: 'pos', quote: 'quotes', customer: 'customers', product: 'products' };
    document.querySelectorAll('[data-quick]').forEach(el => {
      el.classList.toggle('hidden', !canAccess(role, QUICK_ROUTE[el.getAttribute('data-quick')]));
    });

    // Mostrar solo los módulos permitidos para el rol
    document.querySelectorAll('[data-nav-target]').forEach(el => {
      el.classList.toggle('hidden', !canAccess(role, el.getAttribute('data-nav-target')));
    });

    // Ocultar los títulos de grupo que se quedaron sin ningún módulo visible
    document.querySelectorAll('aside nav > div').forEach(heading => {
      let next = heading.nextElementSibling;
      let anyVisible = false;
      while (next && next.hasAttribute('data-nav-target')) {
        if (!next.classList.contains('hidden')) anyVisible = true;
        next = next.nextElementSibling;
      }
      heading.classList.toggle('hidden', !anyVisible);
    });

    // Si el módulo actual no está permitido para este rol, ir al primero que sí lo esté
    if (!canAccess(role, this.router.getCurrentRoute())) {
      const target = firstAllowedRoute(role);
      if (target) this.router.navigate(target);
    }
  }

  subscribeToDomainEvents() {
    this.state.eventBus.subscribe('transaction:enqueued', (d) => {
      this.showToast(`Transacción encolada en FIFO (En espera: ${d.queueSize})`, 'info');
      this.updateStatusBadges();
    });

    this.state.eventBus.subscribe('transaction:committed', (d) => {
      const s = d.result;
      this.showToast(`Venta ${s.id} registrada (${formatCurrency(s.totals.total)}). Falta cobrarla y facturarla.`, 'success');
      this.updateStatusBadges();
      this.render();
    });

    this.state.eventBus.subscribe('transaction:rejected', (d) => {
      this.showToast(`Error en transacción: ${d.error}`, 'error');
      this.updateStatusBadges();
    });
  }

  bindGlobalEvents() {
    // Prueba 1 Registro O(1)
    const btnTest1 = document.getElementById('btnTestSingleRecord');
    if (btnTest1) {
      btnTest1.onclick = async () => {
        try {
          btnTest1.disabled = true;
          const { result, timeMs } = await StressTestRunner.runSingle(this.state.api);
          this.showToast(`Prueba 1 Registro O(1) completada en ${timeMs} ms (${result.id})`, 'success');
        } catch (e) {
          this.showToast(`Error: ${e.message}`, 'error');
        } finally {
          btnTest1.disabled = false;
        }
      };
    }

    // Prueba 100 Registros
    const btnTest100 = document.getElementById('btnTestStress100');
    const progressBar = document.getElementById('stressProgressBar');
    const progressText = document.getElementById('stressProgressText');
    if (btnTest100) {
      btnTest100.onclick = async () => {
        try {
          btnTest100.disabled = true;
          if (progressText) progressText.innerText = 'Ejecutando 100 transacciones consecutivas...';
          const res = await StressTestRunner.run100(this.state.api, (curr, tot) => {
            const pct = Math.round((curr / tot) * 100);
            if (progressBar) progressBar.style.width = `${pct}%`;
            if (progressText) progressText.innerText = `Procesando #${curr}/100 (${pct}%)...`;
          });
          this.showToast(`¡100 Registros procesados con éxito en ${res.totalTimeMs} ms!`, 'success');
        } catch (e) {
          this.showToast(`Error en prueba de estrés: ${e.message}`, 'error');
        } finally {
          btnTest100.disabled = false;
        }
      };
    }

    // Reinicio de Sistema
    const btnReset = document.getElementById('btnSystemReset');
    if (btnReset) {
      btnReset.onclick = async () => {
        const ok = await ConfirmDialog.ask({
          title: 'Reiniciar datos',
          message: 'Se borrarán las ventas, clientes y productos que creaste y se restablecerán los datos de fábrica.',
          confirmText: 'Reiniciar', tone: 'danger'
        });
        if (ok) {
          this.state.storage.clearSystemData();
          location.reload();
        }
      };
    }

    // Latencia de cola FIFO
    const delaySelect = document.getElementById('fifoDelaySelect');
    if (delaySelect) {
      delaySelect.onchange = (e) => {
        this.state.queue.setDelay(parseInt(e.target.value, 10) || 0);
      };
    }
  }

  updateStatusBadges() {
    const metrics = this.state.queue.getMetrics();
    const storageUsage = this.state.storage.getStorageUsage();

    const qBadge = document.getElementById('queueLengthBadge');
    const qText = document.getElementById('queueStatusText');
    const sBadge = document.getElementById('localStorageUsageBadge');

    if (qBadge) qBadge.innerText = metrics.queueLength;
    if (qText) qText.innerText = metrics.isBusy ? 'PROCESANDO' : 'OCIOSO';
    if (sBadge) sBadge.innerText = `${storageUsage.kbUsed} KB (${storageUsage.percentage}%)`;
  }

  render() {
    this.updateStatusBadges();
    this.renderRoute(this.router.getCurrentRoute());
  }

  renderRoute(route) {
    switch (route) {
      case 'dashboard':
        this.dashboard.render();
        break;
      case 'pos':
        this.pos.render();
        break;
      case 'quotes':
        this.quotes.render();
        break;
      case 'inventory':
        this.inventory.render();
        break;
      case 'customers':
        this.customers.render();
        break;
      case 'products':
        this.products.render();
        break;
      case 'reports':
        this.reports.render();
        break;
      case 'audit':
        this.audit.render();
        break;
      case 'history':
        this.history.render();
        break;
      case 'billing':
        this.billingPage.render();
        break;
      case 'import':
        this.importer.render();
        break;
      case 'security':
        this.security.render();
        break;
    }
  }

  renderInventory() {
    const products = this.state.storage.get('products', []);
    const movements = this.state.storage.get('inventory_movements', []);
    const tbody = document.getElementById('inventoryTableTbody');
    const movTbody = document.getElementById('inventoryMovementsTbody');

    if (tbody) {
      tbody.innerHTML = products.map(p => `
        <tr class="border-b border-slate-100 hover:bg-slate-50 text-xs">
          <td class="px-4 py-3 font-mono font-semibold text-cyan-700">${p.sku}</td>
          <td class="px-4 py-3 font-medium text-slate-800">${p.name}</td>
          <td class="px-4 py-3 text-slate-500">${p.categoryName || p.category}</td>
          <td class="px-4 py-3 text-right font-mono font-bold">${formatCurrency(p.price)}</td>
          <td class="px-4 py-3 text-center">
            <span class="inline-flex px-2 py-0.5 rounded text-[11px] font-bold ${p.stock <= p.minStock ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'}">
              ${p.stock} ${p.unit}
            </span>
          </td>
          <td class="px-4 py-3 text-center text-slate-400 font-mono">${p.minStock}</td>
          <td class="px-4 py-3 text-center">
            <button data-restock="${p.id}" class="px-2.5 py-1 text-xs font-semibold rounded bg-slate-100 hover:bg-slate-200 text-slate-700">
              +10 Uds.
            </button>
          </td>
        </tr>
      `).join('');

      tbody.querySelectorAll('[data-restock]').forEach(b => {
        b.onclick = () => {
          const prod = products.find(p => p.id === b.getAttribute('data-restock'));
          if (prod) {
            prod.stock += 10;
            this.state.storage.set('products', products);

            // Registrar movimiento de entrada
            const movs = this.state.storage.get('inventory_movements', []);
            movs.unshift({
              id: `MOV-${Date.now()}`,
              productId: prod.id,
              sku: prod.sku,
              productName: prod.name,
              type: 'ENTRADA_REABASTECIMIENTO',
              quantity: 10,
              previousStock: prod.stock - 10,
              newStock: prod.stock,
              referenceId: 'MANUAL',
              dateFormatted: new Date().toLocaleString('es-PE')
            });
            this.state.storage.set('inventory_movements', movs.slice(0, 200));

            this.renderInventory();
            this.showToast(`Stock de "${prod.name}" incrementado en 10 uds.`, 'info');
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
            <td class="px-3 py-2 font-mono text-slate-400">${m.dateFormatted}</td>
            <td class="px-3 py-2 font-mono text-cyan-700 font-bold">${m.sku}</td>
            <td class="px-3 py-2 font-medium">${m.productName}</td>
            <td class="px-3 py-2 text-center">
              <span class="px-2 py-0.5 rounded text-[10px] font-bold ${m.type.includes('SALIDA') ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}">
                ${m.type}
              </span>
            </td>
            <td class="px-3 py-2 text-center font-bold">${m.quantity}</td>
            <td class="px-3 py-2 font-mono text-slate-500">${m.referenceId}</td>
          </tr>
        `).join('');
      }
    }
  }

  showToast(message, type = 'info') {
    const cont = document.getElementById('toastContainer');
    if (!cont) return;

    const t = document.createElement('div');
    const bg = {
      success: 'bg-emerald-600 text-white',
      error: 'bg-rose-600 text-white',
      warning: 'bg-amber-600 text-white',
      info: 'bg-blue-600 text-white'
    }[type] || 'bg-blue-600 text-white';

    t.className = `px-4 py-2.5 rounded-lg shadow-lg text-xs font-medium flex items-center justify-between gap-3 ${bg}`;
    t.innerHTML = `<span>${message}</span><button class="opacity-70 hover:opacity-100">✕</button>`;

    cont.appendChild(t);
    t.querySelector('button').onclick = () => t.remove();
    setTimeout(() => t.remove(), 4000);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const app = new Application();
  app.init();
});
