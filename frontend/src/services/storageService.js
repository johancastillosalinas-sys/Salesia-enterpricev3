/**
 * @file storageService.js
 * @description Servicio de persistencia en LocalStorage con particionado de claves,
 * manejo de cuota y tolerancia a fallos.
 */

export class StorageService {
  static #PREFIX = 'salesia:';
  #cache = new Map();

  get(key, fallback = null) {
    const fullKey = `${StorageService.#PREFIX}${key}`;
    if (this.#cache.has(fullKey)) {
      return this.#cache.get(fullKey);
    }
    try {
      const raw = localStorage.getItem(fullKey);
      if (raw === null || raw === undefined) return fallback;
      const parsed = JSON.parse(raw);
      this.#cache.set(fullKey, parsed);
      return parsed;
    } catch (e) {
      console.warn(`[StorageService] Fallback en "${fullKey}":`, e);
      return fallback;
    }
  }

  set(key, value) {
    const fullKey = `${StorageService.#PREFIX}${key}`;
    try {
      localStorage.setItem(fullKey, JSON.stringify(value));
      this.#cache.set(fullKey, value);
      return true;
    } catch (e) {
      console.error(`[StorageService] Error al escribir en "${fullKey}":`, e);
      return false;
    }
  }

  remove(key) {
    const fullKey = `${StorageService.#PREFIX}${key}`;
    this.#cache.delete(fullKey);
    localStorage.removeItem(fullKey);
  }

  clearSystemData() {
    this.#cache.clear();
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(StorageService.#PREFIX)) toRemove.push(k);
    }
    toRemove.forEach(k => localStorage.removeItem(k));
  }

  getStorageUsage() {
    let totalBytes = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(StorageService.#PREFIX)) {
        const val = localStorage.getItem(k) || '';
        totalBytes += (k.length + val.length) * 2;
      }
    }
    const kbUsed = Number((totalBytes / 1024).toFixed(2));
    const percentage = Number(((totalBytes / (5 * 1024 * 1024)) * 100).toFixed(2));
    return { bytesUsed: totalBytes, kbUsed, percentage };
  }
}
