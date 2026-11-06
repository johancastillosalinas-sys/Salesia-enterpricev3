/**
 * @file permissions.js
 * @description Matriz de acceso por rol a los módulos del sistema (RF-01).
 * Un solo lugar para cambiar qué puede ver cada rol.
 *
 * NOTA: es control de interfaz sobre un sistema simulado en LocalStorage.
 * La seguridad real requiere validar los permisos también en el backend.
 */

// Orden de los módulos en el menú. El primero permitido es la pantalla de inicio de cada rol.
export const ROUTE_ORDER = [
  'dashboard', 'pos', 'billing', 'quotes', 'customers', 'products',
  'inventory', 'tracking', 'reports', 'history', 'import', 'audit', 'security'
];

export const ROLE_ROUTES = {
  ADMINISTRADOR: [...ROUTE_ORDER],
  GERENTE: ['dashboard', 'billing', 'tracking', 'reports', 'history'],
  VENDEDOR: ['pos', 'billing', 'quotes', 'customers', 'tracking', 'history'],
  ANALISTA: ['dashboard', 'reports'],
  ALMACEN: ['products', 'inventory', 'tracking', 'reports']
};

export function canAccess(role, route) {
  if (!role) return false;
  // Rol desconocido => sin acceso (opción segura por defecto)
  return (ROLE_ROUTES[role] || []).includes(route);
}

export function firstAllowedRoute(role) {
  return ROUTE_ORDER.find(route => canAccess(role, route)) || null;
}