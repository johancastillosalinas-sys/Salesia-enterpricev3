/**
 * @file reportBuilder.js
 * @description Arma el contenido de cada reporte a partir de los datos guardados.
 * Devuelve un "modelo" (secciones de KPIs, barras y tablas) que luego se dibuja como documento
 * o se exporta a CSV. Los montos de ingresos cuentan solo ventas ya cobradas.
 */

import { isPaid, billingState } from '../billing/saleStatus.js';
import { paymentLabel } from '../sales/payments.js';
import { parseDate } from '../importer/csvImporter.js';
import { REPORT_TYPES } from './reportTypes.js';

const sum = (list, fn) => list.reduce((a, x) => a + fn(x), 0);
const round2 = (n) => Math.round(n * 100) / 100;
const units = (s) => sum(s.items, it => it.quantity);
const pad = (n) => String(n).padStart(2, '0');

function groupBy(list, keyFn) {
  const map = new Map();
  for (const x of list) { const k = keyFn(x); (map.get(k) || map.set(k, []).get(k)).push(x); }
  return map;
}

export function periodLabel({ from, to }) {
  const f = (ms) => new Date(ms).toLocaleDateString('es-PE');
  if (from && to) return `Del ${f(from)} al ${f(to)}`;
  if (from) return `Desde el ${f(from)}`;
  if (to) return `Hasta el ${f(to)}`;
  return 'Todo el historial';
}

const kpi = (label, value, type = 'int', sub = '') => ({ label, value, type, sub });

