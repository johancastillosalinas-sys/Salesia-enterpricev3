/**
 * @file fifoQueueService.js
 * @description Procesador de cola FIFO determinista para garantizar secuencia transaccional estricta en tiempo real.
 */

export class FifoQueueService {
  #queue = [];
  #isProcessing = false;
  #delayMs = 0;
  #eventBus;
  #metrics = { totalEnqueued: 0, totalCommitted: 0, totalRejected: 0, avgMs: 0 };

  constructor(eventBus) {
    this.#eventBus = eventBus;
  }

  setDelay(ms) {
    this.#delayMs = Math.max(0, ms);
  }

  getDelay() {
    return this.#delayMs;
  }

  enqueue(command, handler) {
    this.#metrics.totalEnqueued++;
    return new Promise((resolve, reject) => {
      const task = {
        id: `TASK-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        command,
        handler,
        resolve,
        reject
      };
      this.#queue.push(task);
      this.#eventBus?.emit('transaction:enqueued', { queueSize: this.#queue.length, task });

      if (!this.#isProcessing) {
        this.#processNext();
      }
    });
  }

  async #processNext() {
    if (this.#queue.length === 0) {
      this.#isProcessing = false;
      return;
    }

    this.#isProcessing = true;
    const task = this.#queue.shift();
    const t0 = performance.now();

    try {
      this.#eventBus?.emit('transaction:processing', { task, remaining: this.#queue.length });
      if (this.#delayMs > 0) {
        await new Promise(r => setTimeout(r, this.#delayMs));
      }
      const result = await task.handler(task.command);
      const elapsed = performance.now() - t0;
      this.#metrics.totalCommitted++;
      this.#updateAvg(elapsed);

      this.#eventBus?.emit('transaction:committed', { task, result, elapsed });
      task.resolve(result);
    } catch (err) {
      this.#metrics.totalRejected++;
      this.#eventBus?.emit('transaction:rejected', { task, error: err.message || err });
      task.reject(err);
    } finally {
      queueMicrotask(() => this.#processNext());
    }
  }

  #updateAvg(elapsed) {
    const n = this.#metrics.totalCommitted;
    if (n === 1) this.#metrics.avgMs = elapsed;
    else this.#metrics.avgMs += (elapsed - this.#metrics.avgMs) / n;
  }

  getMetrics() {
    return {
      ...this.#metrics,
      queueLength: this.#queue.length,
      isBusy: this.#isProcessing,
      avgMs: Number(this.#metrics.avgMs.toFixed(2))
    };
  }

  reset() {
    this.#queue = [];
    this.#isProcessing = false;
    this.#metrics = { totalEnqueued: 0, totalCommitted: 0, totalRejected: 0, avgMs: 0 };
  }
}
