/**
 * @file trackingEngine.js
 * @description Motor de simulación de envíos (funciones puras, sin DOM ni LocalStorage).
 *
 * Cada venta cobrada genera un envío. El avance depende solo de la hora de inicio, la velocidad
 * de simulación y la hora actual, así que no hace falta guardar el estado de cada envío:
 *
 *   Pedido → Preparación (almacén) → En ruta → Centro de distribución → En reparto → Entregado
 *
 * Una venta pendiente de cobro queda en "Esperando pago" y no avanza hasta cobrarse.
 */

import { CITIES, ORIGIN, ROUTES, DESTINATIONS, DESTINATION_POOL, cityPoint } from './trackingData.js';

export const SPEEDS = [
  { id: '1', factor: 1, label: 'Tiempo real' },
  { id: '60', factor: 60, label: 'Rápida · 1 min = 1 h' },
  { id: '600', factor: 600, label: 'Demo · 1 s = 10 min' },
  { id: '3600', factor: 3600, label: 'Muy rápida · 1 s = 1 h' }
];
export const DEFAULT_SPEED = '600';

export const STEPS = [
  { key: 'ORDER', label: 'Pedido registrado' },
  { key: 'PREPARING', label: 'En preparación' },
  { key: 'IN_TRANSIT', label: 'En ruta' },
  { key: 'AT_HUB', label: 'Centro de distribución' },
  { key: 'OUT_FOR_DELIVERY', label: 'En reparto' },
  { key: 'DELIVERED', label: 'Entregado' }
];

export const STATE_LABEL = {
  WAITING_PAYMENT: 'Esperando pago',
  PREPARING: 'En preparación',
  IN_TRANSIT: 'En ruta',
  AT_HUB: 'En centro de distribución',
  OUT_FOR_DELIVERY: 'En reparto',
  DELIVERED: 'Entregado'
};

const HOUR = 3600000;
const ROAD_FACTOR = 1.25;      // la carretera es más larga que la línea recta
const TRUCK_KMH = 55;
const PLANE_KMH = 700;
const STOP_HOURS = 0.5;        // pausa en cada ciudad intermedia
const PREP_HOURS = 2;
const HUB_HOURS = 1;
const LAST_MILE_HOURS = 2;

// --------------------------------------------------------------- geometría
export function haversineKm(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function hashText(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h;
}

const norm = (t) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/** Ciudad de destino: la del cliente si la tiene registrada; si no, una asignada de forma estable. */
export function resolveDestination(customer, sale) {
  const typed = norm(customer?.city || customer?.ciudad || customer?.department);
  if (typed) {
    const found = DESTINATIONS.find(k => norm(CITIES[k].name) === typed || k === typed);
    if (found) return found;
  }
  const seed = String(sale.customerId || sale.customerName || sale.id);
  return DESTINATION_POOL[hashText(seed) % DESTINATION_POOL.length];
}

const planCache = new Map();

/** Ruta y duraciones de un envío hacia `destKey` (se calcula una sola vez por destino). */
export function buildPlan(destKey) {
  if (planCache.has(destKey)) return planCache.get(destKey);
  const route = ROUTES[destKey] || { mode: 'terrestre', via: [] };
  const points = [cityPoint('almacen'), ...route.via.map(cityPoint), cityPoint(destKey)];
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    const km = haversineKm(points[i - 1], points[i]) * (route.mode === 'aereo' ? 1 : ROAD_FACTOR);
    cum.push(cum[i - 1] + km);
  }
  const totalKm = cum[cum.length - 1];
  const travel = route.mode === 'aereo'
    ? totalKm / PLANE_KMH + 3                       // + trámite y espera en aeropuerto
    : totalKm / TRUCK_KMH + route.via.length * STOP_HOURS;
  const isLima = destKey === 'lima';
  const prep = isLima ? 1 : PREP_HOURS;
  const hub = isLima ? 0.5 : HUB_HOURS;
  const last = isLima ? 3 : LAST_MILE_HOURS;
  const plan = {
    destKey, destName: CITIES[destKey].name, mode: route.mode, via: route.via,
    points, cum, totalKm,
    hours: { prep, travel, hub, last, total: prep + travel + hub + last }
  };
  planCache.set(destKey, plan);
  return plan;
}

