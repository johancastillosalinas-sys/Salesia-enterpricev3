/**
 * @file loginController.js
 * @description Pantalla de inicio de sesión: correo y contraseña, "Recordarme",
 * recuperación simulada y acceso con cuenta de Google simulada.
 */

import { Modal } from '../../components/modal.js';
import { icon, avatar } from '../../components/uiKit.js';
import { escapeHtml } from '../../utils/formatters.js';

const $ = (id) => document.getElementById(id);
const DEMO_PASSWORD = 'Salesia2026';
const ROLE_LABELS = { ADMINISTRADOR: 'Administrador', GERENTE: 'Gerente', VENDEDOR: 'Vendedor', ANALISTA: 'Analista', ALMACEN: 'Almacén' };

export class LoginController {
  constructor(app) {
    this.app = app;
    this.busy = false;
  }

  bind() {
    const users = this.app.state.storage.get('users', []);

    $('loginDemo').innerHTML = users.map(u => `
      <button type="button" data-demo="${escapeHtml(u.id)}" class="px-2.5 py-1 rounded-full border border-slate-300 text-[11px] font-semibold text-slate-600 hover:bg-slate-100">${escapeHtml(ROLE_LABELS[u.role] || u.role)}</button>`).join('');
    $('loginDemo').onclick = (e) => {
      const btn = e.target.closest('[data-demo]');
      const user = users.find(u => u.id === btn?.dataset.demo);
      if (!user) return;
      $('loginEmail').value = user.email;
      $('loginPassword').value = DEMO_PASSWORD;
      this.#clearMessages();
    };

    $('loginTogglePw').onclick = () => {
      const pw = $('loginPassword');
      const show = pw.type === 'password';
      pw.type = show ? 'text' : 'password';
      $('loginTogglePw').innerHTML = icon(show ? 'eyeoff' : 'eye', 'w-4 h-4');
    };

    $('loginForm').onsubmit = (e) => { e.preventDefault(); this.submit(); };

    $('loginForgot').onclick = () => {
      this.#clearMessages();
      const email = $('loginEmail').value.trim();
      if (!/^\S+@\S+\.\S+$/.test(email)) { this.#error('Escribe tu correo arriba para enviarte el enlace de recuperación.'); return; }
      this.#notice(`Enviamos un enlace de recuperación a ${email} (simulado).`);
    };

    $('loginGoogle').onclick = () => {
      $('googleAccounts').innerHTML = users.map(u => `
        <button type="button" data-google="${escapeHtml(u.id)}" class="w-full flex items-center gap-3 px-2 py-3 text-left hover:bg-slate-50">
          ${avatar(u.name, 'w-9 h-9 text-xs')}
          <span class="min-w-0"><span class="block text-sm font-medium text-slate-800 truncate">${escapeHtml(u.name)}</span><span class="block text-xs text-slate-500 truncate">${escapeHtml(u.email)}</span></span>
        </button>`).join('');
      Modal.open('googleModal');
    };
    $('googleAccounts').onclick = async (e) => {
      const btn = e.target.closest('[data-google]');
      if (!btn) return;
      btn.innerHTML = '<span class="spinner dark"></span><span class="ml-3 text-sm text-slate-500">Iniciando sesión…</span>';
      await this.#wait(700);
      const res = this.app.auth.loginWithGoogle(btn.dataset.google);
      Modal.close('googleModal', true);
      if (res.ok) this.app.startSession(res.user);
      else this.#error(res.error);
    };
  }

  show() {
    this.#clearMessages();
    $('loginPassword').value = '';
    $('loginScreen').classList.remove('hidden');
    $('loginEmail').focus();
  }

  hide() {
    $('loginScreen').classList.add('hidden');
  }

  #wait(ms) {
    return new Promise(r => setTimeout(r, globalThis.__SALESIA_FAST__ ? 10 : ms));
  }

  #clearMessages() {
    $('loginError').classList.add('hidden');
    $('loginNotice').classList.add('hidden');
  }

  #error(message) {
    $('loginNotice').classList.add('hidden');
    const el = $('loginError');
    el.innerText = message;
    el.classList.remove('hidden');
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
  }

  #notice(message) {
    $('loginError').classList.add('hidden');
    $('loginNotice').innerText = message;
    $('loginNotice').classList.remove('hidden');
  }

  async submit() {
    if (this.busy) return;
    this.#clearMessages();
    const email = $('loginEmail').value.trim();
    const password = $('loginPassword').value;
    if (!email || !password) { this.#error('Ingresa tu correo y tu contraseña.'); return; }

    this.busy = true;
    const btn = $('loginSubmit');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';
    await this.#wait(650);

    const res = this.app.auth.login(email, password, $('loginRemember').checked);
    this.busy = false;
    btn.disabled = false;
    btn.innerText = 'Iniciar sesión';

    if (!res.ok) { this.#error(res.error); return; }
    this.app.startSession(res.user);
  }
}
