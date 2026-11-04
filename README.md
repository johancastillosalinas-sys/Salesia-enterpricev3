# SalesIA Enterprise — Sistema Web de Gestión de Ventas

> **Versión 1.1** — Ventas, clientes, productos, inventario y reportes, con persistencia local.

---

## 🏗️ Estructura del Proyecto

El proyecto respeta la jerarquía definida en el Plan de Desarrollo. Hay **una sola entrada web** (`index.html` en la raíz, que es donde Vite la busca) y **un solo archivo de estilos**.

```text
salesia_enterprice2/
├── index.html                       # Única entrada web del sistema
├── styles.css                       # Sistema de diseño corporativo (Azul, Cyan, Grises)
├── package.json
├── frontend/
│   └── src/
│       ├── app/
│       │   ├── app.js               # Orquestador: arranque, router, roles y eventos globales
│       │   ├── router.js            # Enrutador desacoplado con guardia de acceso por rol
│       │   ├── permissions.js       # Matriz de acceso por rol (RF-01)
│       │   └── state.js             # Estado global e inyección de dependencias
│       ├── components/
│       │   └── chartManager.js      # Gráficos con Chart.js
│       ├── modules/                 # Un controlador por módulo; reciben la app en el constructor
│       │   ├── dashboard/           # Inicio: indicadores, tendencia, top productos y alertas de stock
│       │   ├── customers/           # RF-03: customersController.js + customersView.js
│       │   ├── products/            # RF-04: productsController.js + productsView.js
│       │   ├── sales/               # Ventas: salesController.js (venta consecutiva)
│       │   ├── quotes/              # Cotizaciones: quotesController.js + quoteEngine.js (Sandbox desacoplado)
│       │   ├── inventory/           # RF-08: inventoryController.js (existencias y movimientos)
│       │   ├── reports/             # RF-20: reportsController.js
│       │   ├── audit/               # RF-22: auditController.js
│       │   └── history/             # historyController.js (historial y comprobantes)
│       ├── services/
│       │   ├── api.js               # Simulación de endpoints REST (Sección 16)
│       │   ├── fifoQueueService.js  # Procesador de cola FIFO en tiempo real
│       │   ├── sequenceService.js   # Generador atómico de números correlativos (#0001...)
│       │   └── storageService.js    # Persistencia particionada en LocalStorage
│       ├── hooks/
│       │   ├── useEventBus.js       # Bus Pub/Sub para desacoplamiento reactivo
│       │   └── useStressTest.js     # Banco de pruebas de la Regla 1 vs 100
│       ├── types/
│       │   └── schemas.js           # Esquemas de datos de la Sección 12
│       └── utils/
│           ├── formatters.js        # Moneda (PEN), fechas y escape de HTML (escapeHtml)
│           └── validators.js        # Validadores de entrada (RUC, DNI, correo)
├── database/
│   ├── seeds/
│   │   └── initialSeed.js           # Catálogos base de productos, clientes y roles
│   └── migrations/
│       └── schemaMigration.js       # Inicialización y prevención de Schema Drift
└── docs/
    └── GUIA_DE_EVALUACION_ACADEMICA.md
```

> La carpeta `dist/` aparece al ejecutar `npm run build`. Es código generado: no se edita ni se versiona.

---

## 🧩 Arquitectura de la Aplicación

`app.js` solo orquesta: crea el estado, el router y un **controlador por módulo**, y decide qué controlador dibuja cada pantalla. Cada controlador vive en su carpeta, recibe la aplicación (`app`) y usa `app.state` (almacenamiento y API) y `app.showToast` (avisos).

```text
router.navigate('customers')
   └─► guardia de acceso (permissions.js)
        └─► app.renderRoute('customers')
             └─► app.customers.render()      # CustomersController
```

Las reglas de negocio (validar un cliente, reabastecer stock, emitir una venta) viven en `services/api.js`, y cada operación crítica deja un registro en Auditoría (RF-22).

---

## 🔐 Roles y Acceso por Módulo (RF-01)

Módulos del menú: **Inicio, Ventas, Cotizaciones, Clientes, Productos, Inventario, Reportes, Auditoría e Historial de Ventas**. (Los identificadores internos de ruta no cambian: `dashboard`, `pos`, `quotes`, etc.)

