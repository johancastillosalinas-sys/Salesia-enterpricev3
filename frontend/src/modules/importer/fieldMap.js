/**
 * @file fieldMap.js
 * @description Campos que entiende el importador y reconocimiento automático de columnas
 * (por nombre, sin importar mayúsculas, tildes ni símbolos).
 */

export const FIELDS = [
  { key: 'tipo', label: 'Tipo de registro', hint: 'VENTA, COTIZACION, PRODUCTO o CLIENTE (si no hay, se asume VENTA)', aliases: ['tipo', 'tipo registro', 'tipo de registro', 'registro', 'record type', 'type'] },
  { key: 'documento', label: 'N° de venta / folio', hint: 'Agrupa varias filas en una misma venta', aliases: ['documento', 'n documento', 'nro documento', 'numero documento', 'folio', 'n venta', 'nro venta', 'id venta', 'venta', 'ticket', 'pedido', 'orden', 'order', 'order id', 'invoice', 'comprobante', 'num comprobante'] },
  { key: 'fecha', label: 'Fecha', hint: 'AAAA-MM-DD o DD/MM/AAAA (con hora opcional)', aliases: ['fecha', 'fecha venta', 'fecha emision', 'fecha de venta', 'fecha y hora', 'date', 'timestamp', 'created at'] },
  { key: 'clienteNombre', label: 'Cliente (nombre o razón social)', aliases: ['cliente', 'nombre cliente', 'cliente nombre', 'razon social', 'customer', 'customer name', 'nombre del cliente'] },
  { key: 'clienteDoc', label: 'Cliente: RUC o DNI', aliases: ['cliente doc', 'cliente documento', 'doc cliente', 'documento cliente', 'ruc', 'dni', 'ruc dni', 'dni ruc', 'ruc o dni', 'nro doc cliente', 'cliente ruc', 'cliente dni', 'cliente numero documento', 'customer id'] },
  { key: 'clienteTipoDoc', label: 'Cliente: tipo de documento', aliases: ['cliente tipo doc', 'tipo doc cliente', 'tipo documento cliente', 'tipo doc'] },
  { key: 'clienteSegmento', label: 'Cliente: segmento', aliases: ['segmento', 'cliente segmento', 'tipo cliente', 'segment'] },
  { key: 'clienteEmail', label: 'Cliente: correo', aliases: ['email', 'correo', 'cliente email', 'cliente correo', 'e mail', 'mail'] },
  { key: 'clienteTelefono', label: 'Cliente: teléfono', aliases: ['telefono', 'celular', 'cliente telefono', 'cliente celular', 'phone'] },
  { key: 'clienteCredito', label: 'Cliente: línea de crédito', aliases: ['linea credito', 'linea de credito', 'credito', 'cliente credito', 'credit limit'] },
  { key: 'vendedor', label: 'Vendedor', aliases: ['vendedor', 'seller', 'salesperson', 'vendedor nombre', 'asesor', 'ejecutivo'] },
  { key: 'metodoPago', label: 'Método de pago', hint: 'Efectivo, tarjeta, transferencia, Yape/Plin', aliases: ['metodo pago', 'metodo de pago', 'forma pago', 'forma de pago', 'pago', 'payment', 'payment method', 'medio pago'] },
  { key: 'sku', label: 'SKU / código del producto', aliases: ['sku', 'codigo', 'codigo producto', 'cod producto', 'producto codigo', 'code', 'item code', 'id producto', 'product id', 'product code'] },
  { key: 'producto', label: 'Producto', required: true, aliases: ['producto', 'nombre producto', 'descripcion', 'articulo', 'item', 'product', 'product name', 'descripcion producto', 'nombre del producto'] },
  { key: 'categoria', label: 'Categoría', aliases: ['categoria', 'category', 'rubro', 'linea', 'familia'] },
  { key: 'precio', label: 'Precio unitario (sin IGV)', required: true, aliases: ['precio', 'precio unitario', 'precio venta', 'p unitario', 'unit price', 'price', 'precio unit', 'pu', 'valor unitario'] },
  { key: 'costo', label: 'Costo unitario', aliases: ['costo', 'costo unitario', 'precio costo', 'cost', 'unit cost'] },
  { key: 'cantidad', label: 'Cantidad', hint: 'Sin esta columna, cada fila se importa como producto del catálogo', aliases: ['cantidad', 'cant', 'qty', 'quantity', 'unidades', 'uds'] },
  { key: 'descuento', label: 'Descuento % (cotizaciones)', aliases: ['descuento', 'descuento pct', 'descuento porcentaje', 'dscto', 'discount', 'desc'] },
  { key: 'stockInicial', label: 'Stock inicial', hint: 'Existencias antes de las ventas del archivo', aliases: ['stock inicial', 'stock', 'existencias', 'inventario inicial', 'stock actual', 'stock disponible'] },
  { key: 'stockMinimo', label: 'Stock mínimo', aliases: ['stock minimo', 'minimo', 'stock min', 'min stock', 'reorden'] },
  { key: 'unidad', label: 'Unidad', aliases: ['unidad', 'unidad medida', 'um', 'unit'] }
];

export function normalizeHeader(text) {
  return String(text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** @returns {Object<string, number>} campo → índice de columna */
export function autoMap(headers) {
  const norm = headers.map(normalizeHeader);
  const mapping = {};
  const used = new Set();
  for (const f of FIELDS) {
    const idx = norm.findIndex((h, i) => !used.has(i) && f.aliases.includes(h));
    if (idx >= 0) { mapping[f.key] = idx; used.add(idx); }
  }
  return mapping;
}
