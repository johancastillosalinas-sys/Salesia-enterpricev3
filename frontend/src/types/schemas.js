/**
 * @file schemas.js
 * @description Modelos de datos del sistema conforme a la Sección 12 del Plan de Desarrollo:
 * users, roles, companies, customers, products, categories, sales, sale_details,
 * payments, inventory, inventory_movements, employees, reports, audit_logs.
 */

export const UserRole = Object.freeze({
  ADMIN: 'ADMINISTRADOR',
  GERENTE: 'GERENTE',
  VENDEDOR: 'VENDEDOR',
  ANALISTA: 'ANALISTA',
  ALMACEN: 'ALMACEN'
});

export const SaleStatus = Object.freeze({
  PENDING: 'PENDIENTE',
  PROCESSING: 'PROCESANDO',
  COMPLETED: 'COMPLETADO',
  REJECTED: 'RECHAZADO',
  CANCELLED: 'ANULADO'
});

export const QuoteStatus = Object.freeze({
  DRAFT: 'BORRADOR',
  ISSUED: 'EMITIDA',
  ACCEPTED: 'ACEPTADA',
  REJECTED: 'RECHAZADA',
  EXPIRED: 'VENCIDA',
  CONVERTED: 'CONVERTIDA'
});

export const PaymentMethod = Object.freeze({
  TRANSFER: 'TRANSFERENCIA',
  CREDIT_CARD: 'TARJETA_CREDITO',
  CASH: 'EFECTIVO',
  DIGITAL_WALLET: 'YAPE_PLIN'
});
