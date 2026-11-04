/**
 * @file validators.js
 * @description Validadores de entrada defensivos para datos de cliente, ítems de venta y cotización.
 */

export function validateRuc(ruc) {
  if (!ruc || typeof ruc !== 'string') return false;
  return /^(10|20)\d{9}$/.test(ruc.trim());
}

export function validateDni(dni) {
  if (!dni || typeof dni !== 'string') return false;
  return /^\d{8}$/.test(dni.trim());
}

export function validateCartItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { valid: false, message: 'El carrito no contiene productos.' };
  }
  for (const it of items) {
    if (!it.productId || !it.quantity || it.quantity <= 0 || !it.price || it.price <= 0) {
      return { valid: false, message: `Ítem inválido en la lista: ${it.name || it.productId}` };
    }
  }
  return { valid: true };
}

export function validateEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}