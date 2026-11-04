/**
 * @file pages.js
 * @description Datos de cada módulo (título, descripción, ícono) usados por el menú,
 * la cabecera y la paleta de comandos.
 */

export const PAGE_META = {
  dashboard: { title: 'Inicio', subtitle: 'Resumen de la operación del día', icon: 'home' },
  pos: { title: 'Ventas', subtitle: 'Emite ventas y consulta las más recientes', icon: 'sales' },
  billing: { title: 'Facturación', subtitle: 'Cobros, boletas y facturas electrónicas', icon: 'receipt' },
  quotes: { title: 'Cotizaciones', subtitle: 'Presupuestos para clientes, sin afectar el stock', icon: 'quote' },
  customers: { title: 'Clientes', subtitle: 'Directorio y fichas de clientes', icon: 'users' },
  products: { title: 'Productos', subtitle: 'Catálogo, precios y existencias', icon: 'tag' },
  inventory: { title: 'Inventario', subtitle: 'Existencias y movimientos de almacén', icon: 'cube' },
  reports: { title: 'Reportes', subtitle: 'Indicadores comerciales y exportación', icon: 'chart' },
  import: { title: 'Importar datos', subtitle: 'Carga un archivo CSV y llena todos los módulos', icon: 'upload' },
  security: { title: 'Análisis de seguridad', subtitle: 'Evalúa la seguridad de cualquier proyecto comprimido en ZIP', icon: 'lock' },
  audit: { title: 'Auditoría', subtitle: 'Trazabilidad de operaciones críticas', icon: 'shield' },
  history: { title: 'Historial de Ventas', subtitle: 'Libro de comprobantes emitidos', icon: 'clock' }
};
