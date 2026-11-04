/**
 * @file schemaMigration.js
 * @description Gestor de migraciones e inicialización de esquemas en LocalStorage.
 * Los datos de negocio empiezan en CERO; solo se crean empresa, roles y cuentas de acceso.
 */

import { INITIAL_COMPANY, INITIAL_ROLES, INITIAL_USERS } from '../seeds/initialSeed.js';

export const CURRENT_SCHEMA_VERSION = 4;

const BUSINESS_COLLECTIONS = ['customers', 'products', 'categories', 'sellers', 'sales', 'quotes', 'inventory_movements'];

export class SchemaMigration {
  static runMigrations(storage) {
    const previous = parseInt(localStorage.getItem('salesia:meta:version') || '0', 10);

    // Versiones anteriores traían datos de demostración: si no hay ventas ni cotizaciones, se limpian
    // para que el sistema quede en cero (si ya hay ventas se respetan, para no perder trabajo).
    if (previous > 0 && previous < 4 && (storage.get('sales', []).length === 0) && (storage.get('quotes', []).length === 0)) {
      BUSINESS_COLLECTIONS.forEach(k => storage.set(k, []));
    }

    if (!storage.get('company')) storage.set('company', INITIAL_COMPANY);
    if (!Array.isArray(storage.get('roles'))) storage.set('roles', INITIAL_ROLES);
    BUSINESS_COLLECTIONS.forEach(k => { if (!Array.isArray(storage.get(k))) storage.set(k, []); });
    if (!storage.get('audit_logs')) storage.set('audit_logs', []);
    if (!storage.get('doc_series')) storage.set('doc_series', { BOLETA: 0, FACTURA: 0 });

    // Cuentas de acceso: se crean o se completan con su contraseña (huella)
    const users = storage.get('users');
    if (!Array.isArray(users) || users.length === 0) {
      storage.set('users', INITIAL_USERS);
    } else if (users.some(u => !u.passwordHash)) {
      storage.set('users', users.map(u => u.passwordHash ? u : { ...u, passwordHash: INITIAL_USERS.find(i => i.id === u.id)?.passwordHash || INITIAL_USERS[0].passwordHash }));
    }

    // Colecciones del módulo estadístico retirado
    storage.remove('statistical_analyses');
    storage.remove('bayes_analyses');
    // Ya no hay usuario por defecto: se entra con el login
    if (previous < 4) storage.remove('currentUser');

    localStorage.setItem('salesia:meta:version', String(CURRENT_SCHEMA_VERSION));
  }

  /** Deja el sistema en cero (conserva empresa, roles y cuentas). */
  static resetDatabase(storage) {
    storage.clearSystemData();
    localStorage.setItem('salesia:meta:version', String(CURRENT_SCHEMA_VERSION));
    storage.set('company', INITIAL_COMPANY);
    storage.set('roles', INITIAL_ROLES);
    storage.set('users', INITIAL_USERS);
    BUSINESS_COLLECTIONS.forEach(k => storage.set(k, []));
    storage.set('audit_logs', []);
    storage.set('doc_series', { BOLETA: 0, FACTURA: 0 });
    localStorage.setItem('salesia:seq:transactions', '0');
    localStorage.setItem('salesia:seq:quotes', '0');
  }
}
