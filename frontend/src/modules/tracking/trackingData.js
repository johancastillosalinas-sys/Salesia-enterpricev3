/**
 * @file trackingData.js
 * @description Datos geográficos del módulo de Monitoreo: ciudades de Perú, rutas de despacho
 * desde el almacén central y contorno esquemático del país para dibujar el mapa en SVG
 * (sin servicios externos: funciona sin conexión).
 *
 * Las coordenadas son aproximadas. El mapa es ESQUEMÁTICO y sirve para simular recorridos;
 * no es un mapa cartográfico oficial.
 */

/** Almacén central desde donde sale todo despacho (Callao, Lima). */
export const ORIGIN = { key: 'almacen', name: 'Almacén Central · Callao', lat: -12.056, lon: -77.118 };

export const CITIES = {
  lima:      { name: 'Lima',            lat: -12.046, lon: -77.043 },
  huacho:    { name: 'Huacho',          lat: -11.107, lon: -77.605 },
  chimbote:  { name: 'Chimbote',        lat: -9.085,  lon: -78.578 },
  trujillo:  { name: 'Trujillo',        lat: -8.112,  lon: -79.029 },
  chiclayo:  { name: 'Chiclayo',        lat: -6.771,  lon: -79.841 },
  piura:     { name: 'Piura',           lat: -5.194,  lon: -80.633 },
  tumbes:    { name: 'Tumbes',          lat: -3.567,  lon: -80.451 },
  cajamarca: { name: 'Cajamarca',       lat: -7.157,  lon: -78.512 },
  huaraz:    { name: 'Huaraz',          lat: -9.527,  lon: -77.528 },
  pisco:     { name: 'Pisco',           lat: -13.710, lon: -76.203 },
  chincha:   { name: 'Chincha',         lat: -13.410, lon: -76.132 },
  ica:       { name: 'Ica',             lat: -14.068, lon: -75.729 },
  nazca:     { name: 'Nasca',           lat: -14.830, lon: -74.939 },
  arequipa:  { name: 'Arequipa',        lat: -16.409, lon: -71.537 },
  moquegua:  { name: 'Moquegua',        lat: -17.195, lon: -70.935 },
  tacna:     { name: 'Tacna',           lat: -18.006, lon: -70.253 },
  abancay:   { name: 'Abancay',         lat: -13.636, lon: -72.882 },
  cusco:     { name: 'Cusco',           lat: -13.532, lon: -71.967 },
  juliaca:   { name: 'Juliaca',         lat: -15.500, lon: -70.133 },
  puno:      { name: 'Puno',            lat: -15.840, lon: -70.022 },
  ayacucho:  { name: 'Ayacucho',        lat: -13.158, lon: -74.223 },
  laoroya:   { name: 'La Oroya',        lat: -11.519, lon: -75.899 },
  huancayo:  { name: 'Huancayo',        lat: -12.065, lon: -75.205 },
  cerro:     { name: 'Cerro de Pasco',  lat: -10.683, lon: -76.256 },
  huanuco:   { name: 'Huánuco',         lat: -9.930,  lon: -76.241 },
  pucallpa:  { name: 'Pucallpa',        lat: -8.379,  lon: -74.554 },
  tarapoto:  { name: 'Tarapoto',        lat: -6.490,  lon: -76.360 },
  iquitos:   { name: 'Iquitos',         lat: -3.749,  lon: -73.253 }
};

/** Ciudades que se ofrecen como destino y que se muestran con etiqueta en el mapa. */
export const DESTINATIONS = [
  'lima', 'trujillo', 'chiclayo', 'piura', 'tumbes', 'cajamarca', 'huaraz', 'ica', 'arequipa',
  'tacna', 'cusco', 'puno', 'ayacucho', 'huancayo', 'pucallpa', 'tarapoto', 'iquitos'
];

/**
 * Rutas de despacho: ciudades intermedias (por carretera) y modo de transporte.
 * Iquitos y Tarapoto se atienden por carga aérea (no hay ruta terrestre directa o es muy larga).
 */
