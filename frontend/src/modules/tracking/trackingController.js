/**
 * @file trackingController.js
 * @description Módulo de Monitoreo (Logística): sigue cada venta cobrada desde el almacén hasta el
 * cliente sobre un mapa esquemático de Perú, con simulación en vivo y velocidad ajustable.
 */

import { escapeHtml } from '../../utils/formatters.js';
import { normalize } from '../../components/uiKit.js';
import {
  CITIES, DESTINATIONS, ORIGIN, PERU_OUTLINE, MAP_LABELS, MAP_WIDTH, MAP_HEIGHT, project, cityPoint
} from './trackingData.js';
import {
  SPEEDS, DEFAULT_SPEED, STEPS, STATE_LABEL, resolveDestination, computeShipment, formatCountdown
} from './trackingEngine.js';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const BADGE = {
  WAITING_PAYMENT: 'bg-slate-100 text-slate-600',
  PREPARING: 'bg-amber-100 text-amber-800',
  IN_TRANSIT: 'bg-blue-100 text-blue-800',
  AT_HUB: 'bg-violet-100 text-violet-800',
  OUT_FOR_DELIVERY: 'bg-cyan-100 text-cyan-800',
  DELIVERED: 'bg-emerald-100 text-emerald-800'
};
const MAX_LIST = 80;
const TICK_MS = 250;

const fmtDateTime = (ms) => Number.isFinite(ms)
  ? new Date(ms).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  : '—';

export class TrackingController {
  #timer = null;
  #ticks = 0;
  #selectedId = null;
  #tab = 'active';
  #query = '';
  #mapBuilt = false;
  #listSig = '';
  #detailKey = '';
  #prevState = new Map();
  #bound = false;
  #current = null;
  #map = null;
  #shipmentsLayer = null;
  #selectedLayer = null;

  constructor(app) {
    this.app = app;
  }

