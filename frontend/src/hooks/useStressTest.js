/**
 * @file useStressTest.js
 * @description Hook de orquestación para la Regla de Oro "1 vs 100 Registros".
 */

export class StressTestRunner {
  static async runSingle(api) {
    const products = await api.getProducts();
    const customers = await api.getCustomers();
    const targetProd = products.find(p => p.stock > 0);
    if (!targetProd || customers.length === 0) {
      throw new Error('El sistema está vacío. Importa un CSV (o crea un cliente y un producto con stock) antes de probar.');
    }

    const cmd = {
      autoPaid: true,
      customerId: customers[0].id,
      customerName: customers[0].name,
      items: [{
        productId: targetProd.id,
        name: targetProd.name,
        sku: targetProd.sku,
        price: targetProd.price,
        quantity: 1
      }],
      paymentMethod: 'TRANSFERENCIA'
    };

    const t0 = performance.now();
    const result = await api.createSale(cmd);
    const timeMs = Number((performance.now() - t0).toFixed(2));

    return { result, timeMs };
  }

  static async run100(api, onProgress) {
    const products = (await api.getProducts()).filter(p => p.stock > 0 && (p.status || 'ACTIVE') === 'ACTIVE');
    const customers = await api.getCustomers();
    if (products.length === 0 || customers.length === 0) {
      throw new Error('El sistema está vacío. Importa un CSV (o crea clientes y productos con stock) antes de probar.');
    }
    const t0 = performance.now();

    for (let i = 1; i <= 100; i++) {
      const prod = products[i % products.length];
      const cust = customers[i % customers.length];

      const cmd = {
        autoPaid: true,
        customerId: cust.id,
        customerName: cust.name,
        items: [{
          productId: prod.id,
          name: prod.name,
          sku: prod.sku,
          price: prod.price,
          quantity: 1
        }],
        paymentMethod: i % 2 === 0 ? 'TRANSFERENCIA' : 'TARJETA_CREDITO'
      };

      await api.createSale(cmd);
      if (typeof onProgress === 'function') {
        onProgress(i, 100);
      }
    }

    const totalTimeMs = Number((performance.now() - t0).toFixed(2));
    return {
      count: 100,
      totalTimeMs,
      avgPerRecordMs: Number((totalTimeMs / 100).toFixed(2))
    };
  }
}
