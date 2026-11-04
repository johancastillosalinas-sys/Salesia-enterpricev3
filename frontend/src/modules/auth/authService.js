/**
 * @file authService.js
 * @description Inicio y cierre de sesión simulados.
 * - Las contraseñas se comparan por huella SHA-256 (nunca en texto plano).
 * - "Recordarme" guarda la sesión en LocalStorage; si no, solo dura mientras la pestaña esté abierta.
 * - Tras 5 intentos fallidos el acceso se bloquea 30 segundos.
 */

import { hashPassword } from '../../utils/hash.js';

const SESSION_KEY = 'salesia:session';
const LOCK_KEY = 'salesia:login-lock';
const MAX_ATTEMPTS = 5;
const LOCK_MS = 30000;

export class AuthService {
  constructor(storage, api) {
    this.storage = storage;
    this.api = api;
  }

  /** Devuelve el usuario con sesión activa o null. */
  restore() {
    const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try {
      const { userId } = JSON.parse(raw);
      const user = this.storage.get('users', []).find(u => u.id === userId);
      return user ? this.#publicUser(user) : null;
    } catch {
      return null;
    }
  }

  #publicUser(u) {
    const { passwordHash, ...rest } = u;
    return rest;
  }

  lockRemainingMs() {
    const state = JSON.parse(localStorage.getItem(LOCK_KEY) || '{"fails":0,"until":0}');
    return Math.max(0, state.until - Date.now());
  }

  /** @returns {{ok:boolean, user?:object, error?:string}} */
  login(identifier, password, remember = false) {
    const remaining = this.lockRemainingMs();
    if (remaining > 0) {
      return { ok: false, error: `Demasiados intentos. Espera ${Math.ceil(remaining / 1000)} s para volver a intentar.` };
    }
    const id = String(identifier || '').trim().toLowerCase();
    if (!id || !password) return { ok: false, error: 'Ingresa tu correo y tu contraseña.' };

    const user = this.storage.get('users', []).find(u => u.email.toLowerCase() === id || u.username.toLowerCase() === id);
    if (!user || user.passwordHash !== hashPassword(user.id, password)) return this.#fail();

    localStorage.removeItem(LOCK_KEY);
    return this.#openSession(user, remember, 'Inicio de sesión');
  }

  /** Acceso con una cuenta elegida en la ventana simulada de Google. */
  loginWithGoogle(userId) {
    const user = this.storage.get('users', []).find(u => u.id === userId);
    if (!user) return { ok: false, error: 'Cuenta no encontrada.' };
    return this.#openSession(user, true, 'Inicio de sesión con Google (simulado)');
  }

  #fail() {
    const state = JSON.parse(localStorage.getItem(LOCK_KEY) || '{"fails":0,"until":0}');
    state.fails += 1;
    if (state.fails >= MAX_ATTEMPTS) { state.fails = 0; state.until = Date.now() + LOCK_MS; }
    localStorage.setItem(LOCK_KEY, JSON.stringify(state));
    const left = MAX_ATTEMPTS - state.fails;
    return {
      ok: false,
      error: state.until > Date.now()
        ? 'Demasiados intentos. Acceso bloqueado 30 segundos.'
        : `Correo o contraseña incorrectos. Te quedan ${left} intento${left === 1 ? '' : 's'}.`
    };
  }

  #openSession(user, remember, label) {
    const payload = JSON.stringify({ userId: user.id, at: Date.now() });
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
    (remember ? localStorage : sessionStorage).setItem(SESSION_KEY, payload);
    const pub = this.#publicUser(user);
    this.storage.set('currentUser', pub);
    this.api.logAudit('LOGIN', 'users', `${label}: ${user.name} (${user.role})`);
    return { ok: true, user: pub };
  }

  logout() {
    const user = this.storage.get('currentUser', null);
    if (user) this.api.logAudit('LOGOUT', 'users', `Cierre de sesión: ${user.name}`);
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
    this.storage.remove('currentUser');
  }
}