  get #storage() { return this.app.state.storage; }
  get #speedFactor() {
    const id = this.#storage.get('tracking_prefs', {}).speed || DEFAULT_SPEED;
    return (SPEEDS.find(s => s.id === id) || SPEEDS[2]).factor;
  }

  // ------------------------------------------------------------------ ciclo de vida
  render() {
    this.#bind();
    this.#buildMapOnce();
    this.#syncSpeedSelect();
    this.#listSig = '';
    this.#detailKey = '';
    this.#prevState.clear();
    this.#tick(true);
    this.#start();
  }

  stop() {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
  }

  #start() {
    if (this.#timer) return;
    this.#timer = setInterval(() => {
      const view = document.getElementById('view-tracking');
      if (!view || view.classList.contains('hidden')) { this.stop(); return; }
      this.#tick(false);
    }, TICK_MS);
  }

  // ------------------------------------------------------------------ datos
  #overrides() { return this.#storage.get('tracking_overrides', {}); }

  #collect(now) {
    const sales = this.#storage.get('sales', []);
    const customers = new Map(this.#storage.get('customers', []).map(c => [c.id, c]));
    const overrides = this.#overrides();
    const factor = this.#speedFactor;
    const out = [];
    for (const sale of sales) {
      if (sale.status === 'ANULADA') continue;
      const customer = customers.get(sale.customerId) || null;
      const ov = overrides[sale.id] && overrides[sale.id].saleTs === sale.timestamp ? overrides[sale.id] : null;
      const auto = !(ov && ov.destKey);
      const destKey = (ov && ov.destKey) || resolveDestination(customer, sale);
      const info = computeShipment(sale, destKey, ov, factor, now);
      out.push({ sale, customer, destKey, autoDest: auto && !customer?.city, ...info });
    }
    return out;
  }

  #filtered(all) {
    const q = normalize(this.#query);
    let list = all;
    if (this.#tab === 'active') list = list.filter(s => s.state !== 'DELIVERED');
    else if (this.#tab === 'delivered') list = list.filter(s => s.state === 'DELIVERED');
    if (q) {
      list = list.filter(s => normalize([s.sale.id, s.sale.customerName, s.plan.destName,
        ...(s.sale.items || []).map(i => i.name)].join(' ')).includes(q));
    }
    return list.sort((a, b) => (b.sale.timestamp || 0) - (a.sale.timestamp || 0));
  }

  // ------------------------------------------------------------------ eventos
  #bind() {
    if (this.#bound) return;
    this.#bound = true;
    const root = document.getElementById('view-tracking');
    root.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-trk-tab]');
      if (tab) { this.#tab = tab.dataset.trkTab; this.#listSig = ''; this.#syncTabs(); this.#tick(true); return; }
      const pick = e.target.closest('[data-trk-id]');
      if (pick) { this.#selectedId = pick.dataset.trkId; this.#listSig = ''; this.#detailKey = ''; this.#tick(true); return; }
      if (e.target.closest('[data-trk-restart]')) this.#restart(null);
    });
    root.addEventListener('input', (e) => {
      if (e.target.id === 'trkSearch') { this.#query = e.target.value; this.#listSig = ''; this.#tick(true); }
    });
    root.addEventListener('change', (e) => {
      if (e.target.id === 'trkSpeed') {
        this.#storage.set('tracking_prefs', { ...this.#storage.get('tracking_prefs', {}), speed: e.target.value });
        this.#listSig = ''; this.#detailKey = ''; this.#tick(true);
      } else if (e.target.id === 'trkDest') this.#restart(e.target.value);
    });
  }

  #syncSpeedSelect() {
    const sel = document.getElementById('trkSpeed');
    if (!sel) return;
    if (!sel.options.length) sel.innerHTML = SPEEDS.map(s => `<option value="${s.id}">${escapeHtml(s.label)}</option>`).join('');
    sel.value = this.#storage.get('tracking_prefs', {}).speed || DEFAULT_SPEED;
  }

  #syncTabs() {
    document.querySelectorAll('[data-trk-tab]').forEach(b => {
      const on = b.dataset.trkTab === this.#tab;
      b.classList.toggle('bg-slate-900', on); b.classList.toggle('text-white', on);
      b.classList.toggle('text-slate-500', !on); b.classList.toggle('hover:bg-slate-100', !on);
    });
  }

  /** Reinicia la simulación del envío elegido (y, si se indica, cambia su destino). */
  #restart(destKey) {
    const sel = this.#current;
    if (!sel) return;
    const overrides = this.#overrides();
    const prev = overrides[sel.sale.id] && overrides[sel.sale.id].saleTs === sel.sale.timestamp ? overrides[sel.sale.id] : {};
    overrides[sel.sale.id] = { ...prev, saleTs: sel.sale.timestamp, restartAt: Date.now(), ...(destKey ? { destKey } : {}) };
    this.#storage.set('tracking_overrides', overrides);
    this.#prevState.delete(sel.sale.id);
    this.#listSig = ''; this.#detailKey = '';
    this.#tick(true);
    this.app.showToast(destKey
      ? `Destino cambiado a ${CITIES[destKey].name}. El envío ${sel.sale.id} sale de nuevo desde el almacén.`
      : `Simulación reiniciada para ${sel.sale.id}.`, 'info');
  }

  // ------------------------------------------------------------------ bucle principal
  #tick(force) {
    this.#ticks++;
    const now = Date.now();
    const all = this.#collect(now);
    this.#notifyDeliveries(all);
    const list = this.#filtered(all);

    if (!list.find(s => s.sale.id === this.#selectedId)) {
      const anywhere = all.find(s => s.sale.id === this.#selectedId);
      this.#selectedId = anywhere && this.#tab === 'all' ? anywhere.sale.id : (list[0]?.sale.id || null);
    }
    this.#current = all.find(s => s.sale.id === this.#selectedId) || null;

    this.#drawMap(all, this.#current);
    if (force || this.#ticks % 4 === 0) {
      this.#renderKpis(all);
      this.#renderList(list);
      this.#renderDetail(this.#current);
      this.#syncTabs();
    }
  }

  #notifyDeliveries(all) {
    for (const s of all) {
      const before = this.#prevState.get(s.sale.id);
      if (before && before !== 'DELIVERED' && s.state === 'DELIVERED') {
        this.app.showToast(`Envío ${s.sale.id} entregado a ${s.sale.customerName} en ${s.plan.destName}.`, 'success');
      }
      this.#prevState.set(s.sale.id, s.state);
    }
  }

  // ------------------------------------------------------------------ KPIs y lista
  #renderKpis(all) {
    const n = (fn) => all.filter(fn).length;
    const items = [
      ['En preparación', n(s => s.state === 'PREPARING'), 'text-amber-600'],
      ['En ruta', n(s => s.state === 'IN_TRANSIT'), 'text-blue-600'],
      ['En reparto', n(s => s.state === 'AT_HUB' || s.state === 'OUT_FOR_DELIVERY'), 'text-cyan-600'],
      ['Entregados', n(s => s.state === 'DELIVERED'), 'text-emerald-600']
    ];
    const box = document.getElementById('trkKpis');
    if (box) box.innerHTML = items.map(([l, v, c]) =>
      `<div><div class="text-2xl font-extrabold leading-none ${c}">${v}</div><div class="text-[11px] text-slate-500 mt-1">${l}</div></div>`).join('');
  }

  #renderList(list) {
    const box = document.getElementById('trkList');
    if (!box) return;
    const shown = list.slice(0, MAX_LIST);
    const sig = shown.map(s => `${s.sale.id}:${s.state}:${Math.round(s.progress * 100)}`).join('|') + `#${this.#selectedId}`;
    if (sig === this.#listSig) return;
    this.#listSig = sig;
    const top = box.scrollTop;
    if (!shown.length) {
      box.innerHTML = `<div class="px-5 py-10 text-center text-xs text-slate-400 leading-relaxed">
        ${this.#tab === 'active'
          ? 'No hay envíos en curso.<br>Registra y cobra una venta para verla viajar, o revisa la pestaña «Entregados» para repetir una simulación.'
          : 'No hay envíos que coincidan.'}</div>`;
      return;
    }
    box.innerHTML = shown.map(s => {
      const items = s.sale.items || [];
      const label = items.length ? `${items[0].name}${items.length > 1 ? ` +${items.length - 1} más` : ''}` : 'Sin productos';
      const sel = s.sale.id === this.#selectedId;
      return `<button type="button" data-trk-id="${escapeHtml(s.sale.id)}" aria-current="${sel}" class="w-full text-left px-4 py-3 transition-colors ${sel ? 'bg-cyan-50' : 'hover:bg-slate-50'}">
        <div class="flex items-center justify-between gap-2">
          <span class="font-mono text-xs font-bold text-cyan-700">${escapeHtml(s.sale.id)}</span>
          <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold ${BADGE[s.state]}">${STATE_LABEL[s.state]}</span>
        </div>
        <div class="text-xs font-semibold text-slate-800 truncate mt-1">${escapeHtml(label)}</div>
        <div class="text-[11px] text-slate-500 truncate">${escapeHtml(s.sale.customerName)} · ${escapeHtml(s.plan.destName)}</div>
        <div class="h-1 bg-slate-100 rounded-full mt-2 overflow-hidden"><div class="h-full rounded-full ${s.state === 'DELIVERED' ? 'bg-emerald-500' : 'bg-cyan-500'}" style="width:${Math.round(s.progress * 100)}%"></div></div>
      </button>`;
    }).join('') + (list.length > MAX_LIST ? `<div class="px-4 py-3 text-[11px] text-slate-400 text-center">Mostrando los ${MAX_LIST} más recientes de ${list.length}. Usa la búsqueda para afinar.</div>` : '');
    box.scrollTop = top;
  }

  // ------------------------------------------------------------------ detalle
  #renderDetail(s) {
    const box = document.getElementById('trkDetail');
    if (!box) return;
    if (!s) {
      this.#detailKey = '';
      box.innerHTML = `<div class="px-6 py-14 text-center text-sm text-slate-400">Elige un envío de la lista para ver su recorrido.</div>`;
      return;
    }
    const key = `${s.sale.id}|${s.destKey}|${this.#speedFactor}`;
    if (key !== this.#detailKey) {
      this.#detailKey = key;
      const items = s.sale.items || [];
      box.innerHTML = `
        <div class="px-5 py-4 border-b border-slate-100">
          <div class="flex items-start justify-between gap-3">
            <div>
              <h4 class="font-bold text-slate-900 text-sm"><span class="font-mono text-cyan-700">${escapeHtml(s.sale.id)}</span> · ${escapeHtml(s.sale.customerName)}</h4>
              <p class="text-xs text-slate-500 mt-0.5">Destino: <b class="text-slate-700">${escapeHtml(s.plan.destName)}</b> · ${s.plan.mode === 'aereo' ? 'Carga aérea' : 'Transporte terrestre'} · ${Math.round(s.plan.totalKm).toLocaleString('es-PE')} km</p>
            </div>
            <span id="trkBadge"></span>
          </div>
          ${s.autoDest ? '<p class="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5 mt-3">El cliente no tiene ciudad registrada, así que el destino se asignó de forma automática (simulado). Puedes cambiarlo abajo.</p>' : ''}
        </div>
        <div class="px-5 py-3 border-b border-slate-100">
          <div class="text-[11px] font-semibold text-slate-500 mb-2">Productos del envío</div>
          <ul class="space-y-1.5">${items.map(i => `<li class="flex items-center justify-between gap-3 text-xs"><span class="text-slate-700 truncate">${escapeHtml(i.name)} <span class="font-mono text-slate-400">${escapeHtml(i.sku || '')}</span></span><span class="font-mono font-semibold text-slate-600 shrink-0">× ${escapeHtml(i.quantity)}</span></li>`).join('')}</ul>
        </div>
        <div class="px-5 py-3 border-b border-slate-100 flex flex-wrap items-end gap-3">
          <label class="text-[11px] font-semibold text-slate-500">Ciudad de destino
            <select id="trkDest" class="mt-1 block w-44 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700">
              ${DESTINATIONS.map(k => `<option value="${k}" ${k === s.destKey ? 'selected' : ''}>${escapeHtml(CITIES[k].name)}</option>`).join('')}
            </select></label>
          <button type="button" data-trk-restart class="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700">Repetir simulación</button>
        </div>
        <div id="trkLive" class="px-5 py-4"></div>`;
    }
    this.#renderLive(s);
  }

  #renderLive(s) {
    const live = document.getElementById('trkLive');
    if (!live) return;
    const badge = document.getElementById('trkBadge');
    if (badge) badge.innerHTML = `<span class="px-2.5 py-1 rounded-full text-[11px] font-semibold ${BADGE[s.state]}">${STATE_LABEL[s.state]}</span>`;

    const pct = Math.round(s.progress * 100);
    const waiting = s.state === 'WAITING_PAYMENT';
    const names = [ORIGIN.name, ...s.plan.via.map(k => CITIES[k].name), s.plan.destName];
    const stepText = [
      waiting ? 'Falta cobrar la venta en Facturación para iniciar el despacho.' : `Venta ${s.sale.id} cobrada.`,
      'Se empaca el pedido y se genera la guía de despacho en el Almacén Central.',
      s.plan.mode === 'aereo' ? `Vuelo de carga Lima → ${s.plan.destName}.` : `Camión por carretera: ${names.join(' → ')}.`,
      `Clasificación del paquete en ${s.plan.destName}.`,
      'Reparto a domicilio por el courier local.',
      `Recibido por ${s.sale.customerName}.`
    ];
    let transit = '';
    if (s.state === 'IN_TRANSIT' && s.position) {
      const seg = Math.min(s.position.segment, names.length - 2);
      transit = `<p class="text-[11px] text-blue-700 bg-blue-50 rounded-lg px-2.5 py-1.5 mt-3">Tramo actual: ${escapeHtml(names[seg])} → ${escapeHtml(names[seg + 1])} · ${Math.round(s.position.kmDone).toLocaleString('es-PE')} de ${Math.round(s.plan.totalKm).toLocaleString('es-PE')} km</p>`;
    }
    const countdown = s.state === 'DELIVERED' ? 'Entregado' : waiting ? 'Sin iniciar' : `Llega en ${formatCountdown(s.remainingRealMs)}`;
    live.innerHTML = `
      <div class="flex items-center justify-between text-xs mb-1.5">
        <span class="font-semibold text-slate-700">${pct}% del recorrido</span>
        <span class="font-mono text-slate-500">${countdown}</span>
      </div>
      <div class="h-2 bg-slate-100 rounded-full overflow-hidden" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
        <div class="h-full rounded-full ${s.state === 'DELIVERED' ? 'bg-emerald-500' : 'bg-cyan-500'}" style="width:${pct}%"></div>
      </div>
      ${Number.isFinite(s.etaSim) ? `<p class="text-[11px] text-slate-400 mt-1.5">Entrega estimada (hora simulada): ${fmtDateTime(s.etaSim)}</p>` : ''}
      ${transit}
      <ol class="mt-4">
        ${STEPS.map((st, i) => {
          const done = !waiting ? i < s.stepIndex || s.state === 'DELIVERED' : i < 0;
          const current = waiting ? i === 0 : i === s.stepIndex && s.state !== 'DELIVERED';
          const dot = done || (s.state === 'DELIVERED' && i === 5) ? 'bg-emerald-500 border-emerald-500 text-white' : current ? 'bg-white border-cyan-500 text-cyan-600' : 'bg-white border-slate-300 text-slate-300';
          const last = i === STEPS.length - 1;
          return `<li class="flex gap-3">
            <div class="flex flex-col items-center"><span class="w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] font-bold ${dot}">${done || (s.state === 'DELIVERED' && i === 5) ? '✓' : ''}</span>${last ? '' : `<span class="w-0.5 flex-1 min-h-[22px] ${done ? 'bg-emerald-300' : 'bg-slate-200'}"></span>`}</div>
            <div class="pb-3 ${done || current ? '' : 'opacity-50'}">
              <div class="text-xs font-semibold ${current ? 'text-cyan-700' : 'text-slate-800'}">${st.label}${(done || current) && s.stepTimes[i] ? ` <span class="font-mono font-normal text-slate-400">· ${fmtDateTime(s.stepTimes[i])}</span>` : ''}</div>
              <div class="text-[11px] text-slate-500">${escapeHtml(stepText[i])}</div>
            </div></li>`;
        }).join('')}
      </ol>`;
  }

  // ------------------------------------------------------------------ mapa
  
  #buildMapOnce() {
    const host = document.getElementById('trkMap');

    if (!host || this.#map) return;

    host.innerHTML = `
      <div
        id="trkLeafletMap"
        style="width:100%; height: min(70vh, 680px); min-height:480px; border-radius:12px; z-index:1;"
        role="application"
        aria-label="Mapa interactivo de seguimiento de envíos">
      </div>
      <p class="text-[10px] text-slate-400 text-center mt-2">
        Mapa cartográfico © OpenStreetMap contributors.
        Las rutas actuales son aproximadas.
      </p>
    `;

    const mapElement = document.getElementById('trkLeafletMap');
    if (!mapElement) return;

    this.#map = L.map(mapElement, {
      zoomControl: true,
      scrollWheelZoom: true
    }).setView([-9.19, -75.015], 5);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(this.#map);

    this.#shipmentsLayer = L.layerGroup().addTo(this.#map);
    this.#selectedLayer = L.layerGroup().addTo(this.#map);

    this.#mapBuilt = true;

    requestAnimationFrame(() => {
      this.#map?.invalidateSize();
    });
  }

  #drawMap(all, sel) {
    if (!this.#map || !this.#shipmentsLayer || !this.#selectedLayer) {
      return;
    }

    this.#shipmentsLayer.clearLayers();
    this.#selectedLayer.clearLayers();

    // Mostrar los demás envíos activos.
    for (const s of all) {
      if (sel && s.sale.id === sel.sale.id) continue;
      if (
        s.state === 'WAITING_PAYMENT' ||
        s.state === 'DELIVERED' ||
        !s.position
      ) continue;

      const color =
        s.state === 'IN_TRANSIT' ? '#2563EB' :
        s.state === 'PREPARING' ? '#F59E0B' :
        '#0891B2';

      const marker = L.circleMarker(
        [s.position.lat, s.position.lon],
        {
          radius: 7,
          color: '#ffffff',
          weight: 2,
          fillColor: color,
          fillOpacity: 1
        }
      ).addTo(this.#shipmentsLayer);

      marker.bindTooltip(
        `${escapeHtml(s.sale.id)} · ${escapeHtml(STATE_LABEL[s.state])}`
      );

      marker.on('click', () => {
        this.#selectedId = s.sale.id;
        this.#listSig = '';
        this.#detailKey = '';
        this.#tick(true);
      });
    }

    if (!sel) return;

    const plan = sel.plan;

    // Ruta completa aproximada entre ciudades.
    const fullRoute = plan.points.map(p => [p.lat, p.lon]);

    if (fullRoute.length > 1) {
      L.polyline(fullRoute, {
        color: '#94A3B8',
        weight: 4,
        opacity: 0.8,
        dashArray: '7 7'
      }).addTo(this.#selectedLayer);
    }

    // Tramo recorrido de la simulación.
    if (sel.position && sel.travelFraction > 0) {
      const points = [plan.points[0]];

      for (let i = 1; i <= sel.position.segment; i++) {
        if (plan.points[i]) points.push(plan.points[i]);
      }

      points.push({
        lat: sel.position.lat,
        lon: sel.position.lon
      });

      L.polyline(
        points.map(p => [p.lat, p.lon]),
        {
          color: '#0891B2',
          weight: 5,
          opacity: 0.95
        }
      ).addTo(this.#selectedLayer);
    }

    // Almacén de origen.
    L.marker([ORIGIN.lat, ORIGIN.lon], {
      icon: L.divIcon({
        className: '',
        html: '<div style="font-size:25px">🏭</div>',
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      })
    })
      .bindTooltip('Almacén Central · Callao')
      .addTo(this.#selectedLayer);

    // Paradas intermedias.
    plan.via.forEach(key => {
      const city = CITIES[key];
      if (!city) return;

      L.circleMarker([city.lat, city.lon], {
        radius: 5,
        color: '#0891B2',
        fillColor: '#ffffff',
        fillOpacity: 1,
        weight: 2
      })
        .bindTooltip(escapeHtml(city.name))
        .addTo(this.#selectedLayer);
    });

    // Destino.
    const destination = cityPoint(sel.destKey);

    L.circleMarker(
      [destination.lat, destination.lon],
      {
        radius: 9,
        color: '#ffffff',
        weight: 2,
        fillColor: '#10B981',
        fillOpacity: 1
      }
    )
      .bindTooltip(escapeHtml(plan.destName))
      .addTo(this.#selectedLayer);

    // Ubicación simulada del vehículo.
    if (sel.position && sel.state !== 'WAITING_PAYMENT') {
      const vehicle = L.marker(
        [sel.position.lat, sel.position.lon],
        {
          icon: L.divIcon({
            className: '',
            html: '<div style="font-size:25px">🚚</div>',
            iconSize: [32, 32],
            iconAnchor: [16, 16]
          })
        }
      );

      vehicle.bindTooltip(
        `${escapeHtml(sel.sale.id)} · ${escapeHtml(STATE_LABEL[sel.state])}`
      );

      vehicle.addTo(this.#selectedLayer);
    }
  }
}