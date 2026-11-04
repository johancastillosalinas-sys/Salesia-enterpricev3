/**
 * @file csvImporter.js
 * @description Convierte las filas de un CSV en clientes, productos, categorías, vendedores,
 * ventas (cobradas y con comprobante), cotizaciones y movimientos de inventario.
 *  - buildPlan(): valida y calcula qué se va a crear (no escribe nada)
 *  - applyPlan(): escribe todo en LocalStorage con vuelta atrás si algo falla
 */

import { QuoteStatus } from '../../types/schemas.js';
import { validateRuc, validateDni, validateEmail } from '../../utils/validators.js';
import { sha256 } from '../../utils/hash.js';

const IGV = 0.18;
const MAX_ERRORS_SHOWN = 25;
const SEGMENTS = ['Corporativo', 'Pyme', 'Profesional', 'Personal'];

const norm = (t) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const digits = (t) => String(t ?? '').replace(/\D/g, '');

export function parseNumber(value) {
  let s = String(value ?? '').trim();
  if (!s) return NaN;
  s = s.replace(/[^\d.,-]/g, '');
  if (!s || s === '-') return NaN;
  const dot = s.lastIndexOf('.'), comma = s.lastIndexOf(',');
  if (dot > -1 && comma > -1) s = comma > dot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (comma > -1) s = (s.split(',').length === 2 && s.length - comma - 1 === 3) ? s.replace(',', '') : s.replace(',', '.');
  else if (dot > -1 && s.split('.').length > 2) s = s.replace(/\./g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}

/** @returns {number|null|undefined} ms; null = vacío; undefined = formato inválido */
export function parseDate(value) {
  const s = String(value ?? '').trim();
  if (!s) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  let y, mo, d, h, mi, se;
  if (m) { [, y, mo, d, h, mi, se] = m; }
  else {
    m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})(?:[T\s,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
    if (!m) return undefined;
    [, d, mo, y, h, mi, se] = m;
    if (y.length === 2) y = `20${y}`;
  }
  const date = new Date(+y, +mo - 1, +d, h === undefined ? 12 : +h, mi === undefined ? 0 : +mi, se === undefined ? 0 : +se);
  if (date.getFullYear() !== +y || date.getMonth() !== +mo - 1 || date.getDate() !== +d) return undefined;
  return date.getTime();
}

function recordType(text) {
  const t = norm(text);
  if (!t) return 'VENTA';
  if (t.includes('cot')) return 'COTIZACION';
  if (t.includes('prod') || t.includes('arti') || t.includes('catal')) return 'PRODUCTO';
  if (t.includes('client')) return 'CLIENTE';
  return 'VENTA';
}

function paymentId(text) {
  const t = norm(text);
  if (t.includes('yape') || t.includes('plin') || t.includes('billetera')) return 'YAPE_PLIN';
  if (t.includes('tarj') || t.includes('visa') || t.includes('master') || t.includes('credit') || t.includes('debit')) return 'TARJETA_CREDITO';
  if (t.includes('transf') || t.includes('banc') || t.includes('deposito')) return 'TRANSFERENCIA';
  return 'EFECTIVO';
}

function segmentOf(text, docType) {
  const t = norm(text);
  if (t.includes('corp')) return 'Corporativo';
  if (t.includes('pyme') || t.includes('mype') || t.includes('empres')) return 'Pyme';
  if (t.includes('prof')) return 'Profesional';
  if (t.includes('pers') || t.includes('natural')) return 'Personal';
  return docType === 'RUC' ? 'Pyme' : 'Personal';
}

// ====================================================================== plan
export function buildPlan(parsed, mapping) {
  const col = (row, key) => (mapping[key] === undefined ? '' : String(row[mapping[key]] ?? '').trim());
  const hasQty = mapping.cantidad !== undefined;
  const errors = [];
  const warnings = { docs: 0, stock: 0, dates: 0 };
  const customers = new Map();   // clave → cliente
  const products = new Map();    // clave → producto
  const sellers = new Map();
  const sales = new Map();       // folio → venta
  const quotes = new Map();
  const categories = new Set();
  let generatedSku = 0, valid = 0, lines = 0;

  const fail = (line, message) => { if (errors.length < 5000) errors.push({ line, message }); };

  const upsertCustomer = (row, when) => {
    const name = col(row, 'clienteNombre');
    if (!name) return null;
    const raw = digits(col(row, 'clienteDoc'));
    let docType = null, docNumber = '';
    if (raw.length === 11 && validateRuc(raw)) { docType = 'RUC'; docNumber = raw; }
    else if (raw.length === 8 && validateDni(raw)) { docType = 'DNI'; docNumber = raw; }
    else if (raw) warnings.docs++;
    const key = docNumber ? `doc:${docNumber}` : `name:${norm(name)}`;
    let c = customers.get(key);
    if (!c) {
      const email = col(row, 'clienteEmail');
      const credit = parseNumber(col(row, 'clienteCredito'));
      c = {
        key, name, docType: docType || 'DNI', docNumber,
        segment: segmentOf(col(row, 'clienteSegmento'), docType),
        email: validateEmail(email) ? email : '', phone: col(row, 'clienteTelefono'),
        creditLimit: Number.isFinite(credit) && credit >= 0 ? credit : 0, firstSeen: when
      };
      customers.set(key, c);
    } else if (when && when < c.firstSeen) c.firstSeen = when;
    return c;
  };

  const upsertProduct = (row, line) => {
    const name = col(row, 'producto');
    const price = parseNumber(col(row, 'precio'));
    if (name.length < 2) { fail(line, 'Falta el nombre del producto.'); return null; }
    if (!Number.isFinite(price) || price < 0) { fail(line, `Precio inválido: "${col(row, 'precio')}".`); return null; }
    let sku = col(row, 'sku').toUpperCase().replace(/\s+/g, '-');
    const key = sku ? `sku:${sku}` : `name:${norm(name)}`;
    let p = products.get(key);
    if (!p) {
      if (!sku) sku = `PRD-${String(++generatedSku).padStart(4, '0')}`;
      const cost = parseNumber(col(row, 'costo')), stock = parseNumber(col(row, 'stockInicial')), min = parseNumber(col(row, 'stockMinimo'));
      const categoryName = col(row, 'categoria') || 'General';
      categories.add(categoryName);
      p = {
        key, sku, name, categoryName, price, cost: Number.isFinite(cost) && cost >= 0 ? cost : 0,
        unit: (col(row, 'unidad') || 'UND').toUpperCase().slice(0, 8),
        minStock: Number.isFinite(min) && min >= 0 ? Math.round(min) : 5,
        initialStock: Number.isFinite(stock) && stock >= 0 ? Math.round(stock) : null, sold: 0
      };
      products.set(key, p);
    } else if (p.initialStock === null) {
      const stock = parseNumber(col(row, 'stockInicial'));
      if (Number.isFinite(stock) && stock >= 0) p.initialStock = Math.round(stock);
    }
    return { product: p, price };
  };

  parsed.rows.forEach((row, i) => {
    const line = i + 2;
    let type = recordType(col(row, 'tipo'));
    if (!hasQty && type === 'VENTA') type = 'PRODUCTO';

    const date = parseDate(col(row, 'fecha'));
    if (date === undefined && (type === 'VENTA' || type === 'COTIZACION')) { fail(line, `Fecha inválida: "${col(row, 'fecha')}".`); return; }
    const when = date ?? Date.now();

    if (type === 'CLIENTE') {
      if (!col(row, 'clienteNombre')) { fail(line, 'Falta el nombre del cliente.'); return; }
      upsertCustomer(row, when); valid++; return;
    }
    const found = upsertProduct(row, line);
    if (!found) return;
    if (type === 'PRODUCTO') { valid++; return; }

    const qty = parseNumber(col(row, 'cantidad'));
    if (!Number.isFinite(qty) || qty <= 0) { fail(line, `Cantidad inválida: "${col(row, 'cantidad')}".`); return; }

    const bucket = type === 'COTIZACION' ? quotes : sales;
    const ref = col(row, 'documento') || `__fila_${line}`;
    const groupKey = `${type}:${ref}`;
    let doc = bucket.get(groupKey);
    if (!doc) {
      const customer = upsertCustomer(row, when);
      const sellerName = col(row, 'vendedor');
      if (sellerName && !sellers.has(norm(sellerName))) sellers.set(norm(sellerName), { name: sellerName });
      doc = { ref: col(row, 'documento'), when, order: line, customerKey: customer?.key || null, customerName: customer?.name || 'Cliente varios',
        sellerName: sellerName || 'Sin vendedor', payment: paymentId(col(row, 'metodoPago')), items: [] };
      bucket.set(groupKey, doc);
    }
    const discount = Math.min(30, Math.max(0, parseNumber(col(row, 'descuento')) || 0));
    doc.items.push({ productKey: found.product.key, price: found.price, quantity: Math.round(qty), discountPct: discount });
    if (type === 'VENTA') found.product.sold += Math.round(qty);
    lines++; valid++;
  });

  return {
    totalRows: parsed.rows.length, valid, errors, errorCount: errors.length, warnings, lines,
    customers, products, sellers, categories, sales: [...sales.values()], quotes: [...quotes.values()],
    stats: { customers: customers.size, products: products.size, categories: categories.size, sellers: sellers.size, sales: sales.size, quotes: quotes.size }
  };
}

// ====================================================================== aplicar
const COLLECTIONS = ['customers', 'products', 'categories', 'sellers', 'sales', 'quotes', 'inventory_movements', 'doc_series'];
const nextNum = (list, prefix) => {
  const max = list.reduce((m, x) => Math.max(m, parseInt(String(x.id).replace(/\D/g, ''), 10) || 0), 0);
  let n = max;
  return () => `${prefix}-${String(++n).padStart(3, '0')}`;
};

/**
 * @param {object} app Aplicación (storage, secuencias, motor de cotizaciones)
 * @param {'replace'|'merge'} mode
 */
export function applyPlan(app, plan, mode, fileName = 'archivo.csv') {
  const storage = app.state.storage;
  const backup = Object.fromEntries(COLLECTIONS.map(k => [k, JSON.parse(JSON.stringify(storage.get(k, k === 'doc_series' ? { BOLETA: 0, FACTURA: 0 } : []) ))]));
  const seqBackup = { tx: app.state.seqTransactions.peek(), q: app.state.seqQuotes.peek() };

  try {
    const replace = mode === 'replace';
    const base = (k) => (replace ? (k === 'doc_series' ? { BOLETA: 0, FACTURA: 0 } : []) : backup[k]);
    if (replace) { app.state.seqTransactions.reset(0); app.state.seqQuotes.reset(0); }

    // ---- categorías
    const categories = [...base('categories')];
    const catByName = new Map(categories.map(c => [norm(c.name), c]));
    const newCatId = nextNum(categories, 'CAT');
    for (const name of plan.categories) {
      if (!catByName.has(norm(name))) { const c = { id: newCatId(), name, description: '' }; categories.push(c); catByName.set(norm(name), c); }
    }

    // ---- clientes
    const customers = [...base('customers')];
    const custByDoc = new Map(customers.filter(c => c.docNumber).map(c => [`doc:${c.docNumber}`, c]));
    const custByName = new Map(customers.map(c => [`name:${norm(c.name)}`, c]));
    const newCustId = nextNum(customers, 'CUST');
    const custIdByKey = new Map();
    for (const c of plan.customers.values()) {
      let existing = custByDoc.get(c.key) || custByName.get(c.key) || custByName.get(`name:${norm(c.name)}`);
      if (!existing) {
        existing = { id: newCustId(), name: c.name, docType: c.docType, docNumber: c.docNumber, email: c.email, phone: c.phone,
          segment: c.segment, creditLimit: c.creditLimit, status: 'ACTIVE', registeredAt: new Date(c.firstSeen).toISOString() };
        customers.push(existing);
      }
      custIdByKey.set(c.key, existing);
    }

    // ---- vendedores
    const sellers = [...base('sellers')];
    const sellerByName = new Map(sellers.map(s => [norm(s.name), s]));
    const newSellerId = nextNum(sellers, 'SELL');
    for (const s of plan.sellers.values()) {
      if (!sellerByName.has(norm(s.name))) {
        const rec = { id: newSellerId(), name: s.name, email: `${norm(s.name).replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '')}@salesia.pe` };
        sellers.push(rec); sellerByName.set(norm(s.name), rec);
      }
    }

    // ---- productos (stock inicial = lo indicado, o lo vendido + 10 si no se indicó)
    const products = [...base('products')];
    const prodBySku = new Map(products.map(p => [String(p.sku).toUpperCase(), p]));
    const newProdId = nextNum(products, 'PROD');
    const prodByKey = new Map();
    const startStock = new Map();
    const movements = [...base('inventory_movements')];
    const firstDate = Math.min(Date.now(), ...plan.sales.map(s => s.when));
    let movSeq = 0;
    const movId = () => `MOV-IMP-${Date.now()}-${++movSeq}`;

    for (const p of plan.products.values()) {
      let rec = prodBySku.get(p.sku.toUpperCase());
      if (!rec) {
        const cat = catByName.get(norm(p.categoryName));
        const initial = p.initialStock ?? (p.sold + 10);
        rec = { id: newProdId(), sku: p.sku, name: p.name, unit: p.unit, price: p.price, cost: p.cost, minStock: p.minStock,
          categoryId: cat.id, categoryName: cat.name, stock: initial, status: 'ACTIVE' };
        products.push(rec); prodBySku.set(p.sku.toUpperCase(), rec);
        if (initial > 0) {
          movements.unshift({ id: movId(), productId: rec.id, sku: rec.sku, productName: rec.name, type: 'ENTRADA_INICIAL', quantity: initial,
            previousStock: 0, newStock: initial, referenceId: 'IMPORT_CSV', timestamp: firstDate - 60000, dateFormatted: new Date(firstDate - 60000).toLocaleString('es-PE') });
        }
      }
      prodByKey.set(p.key, rec);
      startStock.set(rec.id, rec.stock);
    }

    // ---- ventas (en orden cronológico: cada una descuenta stock, se cobra y se factura)
    const sales = [...base('sales')];
    const series = { ...base('doc_series') };
    const knownRefs = new Set(sales.filter(x => x.externalRef).map(x => x.externalRef));
    let skippedDuplicates = 0;
    const salesSorted = [...plan.sales].filter(x => {
      if (!replace && x.ref && knownRefs.has(x.ref)) { skippedDuplicates++; return false; }
      return true;
    }).sort((a, b) => a.when - b.when || a.order - b.order);
    let stockClamped = 0;
    for (const s of salesSorted) {
      const { formattedId, seqNumber } = app.state.seqTransactions.next();
      const items = s.items.map(it => {
        const p = prodByKey.get(it.productKey);
        return { productId: p.id, name: p.name, sku: p.sku, price: it.price, quantity: it.quantity, subtotal: Number((it.price * it.quantity).toFixed(2)) };
      });
      const subtotal = items.reduce((a, it) => a + it.price * it.quantity, 0);
      const tax = subtotal * IGV;
      const total = subtotal + tax;
      const cust = s.customerKey ? custIdByKey.get(s.customerKey) : null;
      const seller = sellerByName.get(norm(s.sellerName));
      const isRuc = cust?.docType === 'RUC' && cust.docNumber;
      const type = isRuc ? 'FACTURA' : 'BOLETA';
      series[type] = (series[type] || 0) + 1;
      const fullNumber = `${type === 'FACTURA' ? 'F001' : 'B001'}-${String(series[type]).padStart(8, '0')}`;

      for (const it of items) {
        const p = products.find(x => x.id === it.productId);
        const prev = p.stock;
        const next = Math.max(0, prev - it.quantity);
        if (prev < it.quantity) stockClamped++;
        p.stock = next;
        movements.unshift({ id: movId(), productId: p.id, sku: p.sku, productName: p.name, type: 'SALIDA_VENTA', quantity: prev - next,
          previousStock: prev, newStock: next, referenceId: formattedId, timestamp: s.when, dateFormatted: new Date(s.when).toLocaleString('es-PE') });
      }

      sales.unshift({
        id: formattedId, sequenceNumber: seqNumber, customerId: cust?.id || null, customerName: cust?.name || 'Cliente varios',
        sellerId: seller?.id || null, sellerName: s.sellerName, items,
        paymentMethod: s.payment,
        payment: { method: s.payment, status: 'APROBADO', reference: `IMP-${s.ref || seqNumber}`, amount: Number(total.toFixed(2)), paidAt: s.when, imported: true },
        invoice: {
          type, series: type === 'FACTURA' ? 'F001' : 'B001', number: series[type], fullNumber, issuedAt: s.when,
          customer: { docType: cust?.docNumber ? cust.docType : 'SIN', docNumber: cust?.docNumber || '', name: cust?.name || 'CLIENTE VARIOS', address: '' },
          hash: btoa(sha256(`${fullNumber}|${total}|${s.when}`)).slice(0, 28)
        },
        totals: { subtotal: Number(subtotal.toFixed(2)), taxAmount: Number(tax.toFixed(2)), total: Number(total.toFixed(2)) },
        originQuoteId: null, timestamp: s.when, dateFormatted: new Date(s.when).toLocaleString('es-PE'),
        status: 'COMPLETADO', importedFrom: fileName, externalRef: s.ref || null
      });
    }
    sales.sort((a, b) => b.timestamp - a.timestamp || b.sequenceNumber - a.sequenceNumber);

    // ---- cotizaciones
    const quotes = [...base('quotes')];
    const knownQuoteRefs = new Set(quotes.filter(x => x.externalRef).map(x => x.externalRef));
    const quotesSorted = [...plan.quotes].filter(x => {
      if (!replace && x.ref && knownQuoteRefs.has(x.ref)) { skippedDuplicates++; return false; }
      return true;
    }).sort((a, b) => a.when - b.when || a.order - b.order);
    for (const q of quotesSorted) {
      const { formattedId, seqNumber } = app.state.seqQuotes.next();
      const cust = q.customerKey ? custIdByKey.get(q.customerKey) : null;
      const items = q.items.map(it => {
        const p = prodByKey.get(it.productKey);
        return { productId: p.id, name: p.name, sku: p.sku, price: it.price, quantity: it.quantity, discountPct: it.discountPct,
          subtotal: Number(((it.price * it.quantity) * (1 - it.discountPct / 100)).toFixed(2)) };
      });
      const totals = app.state.quoteEngine.constructor.calculateTotals(items, 0);
      quotes.unshift({
        id: formattedId, sequenceNumber: seqNumber, customerId: cust?.id || null, customerName: cust?.name || 'Cliente varios',
        items, discountPct: 0, totals, status: QuoteStatus.ISSUED, notes: 'Importada desde CSV', validityDays: 15,
        createdAt: new Date(q.when).toISOString(), expiresAt: new Date(q.when + 15 * 86400000).toISOString(), convertedToSaleId: null,
        externalRef: q.ref || null
      });
    }

    const next = { customers, products, categories, sellers, sales, quotes, inventory_movements: movements.slice(0, 2000), doc_series: series };
    for (const [k, v] of Object.entries(next)) {
      if (storage.set(k, v) === false) throw new Error('No hay espacio en el navegador (LocalStorage ≈ 5 MB). Usa un archivo más pequeño.');
    }
    app.state.quoteEngine.reload();
    app.state.api.logAudit('IMPORT_CSV', 'system', `Importación de ${fileName}: ${plan.stats.customers} clientes, ${plan.stats.products} productos, ${plan.stats.sales} ventas, ${plan.stats.quotes} cotizaciones (${replace ? 'reemplazando datos' : 'agregando a lo existente'})`);
    return { ...plan.stats, sales: salesSorted.length, quotes: quotesSorted.length, stockClamped, skippedDuplicates, movements: movements.length };
  } catch (err) {
    for (const [k, v] of Object.entries(backup)) storage.set(k, v);
    app.state.seqTransactions.reset(seqBackup.tx);
    app.state.seqQuotes.reset(seqBackup.q);
    app.state.quoteEngine.reload();
    throw err;
  }
}
