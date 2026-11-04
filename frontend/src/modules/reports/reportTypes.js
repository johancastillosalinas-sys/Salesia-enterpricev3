/**
 * @file reportTypes.js
 * @description Catálogo de reportes y quién puede verlos.
 */

const ALL = ['ADMINISTRADOR', 'GERENTE', 'ANALISTA', 'VENDEDOR', 'ALMACEN'];

export const REPORT_TYPES = {
  ejecutivo: { title: 'Reporte ejecutivo', desc: 'Resumen general: ventas, facturación, productos y clientes destacados, alertas de stock.', icon: 'chart', roles: ['ADMINISTRADOR', 'GERENTE', 'ANALISTA'] },
  ventas: { title: 'Reporte de ventas', desc: 'Detalle de ventas cobradas con totales por día, vendedor, método de pago y producto.', icon: 'sales', roles: ['ADMINISTRADOR', 'GERENTE', 'ANALISTA', 'VENDEDOR'] },
  facturacion: { title: 'Reporte de facturación', desc: 'Boletas y facturas emitidas, IGV y ventas pendientes de cobro o de comprobante.', icon: 'receipt', roles: ['ADMINISTRADOR', 'GERENTE', 'VENDEDOR'] },
  productos: { title: 'Productos y stock', desc: 'Catálogo valorizado, productos más vendidos, stock bajo y agotados.', icon: 'tag', roles: ['ADMINISTRADOR', 'GERENTE', 'ANALISTA', 'ALMACEN'] },
  inventario: { title: 'Inventario y movimientos', desc: 'Kárdex de entradas y salidas del período y existencias actuales.', icon: 'cube', roles: ['ADMINISTRADOR', 'GERENTE', 'ANALISTA', 'ALMACEN'] },
  clientes: { title: 'Reporte de clientes', desc: 'Compras, total comprado, ticket promedio y última compra por cliente.', icon: 'users', roles: ['ADMINISTRADOR', 'GERENTE', 'ANALISTA', 'VENDEDOR'] },
  vendedores: { title: 'Desempeño de vendedores', desc: 'Ventas, ingresos, unidades y participación de cada vendedor.', icon: 'users', roles: ['ADMINISTRADOR', 'GERENTE', 'ANALISTA'] },
  cotizaciones: { title: 'Reporte de cotizaciones', desc: 'Cotizaciones emitidas, convertidas en venta y monto en negociación.', icon: 'quote', roles: ['ADMINISTRADOR', 'GERENTE', 'ANALISTA', 'VENDEDOR'] },
  auditoria: { title: 'Reporte de auditoría', desc: 'Bitácora de accesos y operaciones críticas del período.', icon: 'shield', roles: ['ADMINISTRADOR'] }
};

export const canViewReport = (role, type) => !!REPORT_TYPES[type] && REPORT_TYPES[type].roles.includes(role) && ALL.includes(role);
