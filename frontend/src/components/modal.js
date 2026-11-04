/**
 * @file modal.js
 * @description Gestión de ventanas emergentes: abrir/cerrar, tecla ESC, clic fuera
 * y diálogo de confirmación propio (reemplaza a window.confirm).
 * Las ventanas apiladas se cierran de arriba hacia abajo (la última en el DOM está encima).
 */

export class Modal {
  static init() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') Modal.closeTop();
    });
    document.addEventListener('mousedown', (e) => {
      const overlay = e.target;
      if (overlay?.dataset?.modal === 'light' && overlay.classList.contains('modal-overlay')) {
        Modal.close(overlay.id);
      }
    });
  }

  static open(id) {
    document.getElementById(id)?.classList.remove('hidden');
  }

  /** @param {boolean} force omite la pregunta previa (`__beforeClose`) de la ventana */
  static close(id, force = false) {
    const el = document.getElementById(id);
    if (!el || el.classList.contains('hidden')) return;
    if (!force && typeof el.__beforeClose === 'function') {
      Promise.resolve(el.__beforeClose()).then(ok => { if (ok) Modal.close(id, true); });
      return;
    }
    el.classList.add('hidden');
    el.dispatchEvent(new CustomEvent('modal:closed'));
  }

  static visible() {
    return [...document.querySelectorAll('[data-modal]')].filter(el => !el.classList.contains('hidden'));
  }

  static closeTop() {
    const open = Modal.visible();
    const top = open[open.length - 1];
    if (top) Modal.close(top.id);
  }
}

export class ConfirmDialog {
  static #resolve = null;

  /**
   * @returns {Promise<boolean>} true si el usuario confirma
   */
  static ask({ title = 'Confirmar acción', message = '', confirmText = 'Confirmar', cancelText = 'Cancelar', tone = 'primary' } = {}) {
    const el = document.getElementById('confirmModal');
    if (!el) return Promise.resolve(window.confirm(message));

    document.getElementById('confirmTitle').innerText = title;
    document.getElementById('confirmMessage').innerText = message;
    const ok = document.getElementById('confirmOk');
    const cancel = document.getElementById('confirmCancel');
    ok.innerText = confirmText;
    cancel.innerText = cancelText;
    ok.className = `px-4 py-2 rounded-xl text-white font-semibold text-xs transition-colors ${
      tone === 'danger' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-blue-600 hover:bg-blue-700'}`;

    return new Promise((resolve) => {
      ConfirmDialog.#resolve?.(false);
      ConfirmDialog.#resolve = resolve;
      const finish = (value) => {
        const r = ConfirmDialog.#resolve;
        ConfirmDialog.#resolve = null;
        Modal.close('confirmModal', true);
        r?.(value);
      };
      ok.onclick = () => finish(true);
      cancel.onclick = () => finish(false);
      el.onclick = null;
      el.addEventListener('modal:closed', () => { ConfirmDialog.#resolve?.(false); ConfirmDialog.#resolve = null; }, { once: true });
      Modal.open('confirmModal');
      ok.focus();
    });
  }
}
