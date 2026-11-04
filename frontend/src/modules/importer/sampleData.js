/**
 * @file sampleData.js
 * @description CSV de ejemplo (con datos de negocio verosímiles) y plantilla vacía.
 * El ejemplo es determinista: mismo resultado cada vez, con fechas de los últimos 90 días.
 */

import { toCsv } from './csvParser.js';

export const CSV_HEADERS = ['tipo', 'documento', 'fecha', 'cliente_nombre', 'cliente_tipo_doc', 'cliente_doc', 'cliente_segmento', 'cliente_email',
  'cliente_telefono', 'vendedor', 'metodo_pago', 'sku', 'producto', 'categoria', 'precio', 'costo', 'cantidad', 'descuento_pct', 'stock_inicial', 'stock_minimo'];

export function templateCsv() {
  const rows = [
    ['PRODUCTO', '', '', '', '', '', '', '', '', '', '', 'LAP-001', 'Laptop Pro 14"', 'Laptops', 3200, 2500, '', '', 20, 5],
    ['CLIENTE', '', '', 'Distribuidora Andina S.A.C.', 'RUC', '20512345678', 'Pyme', 'compras@andina.pe', '987654321', '', '', '', '', '', '', '', '', '', '', ''],
    ['VENTA', 'V-0001', '2026-01-15 10:30', 'Distribuidora Andina S.A.C.', 'RUC', '20512345678', 'Pyme', '', '', 'Valeria Quispe', 'Transferencia', 'LAP-001', 'Laptop Pro 14"', 'Laptops', 3200, 2500, 2, '', '', ''],
    ['COTIZACION', 'C-0001', '2026-01-20 09:00', 'Distribuidora Andina S.A.C.', 'RUC', '20512345678', '', '', '', 'Valeria Quispe', '', 'LAP-001', 'Laptop Pro 14"', 'Laptops', 3200, '', 5, 10, '', '']
  ];
  return toCsv(CSV_HEADERS, rows);
}

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const CATALOG = [
  ['LAP-001', 'Laptop Pro 14" i7 16GB', 'Laptops', 4850, 3900], ['LAP-002', 'Laptop Business 15" i5 8GB', 'Laptops', 3250, 2600],
  ['LAP-003', 'Laptop Gamer 16" RTX', 'Laptops', 6890, 5700], ['MON-001', 'Monitor 24" Full HD IPS', 'Monitores', 689, 520],
  ['MON-002', 'Monitor 27" 2K 144Hz', 'Monitores', 1190, 930], ['MON-003', 'Monitor Curvo 34" UltraWide', 'Monitores', 1890, 1500],
  ['PER-001', 'Teclado Mecánico Inalámbrico', 'Periféricos', 249, 160], ['PER-002', 'Mouse Ergonómico Bluetooth', 'Periféricos', 129, 80],
  ['PER-003', 'Webcam Full HD 1080p', 'Periféricos', 189, 120], ['PER-004', 'Audífonos con Micrófono USB', 'Periféricos', 159, 100],
  ['ALM-001', 'Disco SSD 1TB NVMe', 'Almacenamiento', 389, 290], ['ALM-002', 'Disco Externo 2TB USB 3.0', 'Almacenamiento', 329, 250],
  ['ALM-003', 'Memoria USB 128GB', 'Almacenamiento', 49, 28], ['RED-001', 'Router WiFi 6 AX3000', 'Redes', 349, 250],
  ['RED-002', 'Switch 24 Puertos Gigabit', 'Redes', 690, 520], ['RED-003', 'Access Point Empresarial', 'Redes', 459, 340],
  ['IMP-001', 'Impresora Multifuncional Tinta Continua', 'Impresión', 799, 620], ['IMP-002', 'Impresora Láser Monocromática', 'Impresión', 959, 740],
  ['IMP-003', 'Tóner Compatible Negro', 'Impresión', 119, 70], ['ACC-001', 'Mochila Antirrobo para Laptop', 'Accesorios', 139, 80],
  ['ACC-002', 'Hub USB-C 7 en 1', 'Accesorios', 179, 110], ['ACC-003', 'Cable HDMI 2.1 de 2m', 'Accesorios', 39, 18],
  ['ACC-004', 'Soporte Ajustable para Laptop', 'Accesorios', 89, 50], ['SOF-001', 'Licencia Office Hogar y Empresas', 'Software', 549, 430],
  ['SOF-002', 'Antivirus Empresarial 1 año (5 equipos)', 'Software', 259, 170], ['SOF-003', 'Licencia Windows 11 Pro', 'Software', 489, 390]
];
const COMPANIES = ['Constructora & Logística Andina S.A.', 'Tech Solutions Global S.A.C.', 'Inversiones del Pacífico E.I.R.L.', 'Distribuidora Los Andes S.A.C.',
  'Clínica San Gabriel S.A.', 'Colegio Particular Santa Rosa', 'Minera Cerro Verde Servicios S.A.C.', 'Agroexportadora Valle Azul S.A.C.',
  'Estudio Contable Paredes & Asociados', 'Farmacias Salud Total S.A.C.', 'Transportes Rápidos del Sur S.A.', 'Hotel Plaza Mayor S.A.C.'];
