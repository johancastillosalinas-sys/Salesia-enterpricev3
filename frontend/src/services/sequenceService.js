/**
 * @file sequenceService.js
 * @description Generador atómico de folios consecutivos estrictos (#0001, #0002...).
 */

export class SequenceService {
  #prefix;
  #storageKey;
  #currentNumber;
  #digits;

  constructor(prefix = 'TICK', storageKey = 'salesia:seq:transactions', digits = 4) {
    this.#prefix = prefix;
    this.#storageKey = storageKey;
    this.#digits = digits;
    this.#currentNumber = this.#load();
  }

  #load() {
    try {
      const val = parseInt(localStorage.getItem(this.#storageKey) || '0', 10);
      return Number.isFinite(val) && val >= 0 ? val : 0;
    } catch {
      return 0;
    }
  }

  next() {
    this.#currentNumber += 1;
    localStorage.setItem(this.#storageKey, this.#currentNumber.toString());
    const formattedId = `${this.#prefix}-${String(this.#currentNumber).padStart(this.#digits, '0')}`;
    return {
      seqNumber: this.#currentNumber,
      formattedId,
      timestamp: Date.now()
    };
  }

  peek() {
    return this.#currentNumber;
  }

  reset(initial = 0) {
    this.#currentNumber = initial;
    localStorage.setItem(this.#storageKey, initial.toString());
  }
}