El selector **Rol Activo** del encabezado cambia el usuario actual, y el menú lateral solo muestra los módulos permitidos para ese rol. Si el rol no puede ver la pantalla actual, la app lo lleva al primer módulo que sí le corresponde. La matriz se define en un solo lugar: `frontend/src/app/permissions.js`.

| Rol | Módulos permitidos |
|---|---|
| Administrador | Todos |
| Gerente | Inicio, Reportes, Historial de Ventas |
| Vendedor | Ventas, Cotizaciones, Clientes, Historial de Ventas |
| Analista | Inicio, Reportes |
| Almacén | Productos, Inventario |

Auditoría (RF-22) es exclusiva del Administrador.

---

## 🎯 Restricciones Críticas del Sistema

1. **Simulado sin Base de Datos (Solo LocalStorage):**  
   - Todo el estado transaccional, catálogo de productos, cotizaciones e historial persiste en `LocalStorage` mediante llaves particionadas (`salesia:sales`, `salesia:products`, `salesia:quotes`, etc.). No requiere servidores SQL ni bases de datos externas.

2. **Secuencia Estricta Consecutiva en Tiempo Real:**  
   - Implementado mediante `FifoQueueService` y `SequenceService`. Cada venta procesada obtiene un folio correlativo estricto (`TICK-0001`, `TICK-0002`...) sin saltos ni condiciones de carrera.

3. **Módulo de Cotizaciones 100% Desacoplado (Sandbox Pattern):**  
   - Las cotizaciones operan en memoria con funciones matemáticas puras. Mientras una cotización esté en estado de borrador o emitida, no descuenta existencias de inventario ni altera los indicadores de venta de Analytics hasta que el usuario hace clic en *"Convertir a Venta"*.

4. **Regla de Oro "1 vs 100 Registros":**  
   - **Con 1 registro:** respuesta inmediata, sin sobrecargar el Event Loop.  
   - **Con 100 registros:** actualización secuencial en microtareas, sin congelar la pantalla y consumiendo menos de 40 KB de LocalStorage.

5. **Indicadores del Inicio:** ventas de hoy, ingresos acumulados, tendencia de los últimos 7 días, ingresos por categoría, productos más vendidos y alertas de stock bajo.

---

## 🚀 Cómo Ejecutar el Proyecto

