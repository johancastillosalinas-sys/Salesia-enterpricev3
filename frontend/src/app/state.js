/**
 * @file state.js
 * @description Estado global de la aplicación con inyección de dependencias modular.
 */

import { StorageService } from '../services/storageService.js';
import { SequenceService } from '../services/sequenceService.js';
import { FifoQueueService } from '../services/fifoQueueService.js';
import { SalesIaApi } from '../services/api.js';
import { EventBusSingleton } from '../hooks/useEventBus.js';
import { QuoteEngine } from '../modules/quotes/quoteEngine.js';
import { SchemaMigration } from '../../../database/migrations/schemaMigration.js';

export class AppState {
  constructor() {
    this.storage = new StorageService();
    this.eventBus = EventBusSingleton.getInstance();
    this.seqTransactions = new SequenceService('TICK', 'salesia:seq:transactions', 4);
    this.seqQuotes = new SequenceService('COT', 'salesia:seq:quotes', 4);
    this.queue = new FifoQueueService(this.eventBus);

    // Ejecutar migraciones iniciales de LocalStorage
    SchemaMigration.runMigrations(this.storage);

    this.api = new SalesIaApi(this.storage, this.queue, this.seqTransactions, this.eventBus);
    this.quoteEngine = new QuoteEngine(this.storage, this.seqQuotes);
  }
}
