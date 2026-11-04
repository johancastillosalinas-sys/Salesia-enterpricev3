/**
 * @file initialSeed.js
 * @description Datos iniciales: empresa, roles y cuentas de acceso. Los datos de negocio
 * (clientes, productos, ventas...) empiezan VACÍOS y se cargan con un CSV.
 * Contraseña de las cuentas de demostración: Salesia2026
 */

export const INITIAL_COMPANY = {
  id: 'COMP-001',
  ruc: '20608899112',
  name: 'SalesIA Enterprise S.A.C.',
  commercialName: 'SalesIA Solutions',
  address: 'Av. Faustino Sánchez Carrión 465, Magdalena del Mar, Lima',
  phone: '+51 (01) 480-9900',
  currency: 'PEN',
  taxRate: 0.18
};

export const INITIAL_ROLES = [
  { id: 'ROL-001', name: 'ADMINISTRADOR', permissions: ['ALL'] },
  { id: 'ROL-002', name: 'GERENTE', permissions: ['DASHBOARD', 'REPORTS'] },
  { id: 'ROL-003', name: 'VENDEDOR', permissions: ['POS', 'QUOTES', 'CUSTOMERS', 'BILLING'] },
  { id: 'ROL-004', name: 'ANALISTA', permissions: ['DASHBOARD', 'REPORTS'] },
  { id: 'ROL-005', name: 'ALMACEN', permissions: ['INVENTORY', 'PRODUCTS'] }
];

export const INITIAL_USERS = [
  { id: 'USR-001', username: 'admin', name: 'Ing. Johan Silva', role: 'ADMINISTRADOR', email: 'admin@salesia.pe',
    passwordHash: 'eb9ae929338554f10fc28bbb13c9d325d47cc884ea16e25f07a88f3741b2f08b' },
  { id: 'USR-002', username: 'gerente', name: 'Lic. Carlos Mendoza', role: 'GERENTE', email: 'gerente@salesia.pe',
    passwordHash: '4d6b6229d4f1f1d94676b4478906c328067666db7ee2ade3da10b625f52ab3ae' },
  { id: 'USR-003', username: 'vendedor', name: 'Valeria Quispe', role: 'VENDEDOR', email: 'ventas@salesia.pe',
    passwordHash: 'c80d5bcb84b4cba7dbbe3c0905fa40b9acded87c9b24ea88acdb637663bee348' },
  { id: 'USR-004', username: 'analista', name: 'Diego Torres', role: 'ANALISTA', email: 'analitica@salesia.pe',
    passwordHash: '50088d8510c5ff9b7b5e701544d18afc2a334bf89adf24646670492a430e02c3' },
  { id: 'USR-005', username: 'almacen', name: 'Marco Ramos', role: 'ALMACEN', email: 'almacen@salesia.pe',
    passwordHash: '90010668e51a9a32b7360e1fd2913fa0337d6e5ba1893518c066087b25e3e200' }
];

// Los datos de negocio arrancan en cero: se cargan con "Importar datos" (CSV) o a mano.
export const INITIAL_SELLERS = [];

export const INITIAL_CATEGORIES = [];

export const INITIAL_PRODUCTS = [];

export const INITIAL_CUSTOMERS = [];