export function buildReport(type, { storage, range = {}, user = {} }) {
  const def = REPORT_TYPES[type];
  const inRange = (ms) => (!range.from || ms >= range.from) && (!range.to || ms <= range.to);
  const allSales = storage.get('sales', []);
  const sales = allSales.filter(s => isPaid(s) && inRange(s.timestamp));
  const products = storage.get('products', []);
  const customers = storage.get('customers', []);
  const sections = [];

  // ---------- bloques reutilizables
  const timeBars = (title) => {
    const times = sales.map(s => s.timestamp);
    const span = times.length ? (Math.max(...times) - Math.min(...times)) / 86400000 : 0;
    const monthly = span > 45;
    const groups = groupBy(sales, s => { const d = new Date(s.timestamp); return monthly ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}` : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; });
    const rows = [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, list]) => {
      const [y, m, d] = k.split('-');
      const label = monthly ? new Date(+y, +m - 1, 1).toLocaleDateString('es-PE', { month: 'short', year: 'numeric' }) : `${d}/${m}`;
      return { label, value: round2(sum(list, s => s.totals.total)), extra: `${list.length} ventas` };
    });
    return { kind: 'bars', title: `${title} (${monthly ? 'por mes' : 'por día'})`, rows: rows.slice(-31), type: 'money' };
  };
  const byField = (title, keyFn, valueType = 'money') => {
    const rows = [...groupBy(sales, keyFn).entries()].map(([label, list]) => ({ label, value: round2(sum(list, s => s.totals.total)), extra: `${list.length} ventas` }))
      .sort((a, b) => b.value - a.value);
    return { kind: 'bars', title, rows, type: valueType };
  };
  const productRanking = (limit) => {
    const map = new Map();
    for (const s of sales) for (const it of s.items) {
      const r = map.get(it.productId) || map.set(it.productId, { sku: it.sku || '—', name: it.name, units: 0, revenue: 0 }).get(it.productId);
      r.units += it.quantity; r.revenue += it.price * it.quantity;
    }
    return [...map.values()].sort((a, b) => b.units - a.units).slice(0, limit).map((r, i) => ({ rank: i + 1, ...r, revenue: round2(r.revenue) }));
  };
  const productTable = (title, limit) => ({
    kind: 'table', title, columns: [{ key: 'rank', label: '#', type: 'int' }, { key: 'sku', label: 'SKU' }, { key: 'name', label: 'Producto' }, { key: 'units', label: 'Unidades', type: 'int' }, { key: 'revenue', label: 'Ingresos (sin IGV)', type: 'money' }],
    rows: productRanking(limit)
  });
  const customerRanking = () => {
    const map = new Map();
    for (const s of sales) {
      const r = map.get(s.customerId || s.customerName) || map.set(s.customerId || s.customerName, { name: s.customerName, purchases: 0, total: 0, last: 0 }).get(s.customerId || s.customerName);
      r.purchases++; r.total += s.totals.total; r.last = Math.max(r.last, s.timestamp);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  };
  const sellerRows = () => {
    const total = sum(sales, s => s.totals.total) || 1;
    return [...groupBy(sales, s => s.sellerName || 'Sin vendedor').entries()].map(([name, list]) => ({
      name, sales: list.length, units: sum(list, units), revenue: round2(sum(list, s => s.totals.total)), share: sum(list, s => s.totals.total) / total * 100
    })).sort((a, b) => b.revenue - a.revenue);
  };
  const stockAlerts = () => products.filter(p => (p.status || 'ACTIVE') === 'ACTIVE' && p.stock <= p.minStock)
    .sort((a, b) => a.stock - b.stock).map(p => ({ sku: p.sku, name: p.name, stock: p.stock, min: p.minStock, state: p.stock <= 0 ? 'Agotado' : 'Stock bajo' }));
  const stockTable = (title) => ({
    kind: 'table', title, empty: 'Todos los productos están por encima de su stock mínimo.',
    columns: [{ key: 'sku', label: 'SKU' }, { key: 'name', label: 'Producto' }, { key: 'stock', label: 'Stock', type: 'int' }, { key: 'min', label: 'Mínimo', type: 'int' }, { key: 'state', label: 'Estado' }],
    rows: stockAlerts()
  });
  const salesDetail = (limit = 500) => ({
    kind: 'table', title: 'Detalle de ventas', limit,
    columns: [{ key: 'id', label: 'Folio' }, { key: 'date', label: 'Fecha', type: 'date' }, { key: 'customer', label: 'Cliente' }, { key: 'seller', label: 'Vendedor' }, { key: 'pay', label: 'Pago' },
      { key: 'doc', label: 'Comprobante' }, { key: 'subtotal', label: 'Subtotal', type: 'money' }, { key: 'tax', label: 'IGV', type: 'money' }, { key: 'total', label: 'Total', type: 'money' }],
    rows: [...sales].sort((a, b) => a.timestamp - b.timestamp).map(s => ({ id: s.id, date: s.timestamp, customer: s.customerName, seller: s.sellerName || '—', pay: paymentLabel(s.paymentMethod),
      doc: s.invoice?.fullNumber || '—', subtotal: s.totals.subtotal, tax: s.totals.taxAmount, total: s.totals.total })),
    totals: { customer: 'TOTAL', subtotal: round2(sum(sales, s => s.totals.subtotal)), tax: round2(sum(sales, s => s.totals.taxAmount)), total: round2(sum(sales, s => s.totals.total)) }
  });
  const inventoryValue = () => sum(products.filter(p => (p.status || 'ACTIVE') === 'ACTIVE'), p => (p.cost || 0) * p.stock);

  const totalRevenue = sum(sales, s => s.totals.total);
  const pending = allSales.filter(s => billingState(s) === 'PENDIENTE');
  let subtitle = def.desc;

  switch (type) {
    case 'ejecutivo': {
      const issued = allSales.filter(s => s.invoice && inRange(s.invoice.issuedAt));
      sections.push({ kind: 'kpis', items: [
        kpi('Ventas cobradas', sales.length), kpi('Total facturado', round2(totalRevenue), 'money', 'incluye IGV'), kpi('IGV', round2(sum(sales, s => s.totals.taxAmount)), 'money'),
        kpi('Unidades vendidas', sum(sales, units)), kpi('Clientes atendidos', new Set(sales.map(s => s.customerId || s.customerName)).size),
        kpi('Venta más alta', round2(Math.max(0, ...sales.map(s => s.totals.total))), 'money'), kpi('Comprobantes emitidos', issued.length),
        kpi('Pendiente de cobro', round2(sum(pending, s => s.totals.total)), 'money', `${pending.length} ventas`)] });
      sections.push(timeBars('Ventas'), byField('Ventas por método de pago', s => paymentLabel(s.paymentMethod)), productTable('Productos más vendidos', 5));
      sections.push({ kind: 'table', title: 'Mejores clientes', empty: 'Sin ventas en el período.', columns: [{ key: 'name', label: 'Cliente' }, { key: 'purchases', label: 'Compras', type: 'int' }, { key: 'total', label: 'Total comprado', type: 'money' }],
        rows: customerRanking().slice(0, 5).map(r => ({ ...r, total: round2(r.total) })) });
      sections.push({ kind: 'table', title: 'Desempeño por vendedor', empty: 'Sin ventas en el período.', columns: [{ key: 'name', label: 'Vendedor' }, { key: 'sales', label: 'Ventas', type: 'int' }, { key: 'revenue', label: 'Ingresos', type: 'money' }, { key: 'share', label: 'Participación', type: 'pct' }], rows: sellerRows() });
      sections.push(stockTable('Alertas de stock'));
      break;
    }
    case 'ventas': {
      sections.push({ kind: 'kpis', items: [kpi('Ventas cobradas', sales.length), kpi('Subtotal', round2(sum(sales, s => s.totals.subtotal)), 'money'), kpi('IGV (18%)', round2(sum(sales, s => s.totals.taxAmount)), 'money'),
        kpi('Total', round2(totalRevenue), 'money'), kpi('Unidades vendidas', sum(sales, units)), kpi('Venta más alta', round2(Math.max(0, ...sales.map(s => s.totals.total))), 'money')] });
      sections.push(timeBars('Ventas'), byField('Por método de pago', s => paymentLabel(s.paymentMethod)), byField('Por vendedor', s => s.sellerName || 'Sin vendedor'), productTable('Productos más vendidos', 10), salesDetail());
      break;
    }
    case 'facturacion': {
      const issued = allSales.filter(s => s.invoice && inRange(s.invoice.issuedAt));
      const boletas = issued.filter(s => s.invoice.type === 'BOLETA'), facturas = issued.filter(s => s.invoice.type === 'FACTURA');
      const toIssue = allSales.filter(s => billingState(s) === 'POR_EMITIR' && inRange(s.timestamp));
      sections.push({ kind: 'kpis', items: [kpi('Boletas emitidas', boletas.length, 'int', `S/ ${round2(sum(boletas, s => s.totals.total)).toLocaleString('es-PE')}`), kpi('Facturas emitidas', facturas.length, 'int', `S/ ${round2(sum(facturas, s => s.totals.total)).toLocaleString('es-PE')}`),
        kpi('Total facturado', round2(sum(issued, s => s.totals.total)), 'money'), kpi('IGV facturado', round2(sum(issued, s => s.totals.taxAmount)), 'money'),
        kpi('Pendientes de cobro', pending.length, 'int', `S/ ${round2(sum(pending, s => s.totals.total)).toLocaleString('es-PE')}`), kpi('Cobradas sin comprobante', toIssue.length)] });
      sections.push({ kind: 'table', title: 'Comprobantes emitidos', limit: 500, empty: 'No hay comprobantes emitidos en el período.',
        columns: [{ key: 'number', label: 'Comprobante' }, { key: 'kind', label: 'Tipo' }, { key: 'date', label: 'Emisión', type: 'date' }, { key: 'customer', label: 'Cliente' }, { key: 'doc', label: 'RUC / DNI' }, { key: 'pay', label: 'Pago' },
          { key: 'base', label: 'Base imponible', type: 'money' }, { key: 'tax', label: 'IGV', type: 'money' }, { key: 'total', label: 'Total', type: 'money' }],
        rows: [...issued].sort((a, b) => a.invoice.issuedAt - b.invoice.issuedAt).map(s => ({ number: s.invoice.fullNumber, kind: s.invoice.type === 'FACTURA' ? 'Factura' : 'Boleta', date: s.invoice.issuedAt, customer: s.invoice.customer?.name || s.customerName,
          doc: s.invoice.customer?.docNumber || '—', pay: paymentLabel(s.paymentMethod), base: s.totals.subtotal, tax: s.totals.taxAmount, total: s.totals.total })),
        totals: { customer: 'TOTAL', base: round2(sum(issued, s => s.totals.subtotal)), tax: round2(sum(issued, s => s.totals.taxAmount)), total: round2(sum(issued, s => s.totals.total)) } });
      sections.push({ kind: 'table', title: 'Ventas pendientes de cobro', limit: 100, empty: 'No hay ventas pendientes de cobro.',
        columns: [{ key: 'id', label: 'Venta' }, { key: 'date', label: 'Fecha', type: 'date' }, { key: 'customer', label: 'Cliente' }, { key: 'seller', label: 'Vendedor' }, { key: 'total', label: 'Total', type: 'money' }],
        rows: pending.map(s => ({ id: s.id, date: s.timestamp, customer: s.customerName, seller: s.sellerName || '—', total: s.totals.total })) });
      break;
    }
    case 'productos': {
      const active = products.filter(p => (p.status || 'ACTIVE') === 'ACTIVE');
      sections.push({ kind: 'kpis', items: [kpi('Productos activos', active.length), kpi('Valor del inventario (costo)', round2(inventoryValue()), 'money'), kpi('Valor a precio de venta', round2(sum(active, p => p.price * p.stock)), 'money'),
        kpi('Unidades en stock', sum(active, p => p.stock)), kpi('Stock bajo', active.filter(p => p.stock > 0 && p.stock <= p.minStock).length), kpi('Agotados', active.filter(p => p.stock <= 0).length)] });
      sections.push({ kind: 'bars', title: 'Valor del inventario por categoría (a costo)', type: 'money',
        rows: [...groupBy(active, p => p.categoryName || 'General').entries()].map(([label, list]) => ({ label, value: round2(sum(list, p => (p.cost || 0) * p.stock)), extra: `${list.length} productos` })).sort((a, b) => b.value - a.value) });
      sections.push(productTable('Más vendidos del período', 10), stockTable('Productos con stock bajo o agotados'));
      sections.push({ kind: 'table', title: 'Catálogo valorizado', limit: 500, empty: 'No hay productos registrados.',
        columns: [{ key: 'sku', label: 'SKU' }, { key: 'name', label: 'Producto' }, { key: 'cat', label: 'Categoría' }, { key: 'price', label: 'Precio', type: 'money' }, { key: 'cost', label: 'Costo', type: 'money' },
          { key: 'stock', label: 'Stock', type: 'int' }, { key: 'min', label: 'Mín.', type: 'int' }, { key: 'value', label: 'Valor (costo)', type: 'money' }],
        rows: [...active].sort((a, b) => a.name.localeCompare(b.name, 'es')).map(p => ({ sku: p.sku, name: p.name, cat: p.categoryName, price: p.price, cost: p.cost || 0, stock: p.stock, min: p.minStock, value: round2((p.cost || 0) * p.stock) })),
        totals: { name: 'TOTAL', stock: sum(active, p => p.stock), value: round2(inventoryValue()) } });
      break;
    }
    case 'inventario': {
      const moves = storage.get('inventory_movements', []).map(m => ({ ...m, ts: m.timestamp ?? parseDate((m.dateFormatted || '').replace(',', '')) ?? 0 })).filter(m => inRange(m.ts));
      const entries = moves.filter(m => String(m.type).startsWith('ENTRADA')), exits = moves.filter(m => !String(m.type).startsWith('ENTRADA'));
      const active = products.filter(p => (p.status || 'ACTIVE') === 'ACTIVE');
      sections.push({ kind: 'kpis', items: [kpi('Unidades en stock', sum(active, p => p.stock)), kpi('Valor (costo)', round2(inventoryValue()), 'money'), kpi('Movimientos', moves.length),
        kpi('Unidades que entraron', sum(entries, m => m.quantity)), kpi('Unidades que salieron', sum(exits, m => m.quantity)), kpi('Stock bajo / agotado', stockAlerts().length)] });
      sections.push({ kind: 'table', title: 'Existencias por categoría', empty: 'Sin productos.', columns: [{ key: 'cat', label: 'Categoría' }, { key: 'products', label: 'Productos', type: 'int' }, { key: 'stock', label: 'Unidades', type: 'int' }, { key: 'value', label: 'Valor (costo)', type: 'money' }],
        rows: [...groupBy(active, p => p.categoryName || 'General').entries()].map(([cat, l]) => ({ cat, products: l.length, stock: sum(l, p => p.stock), value: round2(sum(l, p => (p.cost || 0) * p.stock)) })) });
      sections.push(stockTable('Alertas de stock'));
      sections.push({ kind: 'table', title: 'Kárdex: movimientos del período', limit: 500, empty: 'No hay movimientos en el período.',
        columns: [{ key: 'date', label: 'Fecha', type: 'datetime' }, { key: 'type', label: 'Tipo' }, { key: 'sku', label: 'SKU' }, { key: 'name', label: 'Producto' }, { key: 'qty', label: 'Cant.', type: 'int' }, { key: 'prev', label: 'Stock ant.', type: 'int' }, { key: 'next', label: 'Stock nuevo', type: 'int' }, { key: 'ref', label: 'Referencia' }],
        rows: [...moves].sort((a, b) => a.ts - b.ts).map(m => ({ date: m.ts, type: String(m.type).replace(/_/g, ' '), sku: m.sku, name: m.productName, qty: m.quantity, prev: m.previousStock, next: m.newStock, ref: m.referenceId || '—' })) });
      break;
    }
    case 'clientes': {
      const ranking = customerRanking();
      sections.push({ kind: 'kpis', items: [kpi('Clientes registrados', customers.length), kpi('Clientes activos', customers.filter(c => (c.status || 'ACTIVE') === 'ACTIVE').length), kpi('Con compras en el período', ranking.length),
        kpi('Total comprado', round2(totalRevenue), 'money'), kpi('Corporativos', customers.filter(c => c.segment === 'Corporativo').length), kpi('Línea de crédito total', round2(sum(customers, c => c.creditLimit || 0)), 'money')] });
      sections.push({ kind: 'bars', title: 'Mejores 10 clientes por monto comprado', type: 'money', rows: ranking.slice(0, 10).map(r => ({ label: r.name, value: round2(r.total), extra: `${r.purchases} compras` })) });
      sections.push({ kind: 'table', title: 'Clientes por segmento', empty: 'Sin clientes.', columns: [{ key: 'seg', label: 'Segmento' }, { key: 'n', label: 'Clientes', type: 'int' }, { key: 'credit', label: 'Línea de crédito', type: 'money' }],
        rows: [...groupBy(customers, c => c.segment || 'Sin segmento').entries()].map(([seg, l]) => ({ seg, n: l.length, credit: round2(sum(l, c => c.creditLimit || 0)) })) });
      const stats = new Map(ranking.map(r => [r.name, r]));
      sections.push({ kind: 'table', title: 'Directorio de clientes', limit: 500, empty: 'No hay clientes registrados.',
        columns: [{ key: 'name', label: 'Cliente' }, { key: 'doc', label: 'Documento' }, { key: 'seg', label: 'Segmento' }, { key: 'email', label: 'Correo' }, { key: 'purchases', label: 'Compras', type: 'int' }, { key: 'total', label: 'Total comprado', type: 'money' }, { key: 'last', label: 'Última compra', type: 'date' }],
        rows: [...customers].map(c => { const r = stats.get(c.name); return { name: c.name, doc: c.docNumber ? `${c.docType} ${c.docNumber}` : '—', seg: c.segment, email: c.email || '—', purchases: r?.purchases || 0, total: round2(r?.total || 0), last: r?.last || null }; })
          .sort((a, b) => b.total - a.total) });
      break;
    }
    case 'vendedores': {
      const rows = sellerRows();
      sections.push({ kind: 'kpis', items: [kpi('Vendedores con ventas', rows.length), kpi('Ventas cobradas', sales.length), kpi('Ingresos', round2(totalRevenue), 'money'), kpi('Unidades vendidas', sum(sales, units))] });
      sections.push({ kind: 'bars', title: 'Ingresos por vendedor', type: 'money', rows: rows.map(r => ({ label: r.name, value: r.revenue, extra: `${r.sales} ventas` })) });
      sections.push({ kind: 'table', title: 'Detalle por vendedor', empty: 'Sin ventas en el período.', columns: [{ key: 'name', label: 'Vendedor' }, { key: 'sales', label: 'Ventas', type: 'int' }, { key: 'units', label: 'Unidades', type: 'int' }, { key: 'revenue', label: 'Ingresos', type: 'money' }, { key: 'share', label: 'Participación', type: 'pct' }],
        rows, totals: { name: 'TOTAL', sales: sales.length, units: sum(sales, units), revenue: round2(totalRevenue) } });
      break;
    }
    case 'cotizaciones': {
      const quotes = storage.get('quotes', []).filter(q => inRange(new Date(q.createdAt).getTime()));
      const conv = quotes.filter(q => q.status === 'CONVERTIDA'), open = quotes.filter(q => q.status !== 'CONVERTIDA');
      sections.push({ kind: 'kpis', items: [kpi('Cotizaciones emitidas', quotes.length), kpi('Convertidas en venta', conv.length), kpi('Abiertas', open.length),
        kpi('Monto abierto', round2(sum(open, q => q.totals.total)), 'money'), kpi('Monto convertido', round2(sum(conv, q => q.totals.total)), 'money'), kpi('Conversión', quotes.length ? conv.length / quotes.length * 100 : 0, 'pct')] });
      sections.push({ kind: 'table', title: 'Detalle de cotizaciones', limit: 500, empty: 'No hay cotizaciones en el período.',
        columns: [{ key: 'id', label: 'Folio' }, { key: 'date', label: 'Emisión', type: 'date' }, { key: 'customer', label: 'Cliente' }, { key: 'items', label: 'Ítems', type: 'int' }, { key: 'total', label: 'Total', type: 'money' }, { key: 'status', label: 'Estado' }, { key: 'sale', label: 'Venta' }],
        rows: [...quotes].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).map(q => ({ id: q.id, date: new Date(q.createdAt).getTime(), customer: q.customerName, items: q.items.length, total: q.totals.total, status: q.status === 'CONVERTIDA' ? 'Convertida' : 'Emitida', sale: q.convertedToSaleId || '—' })),
        totals: { customer: 'TOTAL', total: round2(sum(quotes, q => q.totals.total)) } });
      break;
    }
    case 'auditoria': {
      const logs = storage.get('audit_logs', []).filter(l => inRange(l.timestamp));
      sections.push({ kind: 'kpis', items: [kpi('Eventos registrados', logs.length), kpi('Usuarios distintos', new Set(logs.map(l => l.userId)).size), kpi('Inicios de sesión', logs.filter(l => l.action === 'LOGIN').length), kpi('Cobros aprobados', logs.filter(l => l.action === 'PAYMENT_APPROVED').length)] });
      sections.push({ kind: 'bars', title: 'Eventos por acción', type: 'int', rows: [...groupBy(logs, l => l.action).entries()].map(([label, l]) => ({ label, value: l.length })).sort((a, b) => b.value - a.value).slice(0, 12) });
      sections.push({ kind: 'table', title: 'Bitácora de operaciones', limit: 500, empty: 'No hay eventos en el período.',
        columns: [{ key: 'date', label: 'Fecha y hora', type: 'datetime' }, { key: 'user', label: 'Usuario' }, { key: 'role', label: 'Rol' }, { key: 'action', label: 'Acción' }, { key: 'entity', label: 'Entidad' }, { key: 'details', label: 'Detalle' }],
        rows: [...logs].sort((a, b) => a.timestamp - b.timestamp).map(l => ({ date: l.timestamp, user: l.userId, role: l.userRole, action: l.action, entity: l.entity, details: l.details })) });
      break;
    }
  }

  const now = new Date();
  return {
    type, title: def.title, subtitle, company: storage.get('company', {}), range, period: periodLabel(range),
    generatedAt: now.getTime(), generatedBy: { name: user.name || '—', role: user.role || '' },
    code: `REP-${type.slice(0, 3).toUpperCase()}-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`,
    sections
  };
}