const PEOPLE = ['Carlos Mendoza Rojas', 'Lucía Fernández Vargas', 'Dr. Alejandro Morales Benavides', 'Patricia Salazar Núñez', 'Jorge Huamán Quispe', 'María Elena Castillo',
  'Rafael Ortiz Delgado', 'Sofía Paredes Lozano', 'Andrés Chávez Medina', 'Valentina Ríos Campos', 'Luis Alberto Cárdenas', 'Fiorella Gamarra Soto'];
const SELLERS = ['Valeria Quispe', 'Diego Torres', 'Renzo Valdivia', 'Camila Arce'];
const PAYMENTS = ['Efectivo', 'Tarjeta', 'Transferencia', 'Yape', 'Tarjeta', 'Transferencia'];

const pad = (n, l = 2) => String(n).padStart(l, '0');
const fmt = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

/** @param {number} [now] Fecha de referencia (por defecto, hoy) */
export function sampleCsv(now = Date.now()) {
  const r = rng(2026);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const int = (a, b) => a + Math.floor(r() * (b - a + 1));
  const slug = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');

  const customers = [
    ...COMPANIES.map((name, i) => ({ name, docType: 'RUC', doc: `20${String(100000000 + int(0, 899999999)).slice(0, 8)}${i % 10}`.slice(0, 11), segment: i < 4 ? 'Corporativo' : 'Pyme' })),
    ...PEOPLE.map((name, i) => ({ name, docType: 'DNI', doc: String(int(10000000, 79999999)), segment: i % 3 === 0 ? 'Profesional' : 'Personal' }))
  ].map(c => ({ ...c, email: `${slug(c.name).slice(0, 24)}@${c.docType === 'RUC' ? slug(c.name).split('.')[0] + '.com.pe' : 'gmail.com'}`, phone: `9${int(10000000, 99999999)}` }));

  const rows = [];
  const sold = new Map();
  const sales = [];
  for (let i = 1; i <= 140; i++) {
    const when = now - Math.floor(r() * 90 * 86400000);
    const c = pick(customers);
    const lines = [];
    const n = int(1, 4);
    const used = new Set();
    for (let k = 0; k < n; k++) {
      const p = pick(CATALOG);
      if (used.has(p[0])) continue;
      used.add(p[0]);
      const qty = p[3] > 2000 ? int(1, 2) : p[3] > 500 ? int(1, 4) : int(1, 8);
      lines.push([p, qty]);
      sold.set(p[0], (sold.get(p[0]) || 0) + qty);
    }
    sales.push({ doc: `V-${pad(i, 4)}`, when, c, seller: pick(SELLERS), pay: pick(PAYMENTS), lines });
  }
  sales.sort((a, b) => a.when - b.when).forEach((s, i) => { s.doc = `V-${pad(i + 1, 4)}`; });

  // Catálogo con stock inicial: casi todos con holgura; algunos quedan bajos y uno agotado
  CATALOG.forEach(([sku, name, cat, price, cost], i) => {
    const s = sold.get(sku) || 0;
    const stock = i === 2 ? s : i % 7 === 3 ? s + 2 : s + int(6, 40);
    rows.push(['PRODUCTO', '', '', '', '', '', '', '', '', '', '', sku, name, cat, price, cost, '', '', stock, i % 5 === 0 ? 8 : 5]);
  });
  customers.forEach(c => rows.push(['CLIENTE', '', '', c.name, c.docType, c.doc, c.segment, c.email, c.phone, '', '', '', '', '', '', '', '', '', '', '']));
  for (const s of sales) {
    for (const [p, qty] of s.lines) {
      rows.push(['VENTA', s.doc, fmt(s.when), s.c.name, s.c.docType, s.c.doc, s.c.segment, s.c.email, s.c.phone, s.seller, s.pay, p[0], p[1], p[2], p[3], p[4], qty, '', '', '']);
    }
  }
  for (let q = 1; q <= 8; q++) {
    const when = now - int(0, 20) * 86400000;
    const c = pick(customers);
    for (let k = 0; k < int(1, 3); k++) {
      const p = pick(CATALOG);
      rows.push(['COTIZACION', `C-${pad(q, 4)}`, fmt(when), c.name, c.docType, c.doc, c.segment, c.email, c.phone, pick(SELLERS), '', p[0], p[1], p[2], p[3], p[4], int(2, 10), pick([0, 5, 10]), '', '']);
    }
  }
  return toCsv(CSV_HEADERS, rows);
}
