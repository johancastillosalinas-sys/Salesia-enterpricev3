/**
 * @file print.js
 * @description Imprime solo el contenido de una ventana emergente (el resto de la pantalla se oculta
 * con las reglas @media print de styles.css).
 */

export function printModal(overlayId) {
  const el = document.getElementById(overlayId);
  if (!el) return;
  el.classList.add('print-host');
  document.body.dataset.print = '1';
  const cleanup = () => {
    el.classList.remove('print-host');
    delete document.body.dataset.print;
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
}

/** Descarga un texto como archivo (CSV con BOM para que Excel respete los acentos). */
export function downloadText(filename, text, mime = 'text/csv;charset=utf-8', bom = true) {
  const blob = new Blob([(bom ? '\ufeff' : '') + text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