**Requisito:** [Node.js](https://nodejs.org) (versión LTS) y conexión a internet, porque Tailwind CSS y Chart.js se cargan desde CDN.

```powershell
# 1. Instalar dependencias (solo la primera vez, o si falta la carpeta node_modules)
npm install

# 2. Servidor de desarrollo con recarga automática
npm run dev
```

Abre la dirección que muestra la consola (normalmente `http://localhost:5173/`).

Otros comandos:

| Comando | Qué hace |
|---|---|
| `npm run build` | Genera la versión de producción en `dist/` |
| `npm run preview` | Sirve localmente la carpeta `dist/` ya compilada |
| `npm start` | Servidor estático simple (`npx serve .`), sin Vite |

> **No abras `index.html` con doble clic.** El sistema usa módulos ES6, y los navegadores los bloquean cuando el archivo se abre desde `file://`. Usa siempre un servidor (Vite, `npx serve` o *Live Server* de VS Code).

### Datos de prueba

Los datos viven en el `LocalStorage` del navegador, bajo claves que empiezan con `salesia:`. Para volver al estado inicial usa el botón **Reiniciar Datos** del encabezado, o borra esas claves desde las herramientas del navegador (F12 → Application → Local Storage).

---
## 📏 Reglas de Negocio Destacadas

- **Baja lógica de clientes y productos.** Desactivar un cliente o un producto no lo borra: conserva su historial, deja de aparecer en el POS y en el Cotizador, y el sistema **rechaza cualquier venta** que lo incluya, incluso al convertir una cotización antigua. Se puede reactivar en cualquier momento.
- **Folio consecutivo sin saltos.** Las validaciones se hacen antes de asignar el número, así que una venta rechazada no consume folio (`TICK-0001`, `TICK-0002`...).
- **Stock solo por vías trazables.** El stock cambia únicamente con ventas y con el reabastecimiento desde Inventario; editar un producto no lo modifica. Cada movimiento queda en el historial de inventario y en Auditoría.
- **Meta de vendedores en Reportes.** El cumplimiento se mide contra la **meta del período** = meta mensual × máx(1, días del rango ÷ 30). Un rango corto se compara contra la meta de un mes; uno largo la escala (90 días = 3 meses). Si falta *Desde* o *Hasta* se usa la primera o la última venta registrada.
- **Exportación segura.** El CSV de Reportes contiene solo las ventas filtradas, con tildes correctas y sin que Excel ejecute fórmulas escondidas en los textos.

---

## ⚠️ Alcance y Limitaciones Conocidas

- **Persistencia local.** Todo se guarda en el navegador donde se usa el sistema: no se comparte entre equipos ni sobrevive a limpiar los datos del sitio. La auditoría conserva los últimos 200 registros y los movimientos de inventario, los más recientes.
- **Permisos solo en la interfaz.** El control por rol oculta módulos y bloquea la navegación, pero al ser un sistema simulado cualquiera con la consola del navegador puede cambiar de rol o llamar a la API. La seguridad real exigirá validar los permisos en un backend.

- **Archivos heredados.** Quedan sin uso `modules/auth/authModule.js`, `modules/dashboard/dashboardView.js`, `modules/reports/reportsView.js` y `hooks/useLocalStorage.js`.
---

## 🧭 Interfaz tipo ERP

- **Ventanas emergentes** para crear: *Nueva venta*, *Nueva cotización*, *Nuevo cliente* y *Nuevo producto*. Se abren desde el botón de cada módulo, desde las **Acciones rápidas** del Inicio o con **Ctrl + K**.
- **Sin listas desplegables** para elegir datos: cliente, vendedor y productos se eligen en **tarjetas** con búsqueda, filtros rápidos y "Mostrar más", pensadas para muchos registros. Desde el mismo selector se puede **dar de alta** un cliente o producto nuevo y queda elegido.
- **Clientes y Productos**: indicadores arriba, filtros por chips, búsqueda sin importar tildes y **paginación** de 10 en 10.
- **Buscador global (Ctrl + K)**: crea, salta de módulo o encuentra un cliente o producto por su nombre.
- Confirmaciones con ventana propia (ya no usa `confirm()` del navegador). `Esc` cierra la ventana de arriba; si hay un borrador de venta, pregunta antes de descartarlo.
- Todo sigue simulado en **LocalStorage**.

Archivos nuevos: `components/modal.js`, `entityPicker.js`, `commandPalette.js`, `uiKit.js`, `modules/sales/docModal.js`, `payments.js` y `app/pages.js`.

---

## 🔐 Inicio de sesión, datos en cero y facturación (versión 2)

**Acceso.** Al abrir el sistema aparece el login. Cuentas de demostración (contraseña de todas: `Salesia2026`):
`admin@salesia.pe` · `gerente@salesia.pe` · `ventas@salesia.pe` (vendedor) · `analitica@salesia.pe` · `almacen@salesia.pe`.
"Recordarme" guarda la sesión; sin marcarlo dura solo mientras la pestaña esté abierta. Tras 5 intentos fallidos se bloquea 30 s.
"Continuar con Google" es una simulación (elige una de las cuentas demo). Las contraseñas se guardan como huella SHA-256.

**Sistema en 0 registros.** No hay clientes, productos, ventas ni cotizaciones al empezar (solo empresa, roles y cuentas).
Todo se llena con **Importar datos** (módulo solo para el administrador):

1. Sube un `.csv` (acepta coma, punto y coma o tabulación; tildes y comillas).
2. Revisa qué columna es cada dato (se reconocen solas por su nombre).
3. Revisa el resumen y los errores fila por fila, y elige *Agregar* o *Reemplazar todo*.
4. Se cargan clientes, productos, categorías, vendedores, **ventas ya cobradas y con boleta/factura**, cotizaciones y el kárdex de inventario.

Archivos listos en `database/`: `ejemplo_salesia.csv` (400 filas) y `plantilla_salesia.csv`. También puedes pulsar *Cargar datos de ejemplo* en la pantalla.
Si algo falla al importar (por ejemplo, no hay espacio en LocalStorage) no se modifica ningún dato.

**Venta → cobro → comprobante.** Al registrar una venta queda *pendiente de cobro* (el stock se reserva). Se abre **Cobro y facturación**:
1. **Pago** en una pasarela simulada: tarjeta (número con validación Luhn, marca, vencimiento, CVV, 3-D Secure), Yape/Plin (QR), transferencia o efectivo con vuelto.
2. **Comprobante**: boleta (S/ 700 o más exige DNI/RUC) o factura (RUC).
3. **Listo**: documento con monto en letras, QR y hash, para imprimir o guardar como PDF.

Tarjetas de prueba: `4111 1111 1111 1111` aprobada · `4000 0000 0000 0002` rechazada · `4000 0000 0000 3220` pide código 3-D Secure `123456`.
De la tarjeta solo se guarda la marca y los últimos 4 dígitos. El módulo **Facturación** lista pendientes, cobradas sin comprobante y emitidos; las ventas pendientes no cuentan en los ingresos y se pueden anular (el stock vuelve).

**Reportes con vista previa.** 9 reportes (ejecutivo, ventas, facturación, productos, inventario, clientes, vendedores, cotizaciones, auditoría), cada uno como documento con encabezado, indicadores, barras y tablas.
Se abren desde **Reportes** y desde un botón en cada módulo (Inicio, Ventas, Facturación, Clientes, Productos, Inventario, Cotizaciones, Historial y Auditoría). Antes de descargar puedes cambiar el período; se descarga como **PDF** (impresión del documento) o **Excel (CSV)**.

---

## 🛡️ Análisis de seguridad de proyectos (módulo "Seguridad")

Menú lateral → **Seguridad → Análisis de seguridad** (solo administrador). Sirve para evaluar **cualquier proyecto** comprimido en `.zip`:

1. Sube el `.zip` (arrastrando o eligiéndolo). Se valida y se muestra cuántos archivos trae.
2. Pulsa **Analizar proyecto**. Hay barra de progreso y botón *Cancelar*. Se leen hasta 30.000 archivos / 250 MB (4.000 archivos y 160.000 líneas tardan ~3 s).
3. Verás el **porcentaje de seguridad** (0–100 %, grado A–E), el puntaje por categoría, los hallazgos con su ubicación, la corrección recomendada y la referencia CWE/OWASP.
4. **Ver informe PDF** abre una **vista previa** como documento (portada, resumen ejecutivo, alcance y metodología, inventario, resultados por categoría, hallazgos detallados, dependencias, controles y plan de remediación). Desde ahí exportas a **PDF** (impresión → *Guardar como PDF*), **CSV** de hallazgos o **JSON**.

**Todo ocurre en tu navegador**: el ZIP no se sube a ningún servidor. Los secretos encontrados se muestran **enmascarados** (p. ej. `AKIA••••`) y nunca aparecen completos en pantalla, PDF, CSV ni JSON.

**Qué revisa** (72 reglas): claves y tokens expuestos, llaves privadas, `.env`, inyección SQL y de comandos, `eval`, XSS, deserialización insegura, TLS desactivado, hashes débiles, cookies y JWT inseguros, CORS abierto, Docker/CI mal configurados, dependencias con vulnerabilidades conocidas (lista indicativa sin conexión), falta de lockfile, `.gitignore`, pruebas y política de seguridad. Detecta además controles positivos (helmet, bcrypt, rate limiting, CodeQL…).

**Cómo se calcula el porcentaje**: cada tipo de hallazgo resta según su severidad (crítica 20, alta 10, media 5, baja 2, informativa 0,5; +25 % por repetición) y las buenas prácticas suman un bono; se convierte con `100 × e^(−penalización/55)`. Un hallazgo crítico limita el puntaje a 64 %, y uno alto a 89 %.

**Límites**: es análisis *estático* con heurísticas por línea (puede haber falsos positivos y negativos); no ejecuta el programa ni sustituye una auditoría o pruebas de penetración. Confirma las dependencias con `npm audit`, `pip-audit` u OWASP Dependency-Check.

Para probarlo hay dos ZIP de demostración en `docs/ejemplos-seguridad/` (datos 100 % inventados): `proyecto_vulnerable_demo.zip` y `proyecto_seguro_demo.zip`.
