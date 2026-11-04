/**
 * @file checkoutModal.js
 * @description "Continuar con la facturación": cobro en una pasarela simulada y emisión de
 * boleta o factura electrónica. Pasos: 1 Pago → 2 Comprobante → 3 Listo.
 * Todo es simulado; de la tarjeta solo se guarda la marca y los últimos 4 dígitos.
 */

import { Modal } from '../../components/modal.js';
import { icon, avatar } from '../../components/uiKit.js';
import { formatCurrency, escapeHtml } from '../../utils/formatters.js';
import { validateRuc, validateDni } from '../../utils/validators.js';
import { printModal } from '../../utils/print.js';
import { PAYMENTS, paymentLabel } from '../sales/payments.js';
import { SaleStatus } from './saleStatus.js';
import { renderInvoiceHtml } from './invoiceDocument.js';
import { pseudoQrSvg } from './pseudoQr.js';
import {
  PaymentGateway, TEST_CARDS, OTP_CODE, detectBrand, formatCardNumber, formatExpiry, validateCard, onlyDigits
} from './paymentGateway.js';

const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise(r => setTimeout(r, globalThis.__SALESIA_FAST__ ? 15 : ms));
const BOLETA_ID_LIMIT = 700;

export class CheckoutModal {
  constructor(app) {
    this.app = app;
    this.saleId = null;
    this.step = 1;
    this.method = null;
    this.busy = false;
    this.card = { number: '', name: '', expiry: '', cvv: '' };
    this.cash = { received: '' };
    this.bank = { origin: '', operation: '' };
    this.doc = { type: 'BOLETA', docType: 'DNI', docNumber: '', name: '', address: '' };
    this.timer = null;
  }

  get sale() { return this.app.billing.getSale(this.saleId); }
  get company() { return this.app.state.storage.get('company', {}); }

  // ------------------------------------------------------------------ apertura
  open(saleId) {
    const sale = this.app.billing.getSale(saleId);
    if (!sale) { this.app.showToast('La venta no existe.', 'error'); return; }
    if (sale.status === SaleStatus.CANCELLED) { this.app.showToast('Esta venta está anulada.', 'warning'); return; }

    this.saleId = saleId;
    this.method = null;
    this.busy = false;
    this.card = { number: '', name: '', expiry: '', cvv: '' };
    this.cash = { received: '' };
    this.bank = { origin: '', operation: '' };
    this.step = sale.status === SaleStatus.PENDING ? 1 : (sale.invoice ? 3 : 2);
    this.#initDoc(sale);

    $('checkoutModal').__beforeClose = () => !this.busy;
    $('checkoutModal').addEventListener('modal:closed', () => this.#stopTimer(), { once: true });
    this.#render();
    Modal.open('checkoutModal');
  }

  #initDoc(sale) {
    const customer = this.app.state.storage.get('customers', []).find(c => c.id === sale.customerId);
    if (sale.invoice) { this.doc = { type: sale.invoice.type, ...sale.invoice.customer }; return; }
    const isRuc = customer?.docType === 'RUC';
    this.doc = {
      type: isRuc ? 'FACTURA' : 'BOLETA',
      docType: customer?.docType || 'DNI',
      docNumber: customer?.docNumber || '',
      name: customer?.name || (sale.customerName !== 'Cliente varios' ? sale.customerName : ''),
      address: customer?.address || ''
    };
  }

  #stopTimer() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  // ------------------------------------------------------------------ estructura
  #render() {
    this.#stopTimer();
    const sale = this.sale;
    const steps = ['Pago', 'Comprobante', 'Listo'];
    const stepper = steps.map((label, i) => {
      const n = i + 1;
      const done = n < this.step, current = n === this.step;
      return `
        <div class="flex items-center gap-2 ${i > 0 ? 'flex-1' : ''}">
          ${i > 0 ? `<span class="flex-1 h-0.5 ${done || current ? 'bg-blue-600' : 'bg-slate-200'}"></span>` : ''}
          <span class="w-7 h-7 rounded-full text-xs font-bold inline-flex items-center justify-center ${done ? 'bg-blue-600 text-white' : current ? 'bg-blue-600 text-white ring-4 ring-blue-100' : 'bg-slate-200 text-slate-500'}">${done ? icon('check', 'w-4 h-4') : n}</span>
          <span class="text-xs font-semibold ${current ? 'text-slate-900' : 'text-slate-400'}">${label}</span>
        </div>`;
    }).join('');