export const ROUTES = {
  lima:      { mode: 'terrestre', via: [] },
  trujillo:  { mode: 'terrestre', via: ['huacho', 'chimbote'] },
  chiclayo:  { mode: 'terrestre', via: ['huacho', 'chimbote', 'trujillo'] },
  piura:     { mode: 'terrestre', via: ['huacho', 'chimbote', 'trujillo', 'chiclayo'] },
  tumbes:    { mode: 'terrestre', via: ['huacho', 'chimbote', 'trujillo', 'chiclayo', 'piura'] },
  cajamarca: { mode: 'terrestre', via: ['huacho', 'chimbote', 'trujillo'] },
  huaraz:    { mode: 'terrestre', via: ['huacho'] },
  ica:       { mode: 'terrestre', via: ['chincha'] },
  arequipa:  { mode: 'terrestre', via: ['chincha', 'ica', 'nazca'] },
  tacna:     { mode: 'terrestre', via: ['chincha', 'ica', 'nazca', 'arequipa', 'moquegua'] },
  cusco:     { mode: 'terrestre', via: ['chincha', 'ica', 'nazca', 'abancay'] },
  puno:      { mode: 'terrestre', via: ['chincha', 'ica', 'nazca', 'arequipa', 'juliaca'] },
  ayacucho:  { mode: 'terrestre', via: ['pisco'] },
  huancayo:  { mode: 'terrestre', via: ['laoroya'] },
  pucallpa:  { mode: 'terrestre', via: ['laoroya', 'cerro', 'huanuco'] },
  tarapoto:  { mode: 'aereo', via: [] },
  iquitos:   { mode: 'aereo', via: [] }
};

/**
 * Cuando un cliente no tiene ciudad registrada, el destino se asigna de forma estable
 * (mismo cliente → misma ciudad). Lima aparece varias veces para reflejar mayor demanda.
 */
export const DESTINATION_POOL = [
  'lima', 'lima', 'lima', 'trujillo', 'chiclayo', 'piura', 'arequipa', 'arequipa', 'cusco', 'ica',
  'huancayo', 'cajamarca', 'tacna', 'puno', 'ayacucho', 'huaraz', 'pucallpa', 'tarapoto', 'iquitos', 'tumbes'
];

/** Contorno esquemático de Perú, en pares [latitud, longitud], recorrido de norte a sur por la costa. */
export const PERU_OUTLINE = [
  [-3.40, -80.30], [-4.10, -81.05], [-4.60, -81.30], [-5.10, -81.10], [-5.55, -80.82], [-5.80, -81.10],
  [-6.30, -80.95], [-6.84, -79.95], [-7.50, -79.55], [-8.10, -79.10], [-9.10, -78.60], [-10.07, -78.15],
  [-10.75, -77.77], [-11.10, -77.66], [-11.57, -77.27], [-12.05, -77.15], [-12.50, -76.80], [-13.10, -76.40],
  [-13.80, -76.30], [-14.50, -75.60], [-15.35, -75.17], [-16.20, -73.70], [-16.60, -72.70], [-17.00, -72.00],
  [-17.65, -71.35], [-18.35, -70.38],
  [-17.50, -69.47],
  [-16.57, -69.03], [-15.80, -69.05], [-15.00, -69.30], [-14.40, -69.40], [-13.50, -68.95], [-12.50, -69.20],
  [-10.95, -69.57],
  [-10.98, -70.60], [-10.20, -71.30], [-9.82, -72.18], [-9.45, -73.15], [-8.60, -73.35], [-7.55, -73.75],
  [-6.70, -73.15], [-5.60, -73.15], [-4.90, -72.60], [-4.50, -71.90], [-4.22, -69.94],
  [-3.35, -70.05], [-2.85, -70.60], [-2.30, -71.25], [-1.75, -72.35], [-1.15, -73.35], [-0.55, -74.40],
  [-0.03, -75.25],
  [-0.50, -75.60], [-1.40, -76.20], [-2.10, -76.80], [-2.90, -77.80], [-3.40, -78.30], [-4.00, -78.70],
  [-4.55, -79.25], [-4.40, -79.95], [-4.20, -80.45]
];

/** Etiquetas de países vecinos y del océano (solo ayuda visual). */
export const MAP_LABELS = [
  { text: 'Ecuador', lat: -1.5, lon: -79.3 },
  { text: 'Colombia', lat: -0.6, lon: -71.6 },
  { text: 'Brasil', lat: -6.2, lon: -69.9 },
  { text: 'Bolivia', lat: -13.8, lon: -68.7 },
  { text: 'Chile', lat: -18.1, lon: -69.6 },
  { text: 'Océano Pacífico', lat: -9.6, lon: -80.7 }
];

// --------------------------------------------------------------- proyección al SVG
const LON_MIN = -81.8, LON_MAX = -68.3, LAT_MAX = 0.6, LAT_MIN = -18.9;
const SCALE = 36;                              // píxeles por grado
const COS = Math.cos((-9 * Math.PI) / 180);    // corrección de longitud a latitud media

export const MAP_WIDTH = Math.round((LON_MAX - LON_MIN) * COS * SCALE);
export const MAP_HEIGHT = Math.round((LAT_MAX - LAT_MIN) * SCALE);

export function project(lat, lon) {
  return { x: (lon - LON_MIN) * COS * SCALE, y: (LAT_MAX - lat) * SCALE };
}

export function cityPoint(key) {
  const c = key === 'almacen' ? ORIGIN : CITIES[key];
  return { lat: c.lat, lon: c.lon };
}