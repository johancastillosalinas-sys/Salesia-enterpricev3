# Guía de Evaluación y Sustentación Técnica — SalesIA Enterprise
## Cumplimiento Riguroso de la Estructura y Restricciones del Proyecto

### 1. Correspondencia Exacta con la Estructura del Documento (Sección 11)

```
salesia-enterprise/
├── frontend/
│   ├── index.html
│   ├── styles.css
│   └── src/
│       ├── app/
│       │   ├── app.js               # Bootstrap y montaje del sistema
│       │   ├── router.js            # Ruteo por módulos funcionales
│       │   ├── permissions.js       # RF-01: Acceso por rol a cada módulo
│       │   └── state.js             # Estado global e inyección de dependencias
│       ├── components/
│       │   └── chartManager.js      # Gráficos con Chart.js
│       ├── modules/
│       │   ├── dashboard/           # RF-09: Dashboard ejecutivo y monitor FIFO
│       │   ├── customers/           # RF-03: Catálogo y fichas de clientes
│       │   ├── products/            # RF-04: Catálogo maestro de productos y categorías
│       │   ├── sales/               # RF-06: Venta transaccional consecutiva (TPV)
│       │   ├── quotes/              # Módulo de cotizaciones 100% independiente (Sandbox)
│       │   ├── inventory/           # RF-08: Existencias, stock mínimo y reabastecimiento
│       │   └── reports/             # RF-20: Reportes y auditoría
│       ├── services/
│       │   ├── api.js               # Simulación de endpoints REST (Sección 16)
│       │   ├── fifoQueueService.js  # Procesador transaccional en tiempo real
│       │   ├── sequenceService.js   # Generador atómico de números consecutivos
│       │   └── storageService.js    # Partición segura y control de cuota LocalStorage
│       ├── hooks/
│       │   ├── useEventBus.js       # Desacoplamiento Pub/Sub reactivo
│       │   └── useStressTest.js     # Banco de pruebas de la Regla 1 vs 100
│       ├── types/
│       │   └── schemas.js           # Modelos de datos de la Sección 12
│       └── utils/
│           ├── formatters.js        # Moneda nacional (PEN), fechas y porcentajes
│           └── validators.js        # Validación de documentos y reglas de carrito
├── database/
│   ├── seeds/
│   │   └── initialSeed.js           # Catálogos base (productos, clientes, usuarios)
│   └── migrations/
│       └── schemaMigration.js       # Inicialización y prevención de Schema Drift
└── docs/
    └── GUIA_DE_EVALUACION_ACADEMICA.md
```

---

### 2. Cumplimiento de Restricciones Críticas de Clase

| Requisito de Clase | Implementación Técnica | Evidencia en Código |
| :--- | :--- | :--- |
| **Simulado sin Base de Datos (Solo LocalStorage)** | `StorageService.js` particiona los datos en llaves independientes (`salesia:sales`, `salesia:quotes`, `salesia:products`), garantizando persistencia en el navegador sin backend externo ni servidores SQL. | `frontend/src/services/storageService.js` |
| **Secuencia Estricta Consecutiva en Tiempo Real** | Cola FIFO asíncrona (`FifoQueueService.js`) coordinada con generador correlativo atómico (`SequenceService.js`). Cada venta obtiene un número estrictamente consecutivo (#0001, #0002...) sin saltos ni duplicaciones. | `frontend/src/services/fifoQueueService.js` |
| **Cotizador 100% Desacoplado (Sandbox)** | El módulo `quoteEngine.js` calcula cotizaciones con funciones matemáticas puras sin descontar existencias ni alterar las estadísticas del Dashboard hasta que el usuario pulsa *"Convertir a Venta"*. | `frontend/src/modules/quotes/quoteEngine.js` |
| **Regla de Oro "1 vs 100 Registros"** | **Con 1 registro:** respuesta inmediata. **Con 100 registros:** actualización secuencial en microtareas sin congelar la pantalla y con menos de 40 KB de LocalStorage. |
| **Indicadores del Inicio** | Ventas de hoy, ingresos, tendencia de 7 días, ingresos por categoría, productos más vendidos y alertas de stock bajo. |
