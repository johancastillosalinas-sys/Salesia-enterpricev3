/**
 * @file router.js
 * @description Ruteo desacoplado para navegación fluida entre los módulos funcionales del Plan de Desarrollo.
 */

export class AppRouter {
  #current = 'dashboard';
  #subscribers = new Set();
  #guard = null;

  constructor() {
    this.#bindNavEvents();
  }

  #bindNavEvents() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-nav-target]');
      if (btn) {
        const target = btn.getAttribute('data-nav-target');
        this.navigate(target);
      }
    });
  }

  // Función (ruta) => boolean que decide si se permite navegar a esa ruta
  setGuard(fn) {
    this.#guard = fn;
  }

  navigate(moduleName) {
    if (this.#guard && !this.#guard(moduleName)) return false;
    this.#current = moduleName;

    // Actualizar sidebar activo
    document.querySelectorAll('[data-nav-target]').forEach(el => {
      if (el.getAttribute('data-nav-target') === moduleName) {
        el.classList.add('bg-blue-800', 'text-white', 'font-semibold');
        el.classList.remove('text-slate-300', 'hover:bg-slate-900');
      } else {
        el.classList.remove('bg-blue-800', 'text-white', 'font-semibold');
        el.classList.add('text-slate-300', 'hover:bg-slate-900');
      }
    });

    // Mostrar sección
    document.querySelectorAll('.view-section').forEach(sec => {
      sec.classList.add('hidden');
    });

    const activeSec = document.getElementById(`view-${moduleName}`);
    if (activeSec) {
      activeSec.classList.remove('hidden');
    }

    // Notificar a los observadores
    this.#subscribers.forEach(cb => cb(moduleName));
      return true;
  }

  onRouteChange(cb) {
    this.#subscribers.add(cb);
  }

  getCurrentRoute() {
    return this.#current;
  }
}