    $('checkoutPanel').innerHTML = `
      <div class="no-print flex items-start justify-between gap-4 px-6 py-4 border-b border-slate-100">
        <div class="flex items-center gap-3">
          <span class="w-10 h-10 rounded-xl bg-emerald-600 text-white inline-flex items-center justify-center">${icon('receipt')}</span>
          <div>
            <h3 class="text-base font-extrabold text-slate-900">Cobro y facturación</h3>
            <p class="text-xs text-slate-500">Venta <span class="font-mono font-semibold">${escapeHtml(sale.id)}</span> · ${escapeHtml(sale.customerName)}</p>
          </div>
        </div>
        <button type="button" id="coClose" class="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Cerrar">${icon('close')}</button>
      </div>
      <div class="no-print px-6 pt-4"><div class="flex items-center gap-2 max-w-xl">${stepper}</div></div>
      <div id="coBody" class="p-6"></div>`;
    $('coClose').onclick = () => Modal.close('checkoutModal');

    if (this.step === 3) this.#renderDone();
    else {
      $('coBody').innerHTML = `
        <div class="grid lg:grid-cols-5 gap-6">
          <div class="lg:col-span-2" id="coSummary"></div>
          <div class="lg:col-span-3" id="coStep"></div>
        </div>`;
      this.#renderSummary();
      if (this.step === 1) this.#renderPaymentStep();
      else this.#renderDocStep();
    }
  }

  #renderSummary() {
    const s = this.sale;
    const paid = s.payment && s.status !== SaleStatus.PENDING;
    $('coSummary').innerHTML = `
      <div class="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
        <p class="text-[11px] font-bold uppercase tracking-wider text-slate-500">Resumen de la venta</p>
        <div class="flex items-center gap-2.5">${avatar(s.customerName, 'w-9 h-9 text-xs')}<div class="min-w-0"><p class="text-sm font-semibold text-slate-900 truncate">${escapeHtml(s.customerName)}</p><p class="text-[11px] text-slate-400">Vendedor: ${escapeHtml(s.sellerName || '—')}</p></div></div>
        <div class="max-h-44 overflow-y-auto divide-y divide-slate-200 border-y border-slate-200">
          ${s.items.map(it => `
            <div class="flex items-start justify-between gap-3 py-2 text-xs">
              <span class="text-slate-700"><span class="font-mono font-bold">${it.quantity}×</span> ${escapeHtml(it.name)}</span>
              <span class="font-mono text-slate-900 whitespace-nowrap">${formatCurrency(it.price * it.quantity)}</span>
            </div>`).join('')}
        </div>
        <div class="space-y-1 text-xs">
          <div class="flex justify-between text-slate-500"><span>Subtotal</span><span class="font-mono">${formatCurrency(s.totals.subtotal)}</span></div>
          <div class="flex justify-between text-slate-500"><span>IGV (18%)</span><span class="font-mono">${formatCurrency(s.totals.taxAmount)}</span></div>
          <div class="flex justify-between text-base font-extrabold text-slate-900 pt-2 border-t border-slate-200"><span>Total a pagar</span><span class="font-mono text-blue-600">${formatCurrency(s.totals.total)}</span></div>
        </div>
        ${paid ? `<div class="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-[11px] text-emerald-800 font-semibold">✓ Cobrada · ${escapeHtml(paymentLabel(s.paymentMethod))}${s.payment.last4 ? ` •••• ${escapeHtml(s.payment.last4)}` : ''}<br><span class="font-mono font-normal">Ref. ${escapeHtml(s.payment.reference || '—')}</span></div>` : ''}
      </div>`;
  }

  // ------------------------------------------------------------------ paso 1: pago
  #renderPaymentStep() {
    $('coStep').innerHTML = `
      <p class="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">¿Cómo pagará el cliente?</p>
      <div id="coMethods" class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-5">
        ${PAYMENTS.map(p => `
          <button type="button" data-method="${p.id}" class="seg-btn flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center ${this.method === p.id ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}">
            ${icon(p.icon, 'w-6 h-6')}<span class="text-xs font-bold">${p.label}</span><span class="text-[10px] opacity-70">${p.hint}</span>
          </button>`).join('')}
      </div>
      <div id="coMethod">${this.method ? '' : '<div class="rounded-xl border-2 border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">Elige un método de pago para continuar.</div>'}</div>`;
    $('coMethods').onclick = (e) => {
      const btn = e.target.closest('[data-method]');
      if (!btn || this.busy) return;
      this.method = btn.dataset.method;
      this.#stopTimer();
      this.#renderPaymentStep();
    };
    if (this.method) this.#renderMethod();
  }

  #renderMethod() {
    ({ TARJETA_CREDITO: () => this.#renderCard(), YAPE_PLIN: () => this.#renderWallet(), TRANSFERENCIA: () => this.#renderTransfer(), EFECTIVO: () => this.#renderCash() })[this.method]?.();
  }

  /** Muestra una pantalla de "procesando" con pasos mientras se espera la respuesta. */
  async #processing(lines, work) {
    this.busy = true;
    const panel = $('coMethod') || $('coStep');
    panel.innerHTML = `
      <div class="rounded-xl border border-slate-200 py-12 px-6 text-center">
        <span class="spinner dark" style="width:34px;height:34px;border-width:3px"></span>
        <ul id="coProcLines" class="mt-5 space-y-1.5 text-sm text-slate-500"></ul>
        <p class="mt-4 text-[11px] text-slate-400 flex items-center justify-center gap-1.5">${icon('lock', 'w-3.5 h-3.5')} Conexión segura simulada · no cierres esta ventana</p>
      </div>`;
    const list = $('coProcLines');
    let i = 0;
    const show = () => { if (i < lines.length) { list.insertAdjacentHTML('beforeend', `<li class="${i === lines.length - 1 ? 'text-slate-800 font-semibold' : ''}">${escapeHtml(lines[i])}</li>`); i++; } };
    show();
    const iv = setInterval(show, globalThis.__SALESIA_FAST__ ? 5 : 650);
    try { return await work(); } finally { clearInterval(iv); }
  }

  #cardVisual() {
    return `
      <div class="relative rounded-2xl p-5 text-white shadow-lg overflow-hidden mb-4" style="background:linear-gradient(135deg,#0f172a,#1e3a8a 55%,#0e7490)">
        <div class="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-white/10"></div><div class="absolute -right-2 top-16 w-32 h-32 rounded-full bg-white/5"></div>
        <div class="flex items-center justify-between relative">
          <span class="w-9 h-6 rounded bg-amber-300/90"></span>
          <span id="coCardBrand" class="text-sm font-black tracking-widest">TARJETA</span>
        </div>
        <p id="coCardNum" class="relative mt-5 text-lg sm:text-xl font-mono tracking-widest">•••• •••• •••• ••••</p>
        <div class="relative mt-4 flex items-end justify-between text-[11px]">
          <div><p class="opacity-60 text-[9px] uppercase">Titular</p><p id="coCardName" class="font-semibold tracking-wide">NOMBRE APELLIDO</p></div>
          <div class="text-right"><p class="opacity-60 text-[9px] uppercase">Vence</p><p id="coCardExp" class="font-semibold">MM/AA</p></div>
        </div>
      </div>`;
  }

  #renderCard(errorMsg = '') {
    const total = this.sale.totals.total;
    $('coMethod').innerHTML = `
      ${this.#cardVisual()}
      <div class="grid grid-cols-2 gap-3 text-xs">
        <label class="col-span-2"><span class="font-semibold text-slate-700 block mb-1">Número de tarjeta</span>
          <input id="coNumber" inputmode="numeric" autocomplete="off" placeholder="0000 0000 0000 0000" maxlength="23" class="w-full p-2.5 rounded-lg border border-slate-300 font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-blue-500"></label>
        <label class="col-span-2"><span class="font-semibold text-slate-700 block mb-1">Titular de la tarjeta</span>
          <input id="coHolder" autocomplete="off" placeholder="COMO APARECE EN LA TARJETA" class="w-full p-2.5 rounded-lg border border-slate-300 uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"></label>
        <label><span class="font-semibold text-slate-700 block mb-1">Vencimiento</span>
          <input id="coExpiry" inputmode="numeric" autocomplete="off" placeholder="MM/AA" maxlength="5" class="w-full p-2.5 rounded-lg border border-slate-300 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"></label>
        <label><span class="font-semibold text-slate-700 block mb-1">CVV</span>
          <input id="coCvv" type="password" inputmode="numeric" autocomplete="off" placeholder="•••" maxlength="4" class="w-full p-2.5 rounded-lg border border-slate-300 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"></label>
      </div>
      <p id="coCardError" class="${errorMsg ? '' : 'hidden'} mt-3 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">${escapeHtml(errorMsg)}</p>
      <button type="button" id="coPay" class="mt-4 w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md flex items-center justify-center gap-2">${icon('lock', 'w-4 h-4')} Pagar ${formatCurrency(total)}</button>
      <div class="mt-4 rounded-xl bg-amber-50 border border-amber-200 p-3 text-[11px] text-amber-900">
        <p class="font-bold mb-1">Entorno de simulación: no uses una tarjeta real.</p>
        <div class="flex flex-wrap gap-1.5">${TEST_CARDS.map(t => `<button type="button" data-testcard="${t.number}" class="px-2 py-1 rounded-md bg-white border border-amber-200 hover:bg-amber-100 font-semibold">${t.label}</button>`).join('')}</div>
        <p class="mt-1.5 text-amber-700">Cualquier titular, vencimiento futuro y CVV de 3 dígitos. Código 3-D Secure: <span class="font-mono font-bold">${OTP_CODE}</span></p>
      </div>`;

    const num = $('coNumber'), holder = $('coHolder'), exp = $('coExpiry'), cvv = $('coCvv');
    const paint = () => {
      const brand = detectBrand(this.card.number);
      $('coCardBrand').innerText = brand.label;
      const digits = onlyDigits(this.card.number);
      $('coCardNum').innerText = digits ? formatCardNumber(digits) : '•••• •••• •••• ••••';
      $('coCardName').innerText = (this.card.name || 'NOMBRE APELLIDO').toUpperCase();
      $('coCardExp').innerText = this.card.expiry || 'MM/AA';
      cvv.maxLength = brand.cvvLen;
    };
    num.value = formatCardNumber(this.card.number); holder.value = this.card.name; exp.value = this.card.expiry; cvv.value = this.card.cvv;
    num.oninput = () => { this.card.number = onlyDigits(num.value).slice(0, 19); num.value = formatCardNumber(this.card.number); paint(); };
    holder.oninput = () => { this.card.name = holder.value.toUpperCase(); paint(); };
    exp.oninput = () => { this.card.expiry = formatExpiry(exp.value); exp.value = this.card.expiry; paint(); };
    cvv.oninput = () => { this.card.cvv = onlyDigits(cvv.value); cvv.value = this.card.cvv; };
    $('coMethod').querySelectorAll('[data-testcard]').forEach(b => {
      b.onclick = () => {
        this.card.number = b.dataset.testcard;
        if (!this.card.name) this.card.name = 'CLIENTE DE PRUEBA';
        if (!this.card.expiry) this.card.expiry = '12/30';
        if (!this.card.cvv) this.card.cvv = '123';
        this.#renderCard();
      };
    });
    $('coPay').onclick = () => this.#payCard();
    paint();
  }

  async #payCard() {
    if (this.busy) return;
    const err = validateCard(this.card);
    if (err) {
      const box = $('coCardError');
      box.innerText = err.message; box.classList.remove('hidden');
      $({ number: 'coNumber', name: 'coHolder', expiry: 'coExpiry', cvv: 'coCvv' }[err.field])?.focus();
      return;
    }
    const total = this.sale.totals.total;
    const res = await this.#processing(
      ['Validando los datos de la tarjeta…', 'Conectando con el banco emisor…', `Autorizando ${formatCurrency(total)}…`],
      () => PaymentGateway.authorize({ number: this.card.number, amount: total })
    );
    this.busy = false;
    if (res.status === 'DECLINED') { this.#renderCard(`Pago rechazado: ${res.reason}`); return; }
    if (res.status === 'REQUIRES_3DS') { this.#render3ds(res); return; }
    this.#approve({ method: 'TARJETA_CREDITO', reference: res.reference, authCode: res.authCode, cardBrand: res.brand, last4: res.last4 });
  }

  #render3ds(auth, attempts = 0, message = '') {
    $('coMethod').innerHTML = `
      <div class="rounded-xl border border-slate-200 p-6 text-center">
        <span class="inline-flex w-12 h-12 rounded-full bg-blue-50 text-blue-600 items-center justify-center mb-3">${icon('lock', 'w-6 h-6')}</span>
        <h4 class="font-bold text-slate-900">Verificación 3-D Secure</h4>
        <p class="text-xs text-slate-500 mt-1 mb-4">Tu banco envió un código de 6 dígitos al celular terminado en ••• 482 (simulado).<br>Para esta demostración el código es <span class="font-mono font-bold text-slate-800">${OTP_CODE}</span>.</p>
        <input id="coOtp" inputmode="numeric" maxlength="6" placeholder="000000" class="w-40 text-center text-2xl font-mono tracking-[.4em] p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500">
        <p id="coOtpError" class="${message ? '' : 'hidden'} mt-3 text-xs font-semibold text-rose-700">${escapeHtml(message)}</p>
        <div class="mt-4 flex justify-center gap-2">
          <button type="button" id="coOtpCancel" class="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold">Cancelar</button>
          <button type="button" id="coOtpOk" class="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold">Verificar y pagar</button>
        </div>
      </div>`;
    $('coOtp').focus();
    $('coOtpCancel').onclick = () => this.#renderCard('Pago cancelado. Puedes intentar con otra tarjeta.');
    $('coOtpOk').onclick = async () => {
      const code = $('coOtp').value;
      const res = await this.#processing(['Verificando el código con tu banco…'], () => PaymentGateway.verify3ds(code));
      this.busy = false;
      if (res.ok) { this.#approve({ method: 'TARJETA_CREDITO', reference: res.reference, authCode: res.authCode, cardBrand: auth.brand, last4: auth.last4, secure3ds: true }); return; }
      if (attempts + 1 >= 3) { this.#renderCard('Pago rechazado: la autenticación 3-D Secure falló 3 veces.'); return; }
      this.#render3ds(auth, attempts + 1, `Código incorrecto. Te quedan ${2 - attempts} intento(s).`);
    };
  }

  #renderWallet() {
    const s = this.sale;
    let seconds = 300;
    $('coMethod').innerHTML = `
      <div class="rounded-xl border border-slate-200 p-5">
        <div class="flex flex-col sm:flex-row items-center gap-5">
          <div class="p-2.5 bg-white rounded-xl border border-slate-200 shadow-sm">${pseudoQrSvg(`${s.id}|${s.totals.total}`, 150)}</div>
          <div class="text-center sm:text-left">
            <p class="text-xs text-slate-500">Escanea con Yape o Plin, o paga al número</p>
            <p class="text-2xl font-black font-mono text-slate-900 my-1">999 888 777</p>
            <p class="text-xs text-slate-500">${escapeHtml(this.company.name || 'SalesIA Enterprise S.A.C.')}</p>
            <p class="mt-2 text-lg font-extrabold text-purple-700">${formatCurrency(s.totals.total)}</p>
            <p class="text-[11px] text-slate-400 mt-1">El QR vence en <span id="coTimer" class="font-mono font-bold text-slate-600">05:00</span> · QR de demostración, no es escaneable</p>
          </div>
        </div>
        <button type="button" id="coWalletPaid" class="mt-5 w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm">Ya pagué desde mi app (simular)</button>
      </div>`;
    this.#stopTimer();
    this.timer = setInterval(() => {
      seconds -= 1;
      const el = $('coTimer');
      if (!el) { this.#stopTimer(); return; }
      el.innerText = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
      if (seconds <= 0) { this.#stopTimer(); this.#renderWallet(); }
    }, 1000);
    $('coWalletPaid').onclick = async () => {
      this.#stopTimer();
      const res = await this.#processing(['Esperando la confirmación de Yape / Plin…', 'Pago recibido'], () => PaymentGateway.confirmWallet());
      this.busy = false;
      this.#approve({ method: 'YAPE_PLIN', reference: res.reference });
    };
  }

  #renderTransfer(errorMsg = '') {
    const s = this.sale;
    $('coMethod').innerHTML = `
      <div class="rounded-xl border border-slate-200 p-5 text-xs">
        <p class="font-bold text-slate-900 mb-3">Transfiere a la cuenta de la empresa</p>
        <dl class="grid grid-cols-3 gap-y-1.5 bg-slate-50 rounded-lg p-3">
          <dt class="text-slate-500">Banco</dt><dd class="col-span-2 font-semibold">BCP (cuenta corriente en soles)</dd>
          <dt class="text-slate-500">N° de cuenta</dt><dd class="col-span-2 font-mono font-semibold">194-2233445-0-67</dd>
          <dt class="text-slate-500">CCI</dt><dd class="col-span-2 font-mono font-semibold">002-194-002233445067-12</dd>
          <dt class="text-slate-500">Titular</dt><dd class="col-span-2 font-semibold">${escapeHtml(this.company.name || 'SalesIA Enterprise S.A.C.')}</dd>
          <dt class="text-slate-500">Monto</dt><dd class="col-span-2 font-mono font-extrabold text-blue-600">${formatCurrency(s.totals.total)}</dd>
        </dl>
        <div class="grid grid-cols-2 gap-3 mt-4">
          <label><span class="font-semibold text-slate-700 block mb-1">Banco de origen</span><input id="coBank" placeholder="Ej. Interbank" class="w-full p-2.5 rounded-lg border border-slate-300"></label>
          <label><span class="font-semibold text-slate-700 block mb-1">N° de operación</span><input id="coOp" inputmode="numeric" placeholder="Mínimo 6 dígitos" class="w-full p-2.5 rounded-lg border border-slate-300 font-mono"></label>
        </div>
        <p id="coTransferError" class="${errorMsg ? '' : 'hidden'} mt-3 font-semibold text-rose-700">${escapeHtml(errorMsg)}</p>
        <button type="button" id="coTransferOk" class="mt-4 w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm">Confirmar transferencia</button>
      </div>`;
    $('coBank').value = this.bank.origin; $('coOp').value = this.bank.operation;
    $('coBank').oninput = () => { this.bank.origin = $('coBank').value; };
    $('coOp').oninput = () => { this.bank.operation = onlyDigits($('coOp').value); $('coOp').value = this.bank.operation; };
    $('coTransferOk').onclick = async () => {
      if (onlyDigits(this.bank.operation).length < 6) { $('coTransferError').innerText = 'Escribe el N° de operación (mínimo 6 dígitos).'; $('coTransferError').classList.remove('hidden'); return; }
      const res = await this.#processing(['Verificando la operación en el banco…', 'Transferencia confirmada'], () => PaymentGateway.confirmTransfer(this.bank.operation));
      this.busy = false;
      this.#approve({ method: 'TRANSFERENCIA', reference: res.reference, bank: this.bank.origin || '—' });
    };
  }

  #renderCash() {
    const total = this.sale.totals.total;
    const quick = [...new Set([Math.ceil(total), Math.ceil(total / 10) * 10, Math.ceil(total / 50) * 50, Math.ceil(total / 100) * 100, Math.ceil(total / 200) * 200])].filter(v => v >= total).slice(0, 4);
    $('coMethod').innerHTML = `
      <div class="rounded-xl border border-slate-200 p-5 text-xs">
        <p class="text-slate-500">Total a cobrar</p>
        <p class="text-3xl font-black font-mono text-slate-900 mb-4">${formatCurrency(total)}</p>
        <label><span class="font-semibold text-slate-700 block mb-1">Monto recibido (S/)</span>
          <input id="coReceived" type="number" min="0" step="0.01" class="w-full p-3 rounded-lg border border-slate-300 font-mono text-lg font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"></label>
        <div class="flex flex-wrap gap-2 mt-3">${quick.map(v => `<button type="button" data-quickcash="${v}" class="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 font-semibold text-slate-700">${v === Math.ceil(total) && v === total ? 'Exacto' : `S/ ${v}`}</button>`).join('')}</div>
        <div class="mt-4 rounded-lg px-4 py-3 bg-slate-50 flex items-center justify-between"><span class="text-slate-500">Vuelto</span><span id="coChange" class="text-xl font-black font-mono text-slate-400">S/ 0.00</span></div>
        <button type="button" id="coCashOk" disabled class="mt-4 w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed">Registrar cobro en efectivo</button>
      </div>`;
    const input = $('coReceived');
    const update = () => {
      const v = parseFloat(input.value) || 0;
      this.cash.received = input.value;
      const ok = v + 0.0001 >= total;
      $('coChange').innerText = formatCurrency(ok ? v - total : 0);
      $('coChange').className = `text-xl font-black font-mono ${ok ? 'text-emerald-600' : 'text-slate-400'}`;
      $('coCashOk').disabled = !ok;
    };
    input.oninput = update;
    $('coMethod').querySelectorAll('[data-quickcash]').forEach(b => { b.onclick = () => { input.value = b.dataset.quickcash; update(); }; });
    if (this.cash.received) { input.value = this.cash.received; update(); }
    $('coCashOk').onclick = async () => {
      const received = parseFloat(input.value);
      await this.#processing(['Registrando el cobro en caja…'], () => wait(700));
      this.busy = false;
      this.#approve({ method: 'EFECTIVO', reference: `CAJA-${this.sale.id}`, received, change: Number((received - total).toFixed(2)) });
    };
  }

  async #approve(payment) {
    try {
      this.app.billing.registerPayment(this.saleId, payment);
    } catch (e) {
      this.app.showToast(e.message, 'error');
      this.#render();
      return;
    }
    this.busy = true;
    const panel = $('coMethod') || $('coStep');
    panel.innerHTML = `
      <div class="rounded-xl border border-emerald-200 bg-emerald-50 py-12 px-6 text-center">
        <span class="pop-in inline-flex w-16 h-16 rounded-full bg-emerald-600 text-white items-center justify-center mb-3">${icon('check', 'w-9 h-9')}</span>
        <h4 class="text-lg font-extrabold text-emerald-900">Pago aprobado</h4>
        <p class="text-xs text-emerald-800 mt-1">${escapeHtml(paymentLabel(payment.method))}${payment.last4 ? ` •••• ${escapeHtml(payment.last4)}` : ''} · Ref. <span class="font-mono">${escapeHtml(payment.reference)}</span>${payment.authCode ? ` · Autorización <span class="font-mono">${escapeHtml(payment.authCode)}</span>` : ''}</p>
      </div>`;
    this.app.render();
    await wait(1300);
    this.busy = false;
    this.step = 2;
    this.#render();
  }

  // ------------------------------------------------------------------ paso 2: comprobante
  #renderDocStep(errorMsg = '') {
    const total = this.sale.totals.total;
    const d = this.doc;
    const isFactura = d.type === 'FACTURA';
    const needsId = total >= BOLETA_ID_LIMIT;
    const tile = (type, title, desc) => `
      <button type="button" data-doctype="${type}" class="seg-btn text-left p-4 rounded-xl border ${d.type === type ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-slate-200 bg-white hover:border-slate-300'}">
        <span class="block text-sm font-extrabold ${d.type === type ? 'text-blue-700' : 'text-slate-800'}">${title}</span>
        <span class="block text-[11px] text-slate-500 mt-0.5">${desc}</span>
      </button>`;
    const idButtons = ['DNI', 'RUC', ...(needsId ? [] : ['SIN'])].map(t => `
      <button type="button" data-iddoc="${t}" class="seg-btn px-3 py-1.5 rounded-lg border text-xs font-semibold ${d.docType === t ? 'border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-500' : 'border-slate-200 bg-white text-slate-600'}">${t === 'SIN' ? 'Sin documento' : t}</button>`).join('');

    $('coStep').innerHTML = `
      <p class="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">¿Qué comprobante necesita el cliente?</p>
      <div class="grid grid-cols-2 gap-3 mb-5">
        ${tile('BOLETA', 'Boleta de venta', 'Consumidor final')}
        ${tile('FACTURA', 'Factura electrónica', 'Requiere RUC · crédito fiscal')}
      </div>
      <div class="rounded-xl border border-slate-200 p-4 space-y-3 text-xs">
        ${isFactura ? `
          <label><span class="font-semibold text-slate-700 block mb-1">RUC del cliente</span>
            <input id="coDocNumber" inputmode="numeric" maxlength="11" placeholder="11 dígitos (empieza con 10 o 20)" class="w-full p-2.5 rounded-lg border border-slate-300 font-mono"></label>
          <label><span class="font-semibold text-slate-700 block mb-1">Razón social</span>
            <input id="coDocName" class="w-full p-2.5 rounded-lg border border-slate-300"></label>
          <label><span class="font-semibold text-slate-700 block mb-1">Dirección fiscal</span>
            <input id="coDocAddress" placeholder="Av. / Jr. / Calle..." class="w-full p-2.5 rounded-lg border border-slate-300"></label>`
        : `
          <div><span class="font-semibold text-slate-700 block mb-1.5">Identificación del cliente</span><div class="flex flex-wrap gap-2">${idButtons}</div>
            ${needsId ? `<p class="mt-1.5 text-[11px] text-amber-700">Las boletas desde S/ ${BOLETA_ID_LIMIT} exigen identificar al cliente (DNI o RUC).</p>` : ''}</div>
          ${d.docType !== 'SIN' ? `<label><span class="font-semibold text-slate-700 block mb-1">${d.docType === 'RUC' ? 'RUC' : 'DNI'}</span>
            <input id="coDocNumber" inputmode="numeric" maxlength="${d.docType === 'RUC' ? 11 : 8}" class="w-full p-2.5 rounded-lg border border-slate-300 font-mono"></label>` : ''}
          <label><span class="font-semibold text-slate-700 block mb-1">Nombre del cliente</span>
            <input id="coDocName" placeholder="${d.docType === 'SIN' ? 'CLIENTE VARIOS' : ''}" class="w-full p-2.5 rounded-lg border border-slate-300"></label>`}
      </div>
      <p id="coDocError" class="${errorMsg ? '' : 'hidden'} mt-3 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">${escapeHtml(errorMsg)}</p>
      <button type="button" id="coEmit" class="mt-4 w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md">Emitir ${isFactura ? 'factura' : 'boleta'} electrónica</button>
      <p class="mt-2 text-[11px] text-slate-400 text-center">Validación con SUNAT / RENIEC simulada.</p>`;

    const num = $('coDocNumber'), name = $('coDocName'), addr = $('coDocAddress');
    if (num) { num.value = d.docNumber; num.oninput = () => { d.docNumber = onlyDigits(num.value); num.value = d.docNumber; }; }
    if (name) { name.value = d.name; name.oninput = () => { d.name = name.value; }; }
    if (addr) { addr.value = d.address; addr.oninput = () => { d.address = addr.value; }; }
    $('coStep').querySelectorAll('[data-doctype]').forEach(b => {
      b.onclick = () => {
        d.type = b.dataset.doctype;
        if (d.type === 'FACTURA') { d.docType = 'RUC'; if (!validateRuc(d.docNumber)) d.docNumber = ''; }
        else if (d.docType === 'SIN' && needsId) d.docType = 'DNI';
        this.#renderDocStep();
      };
    });
    $('coStep').querySelectorAll('[data-iddoc]').forEach(b => { b.onclick = () => { d.docType = b.dataset.iddoc; if (d.docType === 'SIN') d.docNumber = ''; this.#renderDocStep(); }; });
    $('coEmit').onclick = () => this.#emit();
  }

  async #emit() {
    const d = this.doc;
    const total = this.sale.totals.total;
    const isFactura = d.type === 'FACTURA';
    let error = '';
    if (isFactura) {
      if (!validateRuc(d.docNumber)) error = 'El RUC debe tener 11 dígitos y empezar con 10 o 20.';
      else if (String(d.name).trim().length < 3) error = 'Escribe la razón social del cliente.';
    } else if (d.docType === 'DNI' && !validateDni(d.docNumber)) error = 'El DNI debe tener exactamente 8 dígitos.';
    else if (d.docType === 'RUC' && !validateRuc(d.docNumber)) error = 'El RUC debe tener 11 dígitos y empezar con 10 o 20.';
    else if (d.docType === 'SIN' && total >= BOLETA_ID_LIMIT) error = `Para boletas desde S/ ${BOLETA_ID_LIMIT} debes identificar al cliente.`;
    else if (d.docType !== 'SIN' && String(d.name).trim().length < 3) error = 'Escribe el nombre del cliente.';
    if (error) { this.#renderDocStep(error); return; }

    const customer = {
      docType: d.docType === 'SIN' ? 'SIN' : (isFactura ? 'RUC' : d.docType),
      docNumber: d.docType === 'SIN' ? '' : d.docNumber,
      name: String(d.name).trim() || 'CLIENTE VARIOS',
      address: String(d.address || '').trim()
    };
    await this.#processing(
      [isFactura ? 'Validando el RUC en SUNAT (simulado)…' : 'Validando los datos del cliente…', 'Generando el comprobante electrónico…', 'Firmando digitalmente y enviando a SUNAT (simulado)…'],
      () => wait(2100)
    );
    this.busy = false;
    try {
      this.app.billing.issueDocument(this.saleId, { type: d.type, customer });
    } catch (e) {
      this.#renderDocStep(e.message);
      return;
    }
    this.step = 3;
    this.app.render();
    this.#render();
  }

  // ------------------------------------------------------------------ paso 3: comprobante emitido
  #renderDone() {
    const sale = this.sale;
    const inv = sale.invoice;
    const email = this.app.state.storage.get('customers', []).find(c => c.id === sale.customerId)?.email;
    $('coBody').innerHTML = `
      <div class="no-print flex flex-col md:flex-row md:items-center justify-between gap-3 mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <div class="flex items-center gap-3"><span class="pop-in w-9 h-9 rounded-full bg-emerald-600 text-white inline-flex items-center justify-center">${icon('check', 'w-5 h-5')}</span>
          <div><p class="text-sm font-extrabold text-emerald-900">${inv.type === 'FACTURA' ? 'Factura' : 'Boleta'} <span class="font-mono">${escapeHtml(inv.fullNumber)}</span> emitida</p>
          <p class="text-[11px] text-emerald-700">Venta cobrada y facturada · ${formatCurrency(sale.totals.total)}</p></div></div>
        <div class="flex flex-wrap gap-2">
          <button type="button" id="coPrint" class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold">${icon('printer', 'w-4 h-4')} Imprimir / Guardar PDF</button>
          <button type="button" id="coMail" class="px-3.5 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold">Enviar por correo</button>
          <button type="button" id="coNewSale" class="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold">Nueva venta</button>
        </div>
      </div>
      <div class="print-scroll bg-slate-100 rounded-xl p-4 sm:p-6 overflow-x-auto">${renderInvoiceHtml(sale, this.company)}</div>`;
    $('coPrint').onclick = () => printModal('checkoutModal');
    $('coMail').onclick = () => this.app.showToast(`Comprobante ${inv.fullNumber} enviado a ${email || 'el correo del cliente'} (simulado).`, 'success');
    $('coNewSale').onclick = () => { Modal.close('checkoutModal', true); this.app.docModal.open('sale'); };
  }
}
