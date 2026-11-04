/**
 * @file api.js
 * @description Capa API empresarial simulada en tiempo real conforme a la Sección 16 del Plan de Desarrollo:
 * - POST /auth/login
 * - GET/POST /customers
 * - GET /products
 * - GET/POST /sales
 * - GET /sellers
 * - GET /dashboard/summary
 * - GET /reports
 * - GET /audit-logs
 */

import { validateRuc, validateDni, validateEmail } from '../utils/validators.js';

export class SalesIaApi {
  #storage;
  #queue;
  #seqTransactions;
  #eventBus;

  constructor(storage, queue, seqTransactions, eventBus) {
    this.#storage = storage;
    this.#queue = queue;
    this.#seqTransactions = seqTransactions;
    this.#eventBus = eventBus;
  }

  #logAudit(action, entity, details) {
    const logs = this.#storage.get('audit_logs', []);
    const user = this.#storage.get('currentUser', { username: 'system' });
    const newLog = {
      id: `AUDIT-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      userId: user.username || 'admin',
      userRole: user.role || 'ADMINISTRADOR',
      action,
      entity,
      details,
      timestamp: Date.now(),
      dateFormatted: new Date().toLocaleString('es-PE')
    };
    logs.unshift(newLog);
    this.#storage.set('audit_logs', logs.slice(0, 500));
  }

  /** Registro de auditoría para otros módulos (login, cobros, importaciones...). */
  logAudit(action, entity, details) {
    this.#logAudit(action, entity, details);
  }

  // 1. /auth/login
  async login(username, role = null) {
    const users = this.#storage.get('users', []);
    let user = users.find(u => u.username === username);
    if (!user && role) {
      user = users.find(u => u.role === role);
    }
    if (user) {
      this.#storage.set('currentUser', user);
      this.#logAudit('LOGIN', 'users', `Inicio de sesión exitoso como ${user.role} (${user.name})`);
      return { success: true, user, token: `mock-jwt-${Date.now()}` };
    }
    return { success: false, message: 'Usuario no encontrado' };
  }

  async getCurrentUser() {
    return this.#storage.get('currentUser', null);
  }

  // 2. /customers
  async getCustomers() {
    return this.#storage.get('customers', []);
  }

    #cleanCustomer(data, excludeId = null) {
    const name = String(data.name || '').trim();
    const docType = String(data.docType || '').trim().toUpperCase();
    const docNumber = String(data.docNumber || '').trim();
    const email = String(data.email || '').trim();
    const phone = String(data.phone || '').trim();
    const segment = String(data.segment || 'Pyme').trim();
    const creditRaw = data.creditLimit === '' || data.creditLimit == null ? 0 : Number(data.creditLimit);

    if (name.length < 3) throw new Error('El nombre o razón social debe tener al menos 3 caracteres.');
    if (!['RUC', 'DNI'].includes(docType)) throw new Error('Selecciona un tipo de documento válido (RUC o DNI).');
    if (docType === 'RUC' && !validateRuc(docNumber)) throw new Error('El RUC debe tener 11 dígitos y empezar con 10 o 20.');
    if (docType === 'DNI' && !validateDni(docNumber)) throw new Error('El DNI debe tener exactamente 8 dígitos.');
    if (email && !validateEmail(email)) throw new Error('El correo electrónico no tiene un formato válido.');
    if (!Number.isFinite(creditRaw) || creditRaw < 0) throw new Error('La línea de crédito debe ser un número mayor o igual a 0.');

    const customers = this.#storage.get('customers', []);
    const dup = customers.find(c => c.id !== excludeId && c.docType === docType && c.docNumber === docNumber);
    if (dup) throw new Error(`Ya existe un cliente con ${docType} ${docNumber}: ${dup.name}.`);

    return { name, docType, docNumber, email, phone, segment, creditLimit: creditRaw };
  }

  async createCustomer(customerData) {
    const clean = this.#cleanCustomer(customerData);
    const customers = [...this.#storage.get('customers', [])];
    const maxNum = customers.reduce((m, c) => {
      const n = parseInt(String(c.id).replace(/\D/g, ''), 10);
      return Number.isFinite(n) && n > m ? n : m;
    }, 0);
    const newCust = {
      id: `CUST-${String(maxNum + 1).padStart(3, '0')}`,
      ...clean,
      status: 'ACTIVE',
      registeredAt: new Date().toISOString()
    };
    customers.push(newCust);
    this.#storage.set('customers', customers);
    this.#logAudit('CREATE_CUSTOMER', 'customers', `Cliente creado: ${newCust.name} (${newCust.docType} ${newCust.docNumber})`);
    return newCust;
  }

  async updateCustomer(id, customerData) {
    const customers = [...this.#storage.get('customers', [])];
    const idx = customers.findIndex(c => c.id === id);
    if (idx === -1) throw new Error('El cliente no existe.');
    const clean = this.#cleanCustomer(customerData, id);
    customers[idx] = { ...customers[idx], ...clean, updatedAt: new Date().toISOString() };
    this.#storage.set('customers', customers);
    this.#logAudit('UPDATE_CUSTOMER', 'customers', `Cliente actualizado: ${customers[idx].name} (${id})`);
    return customers[idx];
  }

  async setCustomerStatus(id, status) {
    if (!['ACTIVE', 'INACTIVE'].includes(status)) throw new Error('Estado no válido.');
    const customers = [...this.#storage.get('customers', [])];
    const idx = customers.findIndex(c => c.id === id);
    if (idx === -1) throw new Error('El cliente no existe.');
    customers[idx] = { ...customers[idx], status, updatedAt: new Date().toISOString() };
    this.#storage.set('customers', customers);
    this.#logAudit(
      status === 'ACTIVE' ? 'ACTIVATE_CUSTOMER' : 'DEACTIVATE_CUSTOMER',
      'customers',
      `Cliente ${status === 'ACTIVE' ? 'reactivado' : 'desactivado'}: ${customers[idx].name} (${id})`
    );
    return customers[idx];
  }

  // 3. /products
  async getProducts() {
    return this.#storage.get('products', []);
  }

    #cleanProduct(data, excludeId = null) {
    const sku = String(data.sku || '').trim().toUpperCase();
    const name = String(data.name || '').trim();
    const unit = String(data.unit || 'UND').trim().toUpperCase();
    const price = Number(data.price);
    const cost = data.cost === '' || data.cost == null ? 0 : Number(data.cost);
    const minStock = data.minStock === '' || data.minStock == null ? 0 : Number(data.minStock);

    if (!/^[A-Z0-9][A-Z0-9-]{2,29}$/.test(sku)) throw new Error('El SKU debe tener entre 3 y 30 caracteres (letras, números y guiones).');
    if (name.length < 3) throw new Error('La descripción debe tener al menos 3 caracteres.');
    if (!Number.isFinite(price) || price <= 0) throw new Error('El precio de venta debe ser mayor a 0.');
    if (!Number.isFinite(cost) || cost < 0) throw new Error('El costo debe ser un número mayor o igual a 0.');
    if (!Number.isInteger(minStock) || minStock < 0) throw new Error('El stock mínimo debe ser un entero mayor o igual a 0.');

    // La categoría se escribe a mano: si no existe todavía, se crea al guardar el producto.
    const categories = this.#storage.get('categories', []);
    const typed = String(data.categoryName || '').trim();
    let category = categories.find(c => c.id === data.categoryId)
      || categories.find(c => c.name.toLowerCase() === typed.toLowerCase());
    if (!category) {
      if (typed.length < 2) throw new Error('Escribe la categoría del producto.');
      const maxNum = categories.reduce((m, c) => Math.max(m, parseInt(String(c.id).replace(/\D/g, ''), 10) || 0), 0);
      category = { id: `CAT-${String(maxNum + 1).padStart(3, '0')}`, name: typed, description: '' };
      this.#storage.set('categories', [...categories, category]);
    }

    const dup = this.#storage.get('products', []).find(p => p.id !== excludeId && String(p.sku).toUpperCase() === sku);
    if (dup) throw new Error(`Ya existe el SKU ${sku}: ${dup.name}.`);

    return { sku, name, unit, price, cost, minStock, categoryId: category.id, categoryName: category.name };
  }

  async createProduct(productData) {
    const clean = this.#cleanProduct(productData);
    const stock = productData.stock === '' || productData.stock == null ? 0 : Number(productData.stock);
    if (!Number.isInteger(stock) || stock < 0) throw new Error('El stock inicial debe ser un entero mayor o igual a 0.');

    const products = [...this.#storage.get('products', [])];
    const maxNum = products.reduce((m, p) => {
      const n = parseInt(String(p.id).replace(/\D/g, ''), 10);
      return Number.isFinite(n) && n > m ? n : m;
    }, 0);
    const newProd = { id: `PROD-${String(maxNum + 1).padStart(3, '0')}`, ...clean, stock, status: 'ACTIVE' };
    products.push(newProd);
    this.#storage.set('products', products);

    if (stock > 0) {
      const movs = this.#storage.get('inventory_movements', []);
      movs.unshift({
        id: `MOV-${Date.now()}`,
        productId: newProd.id,
        sku: newProd.sku,
        productName: newProd.name,
        type: 'ENTRADA_INICIAL',
        quantity: stock,
        previousStock: 0,
        newStock: stock,
        referenceId: 'ALTA_PRODUCTO',
        dateFormatted: new Date().toLocaleString('es-PE')
      });
        this.#storage.set('inventory_movements', movs.slice(0, 2000));
    }
    this.#logAudit('CREATE_PRODUCT', 'products', `Producto creado: ${newProd.name} (${newProd.sku})`);
    return newProd;
  }

  // No modifica el stock: las existencias solo cambian desde Inventario y Ventas.
  async updateProduct(id, productData) {
    const products = [...this.#storage.get('products', [])];
    const idx = products.findIndex(p => p.id === id);
    if (idx === -1) throw new Error('El producto no existe.');
    const clean = this.#cleanProduct(productData, id);
    products[idx] = { ...products[idx], ...clean };
    this.#storage.set('products', products);
    this.#logAudit('UPDATE_PRODUCT', 'products', `Producto actualizado: ${products[idx].name} (${products[idx].sku})`);
    return products[idx];
  }

  async setProductStatus(id, status) {
    if (!['ACTIVE', 'INACTIVE'].includes(status)) throw new Error('Estado no válido.');
    const products = [...this.#storage.get('products', [])];
    const idx = products.findIndex(p => p.id === id);
    if (idx === -1) throw new Error('El producto no existe.');
    products[idx] = { ...products[idx], status };
    this.#storage.set('products', products);
    this.#logAudit(
      status === 'ACTIVE' ? 'ACTIVATE_PRODUCT' : 'DEACTIVATE_PRODUCT',
      'products',
      `Producto ${status === 'ACTIVE' ? 'reactivado' : 'desactivado'}: ${products[idx].name} (${products[idx].sku})`
    );
    return products[idx];
  }

  // Reabastecimiento manual: actualiza el stock, deja el movimiento de inventario y la auditoría.
  async restockProduct(productId, quantity, reference = 'MANUAL') {
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty <= 0) throw new Error('La cantidad a reabastecer debe ser un entero mayor a 0.');

    const products = [...this.#storage.get('products', [])];
    const idx = products.findIndex(p => p.id === productId);
    if (idx === -1) throw new Error('El producto no existe.');

    const prev = products[idx].stock;
    products[idx] = { ...products[idx], stock: prev + qty };
    this.#storage.set('products', products);

    const timestamp = Date.now();
    const movs = this.#storage.get('inventory_movements', []);
    movs.unshift({
      id: `MOV-${timestamp}-${Math.random().toString(36).substring(2, 6)}`,
      productId: products[idx].id,
      sku: products[idx].sku,
      productName: products[idx].name,
      type: 'ENTRADA_REABASTECIMIENTO',
      quantity: qty,
      previousStock: prev,
      newStock: prev + qty,
      referenceId: reference,
      timestamp,
      dateFormatted: new Date(timestamp).toLocaleString('es-PE')
    });
    this.#storage.set('inventory_movements', movs.slice(0, 300));

    this.#logAudit('RESTOCK_PRODUCT', 'inventory', `Reabastecimiento: ${products[idx].name} (${products[idx].sku}) +${qty} uds. (${prev} → ${prev + qty})`);
    return products[idx];
  }

  // 4. /sellers
  async getSellers() {
    return this.#storage.get('sellers', []);
  }

  // 5. /sales
  async getSales() {
    return this.#storage.get('sales', []);
  }

  async createSale(saleCommand) {
    return this.#queue.enqueue(saleCommand, async (cmd) => {
      const products = this.#storage.get('products', []);
      const sales = this.#storage.get('sales', []);
      const movements = this.#storage.get('inventory_movements', []);

            // El cliente no puede estar dado de baja (baja lógica, RF-03)
      const customer = this.#storage.get('customers', []).find(c => c.id === cmd.customerId);
      if (customer && (customer.status || 'ACTIVE') !== 'ACTIVE') {
        throw new Error(`El cliente "${customer.name}" está desactivado. Reactívalo para poder venderle.`);
      }

      // Verificación de productos activos y existencias
      for (const item of cmd.items) {
        const p = products.find(prod => prod.id === item.productId);
        if (!p) throw new Error(`El producto ${item.productId} no existe en catálogo.`);
        if ((p.status || 'ACTIVE') !== 'ACTIVE') {
          throw new Error(`El producto "${p.name}" está desactivado y no se puede vender.`);
        }
        if (p.stock < item.quantity) {
          throw new Error(`Stock insuficiente para "${p.name}". Solicitado: ${item.quantity}, Disponible: ${p.stock}`);
        }
      }

      // Folio correlativo consecutivo
      const { formattedId, seqNumber, timestamp } = this.#seqTransactions.next();

      // Descuento atómico de existencias y registro de movimientos
      for (const item of cmd.items) {
        const p = products.find(prod => prod.id === item.productId);
        const prev = p.stock;
        p.stock -= item.quantity;

        movements.unshift({
          id: `MOV-${timestamp}-${Math.random().toString(36).substring(2, 6)}`,
          productId: p.id,
          sku: p.sku,
          productName: p.name,
          type: 'SALIDA_VENTA',
          quantity: item.quantity,
          previousStock: prev,
          newStock: p.stock,
          referenceId: formattedId,
          timestamp,
          dateFormatted: new Date(timestamp).toLocaleString('es-PE')
        });
      }
      this.#storage.set('products', products);
      this.#storage.set('inventory_movements', movements.slice(0, 2000));

      // Cálculo de totales
      const subtotal = cmd.items.reduce((acc, it) => acc + (it.price * it.quantity), 0);
      const tax = subtotal * 0.18;
      const total = subtotal + tax;

      const user = this.#storage.get('currentUser', {});
      const sellerName = cmd.sellerName || user.name || 'Sin vendedor';
      const sellerId = cmd.sellerId || user.id || null;

      const saleRecord = {
        id: formattedId,
        sequenceNumber: seqNumber,
        customerId: cmd.customerId || null,
        customerName: cmd.customerName || 'Cliente varios',
        sellerId,
        sellerName,
        items: cmd.items.map(it => ({
          productId: it.productId,
          name: it.name || it.productName,
          sku: it.sku || '',
          price: Number(it.price),
          quantity: Number(it.quantity),
          subtotal: Number((it.price * it.quantity).toFixed(2))
        })),
        // La venta nace "pendiente de cobro"; el pago y el comprobante se completan en Facturación.
        // autoPaid = solo para pruebas de carga.
        paymentMethod: cmd.autoPaid ? (cmd.paymentMethod || 'EFECTIVO') : null,
        payment: cmd.autoPaid ? { method: cmd.paymentMethod || 'EFECTIVO', status: 'APROBADO', reference: 'AUTO', amount: Number(total.toFixed(2)), paidAt: timestamp } : null,
        invoice: null,
        totals: {
          subtotal: Number(subtotal.toFixed(2)),
          taxAmount: Number(tax.toFixed(2)),
          total: Number(total.toFixed(2))
        },
        originQuoteId: cmd.originQuoteId || null,
        timestamp,
        dateFormatted: new Date(timestamp).toLocaleString('es-PE'),
        status: cmd.autoPaid ? 'PAGADA' : 'PENDIENTE_COBRO'
      };

      sales.unshift(saleRecord);
      this.#storage.set('sales', sales);

      this.#logAudit('TRANSACTION_COMMITTED', 'sales', `Venta ${formattedId} registrada por S/ ${total.toFixed(2)} (${cmd.customerName}) — pendiente de cobro`);

      return saleRecord;
    });
  }

  /** Anula una venta que aún no se cobró y devuelve el stock reservado. */
  async cancelSale(saleId) {
    return this.#queue.enqueue({ saleId }, async () => {
      const sales = this.#storage.get('sales', []);
      const sale = sales.find(s => s.id === saleId);
      if (!sale) throw new Error('La venta no existe.');
      if (sale.status !== 'PENDIENTE_COBRO') throw new Error('Solo se pueden anular ventas pendientes de cobro.');

      const products = this.#storage.get('products', []);
      const movements = this.#storage.get('inventory_movements', []);
      const timestamp = Date.now();
      for (const it of sale.items) {
        const p = products.find(x => x.id === it.productId);
        if (!p) continue;
        const prev = p.stock;
        p.stock += it.quantity;
        movements.unshift({
          id: `MOV-${timestamp}-${Math.random().toString(36).substring(2, 6)}`, productId: p.id, sku: p.sku, productName: p.name,
          type: 'ENTRADA_ANULACION', quantity: it.quantity, previousStock: prev, newStock: p.stock,
          referenceId: sale.id, timestamp, dateFormatted: new Date(timestamp).toLocaleString('es-PE')
        });
      }
      sale.status = 'ANULADA';
      sale.cancelledAt = timestamp;
      this.#storage.set('products', products);
      this.#storage.set('inventory_movements', movements.slice(0, 2000));
      this.#storage.set('sales', sales);
      this.#logAudit('SALE_CANCELLED', 'sales', `Venta ${sale.id} anulada antes del cobro; stock devuelto`);
      return sale;
    });
  }

  // 6. /dashboard/summary
  async getDashboardSummary() {
    const sales = this.#storage.get('sales', []);
    const products = this.#storage.get('products', []);
    const amounts = sales.map(s => s.totals.total);

    const totalRevenue = amounts.reduce((a, b) => a + b, 0);

    return {
      totalSales: sales.length,
      totalRevenue: Number(totalRevenue.toFixed(2)),
      totalStock: products.reduce((acc, p) => acc + p.stock, 0),
      recentSales: sales.slice(0, 5)
    };
  }

  // 13. /reports
  async getReportsData() {
    const sales = this.#storage.get('sales', []);
    const products = this.#storage.get('products', []);
    const sellers = this.#storage.get('sellers', []);
    const movements = this.#storage.get('inventory_movements', []);

    // Desglose por vendedor
    const salesBySeller = {};
    for (const s of sales) {
      const sName = s.sellerName || 'Valeria Quispe';
      salesBySeller[sName] = (salesBySeller[sName] || 0) + s.totals.total;
    }

    // Desglose por categoría
    const salesByCategory = {};
    for (const s of sales) {
      for (const it of s.items || []) {
        const prod = products.find(p => p.id === it.productId);
        const cat = prod?.categoryName || 'General';
        salesByCategory[cat] = (salesByCategory[cat] || 0) + (it.price * it.quantity);
      }
    }

    return {
      sales,
      products,
      sellers,
      movements,
      salesBySeller,
      salesByCategory
    };
  }

  // 14. /audit-logs
  async getAuditLogs() {
    return this.#storage.get('audit_logs', []);
  }

  async getMovements() {
    return this.#storage.get('inventory_movements', []);
  }
}