/** Posición (lat, lon) a una fracción 0..1 del recorrido. */
export function positionAt(plan, fraction) {
  const f = Math.min(1, Math.max(0, fraction));
  const target = f * plan.totalKm;
  let i = 1;
  while (i < plan.cum.length - 1 && plan.cum[i] < target) i++;
  const a = plan.points[i - 1], b = plan.points[i];
  const span = plan.cum[i] - plan.cum[i - 1] || 1;
  const t = (target - plan.cum[i - 1]) / span;
  return {
    lat: a.lat + (b.lat - a.lat) * t,
    lon: a.lon + (b.lon - a.lon) * t,
    segment: i - 1,
    kmDone: target
  };
}

// --------------------------------------------------------------- estado en el tiempo
function toMs(value) {
  if (value == null) return NaN;
  const n = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(n) ? n : NaN;
}

/** Momento en que el envío empieza a contar (cobro de la venta o reinicio manual). */
export function shipmentStart(sale, override) {
  if (sale.status !== 'PAGADA' && !sale.payment) return NaN;       // aún sin cobrar: no despacha
  if (override && override.saleTs === sale.timestamp && Number.isFinite(override.restartAt)) return override.restartAt;
  const paid = toMs(sale.payment?.paidAt);
  const created = toMs(sale.timestamp);
  return Number.isFinite(paid) ? paid : created;
}

/** Estado del envío en el instante `now`. */
export function computeShipment(sale, destKey, override, factor, now = Date.now()) {
  const plan = buildPlan(destKey);
  const startAt = shipmentStart(sale, override);
  const H = plan.hours;
  const t = { dispatch: H.prep, arrive: H.prep + H.travel, leaveHub: H.prep + H.travel + H.hub, done: H.total };

  if (!Number.isFinite(startAt)) {
    return { state: 'WAITING_PAYMENT', stepIndex: 0, progress: 0, travelFraction: 0, position: null,
      stepTimes: [], startAt: NaN, remainingRealMs: NaN, etaSim: null, plan };
  }

  const elapsedH = Math.max(0, ((now - startAt) / HOUR) * factor);
  // Hora (simulada) en que empieza cada paso: pedido, preparación, ruta, centro, reparto, entregado
  const stepTimes = [startAt, startAt, startAt + t.dispatch * HOUR, startAt + t.arrive * HOUR,
    startAt + t.leaveHub * HOUR, startAt + t.done * HOUR];

  let state, stepIndex, travelFraction = 0, position = null;
  if (elapsedH < t.dispatch) { state = 'PREPARING'; stepIndex = 1; position = positionAt(plan, 0); }
  else if (elapsedH < t.arrive) {
    state = 'IN_TRANSIT'; stepIndex = 2;
    travelFraction = (elapsedH - t.dispatch) / H.travel;
    position = positionAt(plan, travelFraction);
  } else if (elapsedH < t.leaveHub) { state = 'AT_HUB'; stepIndex = 3; travelFraction = 1; position = positionAt(plan, 1); }
  else if (elapsedH < t.done) { state = 'OUT_FOR_DELIVERY'; stepIndex = 4; travelFraction = 1; position = positionAt(plan, 1); }
  else { state = 'DELIVERED'; stepIndex = 5; travelFraction = 1; position = positionAt(plan, 1); }

  const remainingH = Math.max(0, t.done - elapsedH);
  return {
    state, stepIndex, travelFraction, position, stepTimes, plan, startAt,
    progress: Math.min(1, elapsedH / H.total),
    remainingRealMs: (remainingH / factor) * HOUR,
    etaSim: startAt + t.done * HOUR
  };
}

/** Texto corto para una duración en milisegundos reales (p. ej. "2 min 05 s"). */
export function formatCountdown(ms) {
  if (!Number.isFinite(ms)) return '—';
  const s = Math.ceil(ms / 1000);
  if (s <= 0) return 'ahora';
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  if (d) return `${d} d ${h} h`;
  if (h) return `${h} h ${String(m).padStart(2, '0')} min`;
  if (m) return `${m} min ${String(r).padStart(2, '0')} s`;
  return `${r} s`;
}

export { ORIGIN };