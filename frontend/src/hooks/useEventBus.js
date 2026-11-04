/**
 * @file useEventBus.js
 * @description Hook/Patrón para suscribirse a eventos de dominio desacoplados en el frontend.
 */

export class EventBusSingleton {
  static #instance = null;
  #listeners = new Map();

  static getInstance() {
    if (!EventBusSingleton.#instance) {
      EventBusSingleton.#instance = new EventBusSingleton();
    }
    return EventBusSingleton.#instance;
  }

  subscribe(event, callback) {
    if (!this.#listeners.has(event)) {
      this.#listeners.set(event, new Set());
    }
    this.#listeners.get(event).add(callback);
    return () => this.#listeners.get(event)?.delete(callback);
  }

  emit(event, payload) {
    if (!this.#listeners.has(event)) return;
    for (const cb of this.#listeners.get(event)) {
      try {
        cb(payload);
      } catch (err) {
        console.error(`[EventBus] Error en ${event}:`, err);
      }
    }
  }
}
