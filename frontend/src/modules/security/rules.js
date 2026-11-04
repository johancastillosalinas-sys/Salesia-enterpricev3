/**
 * @file rules.js
 * @description Reglas del analizador estático. Cada regla describe un patrón de riesgo,
 * su severidad, su referencia CWE/OWASP y cómo corregirlo. Son heurísticas por línea:
 * pueden dar falsos positivos y no sustituyen una auditoría profesional.
 */

export const SEV = {
  critical: { label: 'Crítica', weight: 20, color: '#b91c1c', soft: '#fef2f2' },
  high: { label: 'Alta', weight: 10, color: '#ea580c', soft: '#fff7ed' },
  medium: { label: 'Media', weight: 5, color: '#ca8a04', soft: '#fefce8' },
  low: { label: 'Baja', weight: 2, color: '#2563eb', soft: '#eff6ff' },
  info: { label: 'Informativa', weight: 0.5, color: '#64748b', soft: '#f1f5f9' }
};
export const SEV_ORDER = ['critical', 'high', 'medium', 'low', 'info'];

export const CAT = {
  SECRETS: 'Secretos y credenciales',
  CODE: 'Código inseguro',
  CRYPTO: 'Criptografía y autenticación',
  DEPS: 'Dependencias',
  CONFIG: 'Configuración e infraestructura',
  HYGIENE: 'Buenas prácticas'
};
export const CATEGORIES = Object.values(CAT);

const OWASP = {
  A01: 'A01:2021 · Pérdida de control de acceso', A02: 'A02:2021 · Fallos criptográficos', A03: 'A03:2021 · Inyección',
  A04: 'A04:2021 · Diseño inseguro', A05: 'A05:2021 · Configuración de seguridad incorrecta', A06: 'A06:2021 · Componentes vulnerables y obsoletos',
  A07: 'A07:2021 · Fallos de identificación y autenticación', A08: 'A08:2021 · Fallos de integridad de software y datos', A09: 'A09:2021 · Fallos de registro y monitoreo'
};

const JS = ['js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'vue', 'svelte', 'html', 'htm'];
const PY = ['py'];
const PHP = ['php', 'phtml', 'inc'];
const JAVA = ['java', 'kt', 'kts', 'scala', 'groovy'];
const CS = ['cs', 'cshtml', 'vb'];
const GO = ['go'];
const RB = ['rb', 'erb'];
const SH = ['sh', 'bash', 'zsh'];

// ---------------------------------------------------------------- ayudas
const PLACEHOLDER = /(example|sample|changeme|change[_-]?me|your[_-]?|xxx+|\*{3,}|<[^>]+>|\$\{|\{\{|%\(|process\.env|os\.environ|getenv|env\(|dummy|placeholder|redacted|lorem|todo|null|none|undefined|false|true)/i;

export function entropy(str) {
  const freq = {};
  for (const c of str) freq[c] = (freq[c] || 0) + 1;
  return -Object.values(freq).reduce((a, n) => a + (n / str.length) * Math.log2(n / str.length), 0);
}

/** ¿Parece un secreto real y no un nombre, ruta o valor de ejemplo? */
export function looksLikeSecret(value) {
  const v = String(value || '');
  if (v.length < 8 || PLACEHOLDER.test(v)) return false;
  if (/^(https?:|\/|\.\/|\.\.\/|[a-z]:\\)/i.test(v)) return false;
  if (/^[A-Za-z]+$/.test(v) && v.length < 20) return false;
  if (/^[a-z]+([-_.][a-z]+)+$/.test(v)) return false; // nombres tipo "token-type"
  return entropy(v) >= 2.5;
}

export function maskSecret(text) {
  return String(text).replace(/[A-Za-z0-9+/_\-=.]{8,}/g, s => `${s.slice(0, 4)}••••`);
}

// ---------------------------------------------------------------- reglas por línea
export const LINE_RULES = [
  // ======================= SECRETOS
  { id: 'SEC-S01', title: 'Clave de acceso de AWS en el código', cat: CAT.SECRETS, sev: 'critical', cwe: 'CWE-798', owasp: OWASP.A07, secret: true,
    re: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/,
    what: 'Se encontró un identificador de clave de acceso de AWS. Cualquier persona con acceso al código podría usar la cuenta de nube asociada.',
    fix: 'Revoca la clave en la consola de AWS ahora mismo, genera una nueva y cárgala desde variables de entorno o un gestor de secretos (AWS Secrets Manager). Limpia el historial de Git si ya se publicó.' },
  { id: 'SEC-S02', title: 'Clave privada incluida en el proyecto', cat: CAT.SECRETS, sev: 'critical', cwe: 'CWE-321', owasp: OWASP.A02, secret: true,
    re: /-----BEGIN (RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY( BLOCK)?-----/,
    what: 'Hay una clave privada (certificado, SSH o PGP) dentro del código. Quien la obtenga puede suplantar al servidor o al desarrollador.',
    fix: 'Elimina la clave del repositorio, considérala comprometida y reemplázala. Guarda las claves fuera del proyecto y añade su extensión (*.pem, *.key) al .gitignore.' },
  { id: 'SEC-S03', title: 'Token de GitHub expuesto', cat: CAT.SECRETS, sev: 'critical', cwe: 'CWE-798', owasp: OWASP.A07, secret: true,
    re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/,
    what: 'Un token personal o de aplicación de GitHub está escrito en el código y permite acceder a repositorios privados.',
    fix: 'Revoca el token en GitHub (Settings → Developer settings), crea uno nuevo con los permisos mínimos y úsalo mediante secretos del CI.' },
  { id: 'SEC-S04', title: 'Clave de API de Stripe en producción', cat: CAT.SECRETS, sev: 'critical', cwe: 'CWE-798', owasp: OWASP.A07, secret: true,
    re: /\b(sk|rk)_live_[0-9a-zA-Z]{20,}\b/,
    what: 'Una clave secreta de Stripe en modo producción permite cobrar, reembolsar y leer datos de clientes.',
    fix: 'Rota la clave en el panel de Stripe y cárgala solo desde el servidor mediante variables de entorno.' },
  { id: 'SEC-S05', title: 'Token de Slack expuesto', cat: CAT.SECRETS, sev: 'high', cwe: 'CWE-798', owasp: OWASP.A07, secret: true,
    re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
    what: 'Un token de Slack permite leer o publicar mensajes en el espacio de trabajo.',
    fix: 'Revoca el token desde la configuración de la app de Slack y usa uno nuevo guardado como secreto.' },
  { id: 'SEC-S06', title: 'Clave de API de Google expuesta', cat: CAT.SECRETS, sev: 'high', cwe: 'CWE-798', owasp: OWASP.A07, secret: true,
    re: /\bAIza[0-9A-Za-z_-]{35}\b/,
    what: 'Una clave de API de Google dentro del código puede generar costos o dar acceso a servicios de la cuenta.',
    fix: 'Restringe la clave por dominio/IP y por API en Google Cloud, o reemplázala. Evita publicarla en el cliente sin restricciones.' },
  { id: 'SEC-S07', title: 'Cadena de conexión con usuario y contraseña', cat: CAT.SECRETS, sev: 'high', cwe: 'CWE-798', owasp: OWASP.A07, secret: true,
    re: /\b(postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis|amqps?|mssql):\/\/[^\s:@/'"]+:([^\s@/'"]{3,})@[^\s'"]+/i,
    test: (line, m) => looksLikeSecret(m[2]) || (m[2].length >= 6 && !PLACEHOLDER.test(m[2]) && !/^(password|pass|user|root|admin)$/i.test(m[2])),
    what: 'La cadena de conexión a una base de datos o servicio incluye la contraseña escrita en el código.',
    fix: 'Saca las credenciales del código y léelas de variables de entorno (DATABASE_URL). Cambia la contraseña expuesta.' },
  { id: 'SEC-S08', title: 'Token JWT escrito en el código', cat: CAT.SECRETS, sev: 'medium', cwe: 'CWE-798', owasp: OWASP.A07, secret: true,
    re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
    what: 'Un token JWT fijo puede dar acceso a una cuenta o API mientras no expire.',
    fix: 'Elimina el token del código; obtenlo en tiempo de ejecución y define una caducidad corta.' },
  { id: 'SEC-S09', title: 'Contraseña o secreto escrito directamente en el código', cat: CAT.SECRETS, sev: 'high', cwe: 'CWE-798', owasp: OWASP.A07, secret: true,
    re: /\b[\w-]*(pass(?:word|wd)?|pwd|secret|api[_-]?key|apikey|auth[_-]?token|access[_-]?token|private[_-]?key|client[_-]?secret)[\w-]*['"]?\s*(?::=|=|:)\s*['"]([^'"\s]{8,})['"]/i,
    test: (line, m) => looksLikeSecret(m[2]) && !/^\s*(import|from|require)\b/.test(line),
    what: 'Un valor con aspecto de contraseña, clave o token está escrito en el código fuente. Cualquiera con acceso al repositorio puede usarlo.',
    fix: 'Mueve el valor a variables de entorno o a un gestor de secretos, rota la credencial expuesta y agrega los archivos de configuración local al .gitignore.' },
  { id: 'SEC-S10', title: 'Secreto en archivo de configuración', cat: CAT.SECRETS, sev: 'high', cwe: 'CWE-798', owasp: OWASP.A05, secret: true,
    exts: ['yml', 'yaml', 'properties', 'ini', 'env', 'conf', 'cfg', 'toml'],
    re: /^\s*[\w.-]*(pass(?:word|wd)?|secret|api[_-]?key|token|private[_-]?key)[\w.-]*\s*[:=]\s*['"]?([^\s#'"]{8,})['"]?\s*(#.*)?$/i,
    test: (line, m) => looksLikeSecret(m[2]),
    what: 'Un archivo de configuración guarda una contraseña, clave o token en texto plano.',
    fix: 'Usa referencias a variables de entorno (${VAR}) o un gestor de secretos y no versiones archivos con valores reales.' },
  { id: 'SEC-S11', title: 'Contraseña por defecto o débil', cat: CAT.SECRETS, sev: 'medium', cwe: 'CWE-1392', owasp: OWASP.A07, secret: true,
    re: /\b[\w-]*(pass(?:word|wd)?|pwd)[\w-]*['"]?\s*(?::=|=|:)\s*['"](admin|root|password|123456|12345678|admin123|changeme|secret|test|qwerty|letmein)['"]/i,
    what: 'Se usa una contraseña predecible. Es de los primeros valores que prueba cualquier atacante.',
    fix: 'Elimina las credenciales por defecto, obliga a definir una contraseña única en el despliegue y deshabilita cuentas de ejemplo.' },
  { id: 'SEC-S12', title: 'Token de autenticación de npm en .npmrc', cat: CAT.SECRETS, sev: 'critical', cwe: 'CWE-798', owasp: OWASP.A07, secret: true,
    re: /_authToken\s*=\s*(?!\$\{)[^\s]{8,}/,
    what: 'Un token de npm permite publicar paquetes en nombre del equipo.',
    fix: 'Revoca el token en npm, quita el valor del archivo y usa ${NPM_TOKEN} desde el entorno del CI.' },
  { id: 'SEC-S13', title: 'Credencial definida con define() en PHP', cat: CAT.SECRETS, sev: 'high', cwe: 'CWE-798', owasp: OWASP.A07, secret: true, exts: PHP,
    re: /define\(\s*['"][A-Z_]*(PASSWORD|SECRET|KEY|SALT)[A-Z_]*['"]\s*,\s*['"]([^'"]{6,})['"]/,
    test: (line, m) => !PLACEHOLDER.test(m[2]) && m[2].length >= 8,
    what: 'La configuración de la aplicación guarda contraseñas o claves como constantes en el código.',
    fix: 'Carga estos valores desde variables de entorno (getenv) o un archivo fuera del repositorio.' },

  // ======================= CÓDIGO INSEGURO (JS/TS)
  { id: 'SEC-C01', title: 'Uso de eval()', cat: CAT.CODE, sev: 'high', cwe: 'CWE-95', owasp: OWASP.A03, exts: [...JS, ...RB, ...PHP],
    re: /(?<![\w.$])eval\s*\(/,
    what: 'eval() ejecuta texto como código. Si parte de ese texto viene del usuario, permite ejecución remota de código.',
    fix: 'Reemplaza eval() por estructuras de datos (JSON.parse, tablas de funciones) y nunca ejecutes texto recibido.' },
  { id: 'SEC-C02', title: 'Creación de funciones desde texto (new Function)', cat: CAT.CODE, sev: 'high', cwe: 'CWE-95', owasp: OWASP.A03, exts: JS,
    re: /\bnew\s+Function\s*\(/,
    what: 'new Function() compila texto como código, con el mismo riesgo que eval().',
    fix: 'Evita generar código en tiempo de ejecución; usa funciones normales o configuración declarativa.' },
  { id: 'SEC-C03', title: 'setTimeout/setInterval con texto como argumento', cat: CAT.CODE, sev: 'medium', cwe: 'CWE-95', owasp: OWASP.A03, exts: JS,
    re: /\bset(Timeout|Interval)\s*\(\s*['"`]/,
    what: 'Pasar un texto en lugar de una función hace que se evalúe como código.',
    fix: 'Pasa siempre una función: setTimeout(() => { ... }, ms).' },
  { id: 'SEC-C04', title: 'Posible XSS por asignación a innerHTML', cat: CAT.CODE, sev: 'medium', cwe: 'CWE-79', owasp: OWASP.A03, exts: JS,
    re: /\.(innerHTML|outerHTML)\s*\+?=\s*(.+)$/,
    test: (line, m) => !/^(['"`])[^'"`$]*\1\s*;?$/.test(m[2].trim()) && !/^['"`]{2}\s*;?$/.test(m[2].trim()),
    what: 'Insertar texto dinámico como HTML permite inyectar scripts (XSS) si el contenido incluye datos del usuario.',
    fix: 'Usa textContent o un sistema de plantillas que escape el contenido; si necesitas HTML, sanitízalo (DOMPurify).' },
  { id: 'SEC-C05', title: 'Uso de document.write()', cat: CAT.CODE, sev: 'medium', cwe: 'CWE-79', owasp: OWASP.A03, exts: JS,
    re: /\bdocument\.write(ln)?\s*\(/,
    what: 'document.write inserta HTML sin control y es una vía común de XSS.',
    fix: 'Construye el DOM con createElement/textContent.' },
  { id: 'SEC-C06', title: 'Inserción de HTML sin escapar (dangerouslySetInnerHTML / v-html)', cat: CAT.CODE, sev: 'medium', cwe: 'CWE-79', owasp: OWASP.A03, exts: JS,
    re: /\bdangerouslySetInnerHTML\b|\bv-html\s*=/,
    what: 'Estas opciones desactivan el escape automático del framework.',
    fix: 'Sanitiza el HTML antes de mostrarlo o muestra el contenido como texto.' },
  { id: 'SEC-C07', title: 'Ejecución de comandos del sistema con datos concatenados', cat: CAT.CODE, sev: 'high', cwe: 'CWE-78', owasp: OWASP.A03, exts: JS,
    re: /\b(exec|execSync)\s*\(\s*(['"`][^'"`]*['"`]\s*\+|`[^`]*\$\{)/,
    what: 'Construir comandos de sistema con variables permite inyectar comandos adicionales.',
    fix: 'Usa execFile/spawn con un arreglo de argumentos y valida o lista blanca cualquier entrada.' },
  { id: 'SEC-C08', title: 'Consulta SQL construida con concatenación (JS/TS)', cat: CAT.CODE, sev: 'high', cwe: 'CWE-89', owasp: OWASP.A03, exts: JS,
    re: /\b(query|execute|raw|all|get|run)\s*\(\s*(`[^`]*(SELECT|INSERT|UPDATE|DELETE)[^`]*\$\{|['"][^'"]*(SELECT|INSERT|UPDATE|DELETE)[^'"]*['"]\s*\+)/i,
    what: 'Armar SQL pegando variables permite inyección SQL: el atacante puede leer, modificar o borrar datos.',
    fix: 'Usa consultas parametrizadas (placeholders ? o $1) o un ORM, nunca concatenes valores en el SQL.' },
  { id: 'SEC-C09', title: 'Verificación de certificados TLS desactivada', cat: CAT.CODE, sev: 'high', cwe: 'CWE-295', owasp: OWASP.A02, exts: [...JS, ...SH, 'env'],
    re: /rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0/,
    what: 'Sin validar el certificado, cualquiera en la red puede interceptar o alterar las comunicaciones (ataque de intermediario).',
    fix: 'Elimina la opción y configura la autoridad certificadora correcta si usas certificados propios.' },
  { id: 'SEC-C10', title: 'Almacenamiento de credenciales en localStorage/sessionStorage', cat: CAT.CODE, sev: 'medium', cwe: 'CWE-922', owasp: OWASP.A04, exts: JS,
    re: /(localStorage|sessionStorage)\.setItem\(\s*['"][^'"]*(token|password|secret|jwt|auth)[^'"]*['"]/i,
    what: 'El almacenamiento del navegador es legible por cualquier script de la página; un XSS permitiría robar el token.',
    fix: 'Guarda los tokens de sesión en cookies HttpOnly + Secure + SameSite o usa tokens de vida muy corta.' },
  { id: 'SEC-C11', title: 'Datos enviados por HTTP sin cifrar', cat: CAT.CODE, sev: 'low', cwe: 'CWE-319', owasp: OWASP.A02, exts: [...JS, ...PY, ...PHP, ...JAVA, ...CS, ...GO, ...RB],
    re: /['"]http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|www\.w3\.org|schemas\.|example\.|json-schema\.org|xmlns)[a-z0-9.-]+\.[a-z]{2,}[^'"\s]*['"]/i,
    what: 'Una dirección HTTP sin TLS envía los datos en claro y puede ser interceptada o modificada.',
    fix: 'Usa HTTPS en todas las URLs externas y activa HSTS en el servidor.' },

  // ======================= CÓDIGO INSEGURO (Python)
  { id: 'SEC-C20', title: 'Uso de eval()/exec() en Python', cat: CAT.CODE, sev: 'high', cwe: 'CWE-95', owasp: OWASP.A03, exts: PY,
    re: /(?<![\w.])(eval|exec)\s*\(/,
    what: 'Ejecutar texto como código permite ejecución remota si el texto contiene datos externos.',
    fix: 'Usa ast.literal_eval para datos simples o estructuras explícitas; evita exec/eval con entradas externas.' },
  { id: 'SEC-C21', title: 'Deserialización insegura (pickle / marshal)', cat: CAT.CODE, sev: 'high', cwe: 'CWE-502', owasp: OWASP.A08, exts: PY,
    re: /\b(pickle|cPickle|marshal|shelve)\.(loads?|Unpickler|open)\s*\(/,
    what: 'Cargar objetos pickle de una fuente no confiable ejecuta código arbitrario.',
    fix: 'Usa formatos de datos seguros (JSON) o firma y verifica los datos antes de deserializar.' },
  { id: 'SEC-C22', title: 'yaml.load() sin cargador seguro', cat: CAT.CODE, sev: 'high', cwe: 'CWE-502', owasp: OWASP.A08, exts: PY,
    re: /\byaml\.load\s*\(/,
    test: (line) => !/SafeLoader|CSafeLoader|safe_load/.test(line),
    what: 'yaml.load puede construir objetos arbitrarios y ejecutar código al leer un YAML malicioso.',
    fix: 'Usa yaml.safe_load() o yaml.load(..., Loader=yaml.SafeLoader).' },
  { id: 'SEC-C23', title: 'Comandos del sistema con shell=True / os.system', cat: CAT.CODE, sev: 'high', cwe: 'CWE-78', owasp: OWASP.A03, exts: PY,
    re: /subprocess\.\w+\([^)]*shell\s*=\s*True|\bos\.(system|popen)\s*\(/,
    what: 'Ejecutar comandos a través del shell permite inyectar comandos si interviene algún dato del usuario.',
    fix: 'Usa subprocess.run([...], shell=False) con una lista de argumentos y valida las entradas.' },
  { id: 'SEC-C24', title: 'Verificación TLS desactivada en peticiones (verify=False)', cat: CAT.CODE, sev: 'high', cwe: 'CWE-295', owasp: OWASP.A02, exts: PY,
    re: /verify\s*=\s*False/,
    what: 'La conexión acepta cualquier certificado, permitiendo ataques de intermediario.',
    fix: 'Quita verify=False; si usas una CA propia, indica la ruta del certificado con verify="ruta.pem".' },
  { id: 'SEC-C25', title: 'Consulta SQL armada con f-strings o formato (Python)', cat: CAT.CODE, sev: 'high', cwe: 'CWE-89', owasp: OWASP.A03, exts: PY,
    re: /\.(execute|executemany|raw)\s*\(\s*(f['"]|['"][^'"]*['"]\s*(%|\.format\s*\())/,
    what: 'Insertar variables directamente en el SQL permite inyección SQL.',
    fix: 'Usa parámetros: cursor.execute("SELECT ... WHERE id = %s", (valor,)).' },
  { id: 'SEC-C26', title: 'Modo depuración activado', cat: CAT.CONFIG, sev: 'medium', cwe: 'CWE-489', owasp: OWASP.A05, exts: [...PY, ...PHP, 'env', 'properties', 'ini', 'yml', 'yaml', 'cfg'],
    re: /\.run\([^)]*debug\s*=\s*True|^\s*DEBUG\s*[=:]\s*(True|true|1|"true"|'true')\s*(#.*)?$|display_errors\s*=\s*(On|1|true)/i,
    what: 'El modo debug expone errores detallados, rutas y a veces una consola interactiva.',
    fix: 'Desactiva DEBUG en producción y controla el valor por variable de entorno.' },
  { id: 'SEC-C27', title: 'ALLOWED_HOSTS acepta cualquier dominio', cat: CAT.CONFIG, sev: 'medium', cwe: 'CWE-16', owasp: OWASP.A05, exts: PY,
    re: /ALLOWED_HOSTS\s*=\s*\[\s*['"]\*['"]\s*\]/,
    what: 'Permite ataques de cabecera Host (envenenamiento de enlaces y caché).',
    fix: 'Lista solo los dominios reales de la aplicación.' },
  { id: 'SEC-C28', title: 'Plantillas con autoescape desactivado', cat: CAT.CODE, sev: 'medium', cwe: 'CWE-79', owasp: OWASP.A03, exts: PY,
    re: /autoescape\s*=\s*False/,
    what: 'Sin escape automático, los datos del usuario se insertan como HTML y habilitan XSS.',
    fix: 'Deja autoescape activo y marca como seguro solo contenido ya sanitizado.' },

  // ======================= PHP
  { id: 'SEC-C30', title: 'Ejecución de comandos del sistema (PHP)', cat: CAT.CODE, sev: 'high', cwe: 'CWE-78', owasp: OWASP.A03, exts: PHP,
    re: /\b(system|exec|shell_exec|passthru|popen|proc_open)\s*\(/,
    what: 'Estas funciones ejecutan comandos del sistema operativo; con datos externos permiten tomar el control del servidor.',
    fix: 'Evítalas, usa librerías nativas y, si es imprescindible, usa escapeshellarg() y listas blancas.' },
  { id: 'SEC-C31', title: 'Entrada del usuario usada directamente en SQL (PHP)', cat: CAT.CODE, sev: 'critical', cwe: 'CWE-89', owasp: OWASP.A03, exts: PHP,
    re: /\b(mysql_query|mysqli_query|->query|->exec)\s*\([^;]*\$_(GET|POST|REQUEST|COOKIE)/,
    what: 'Una variable de la petición entra directamente en la consulta: inyección SQL inmediata.',
    fix: 'Usa sentencias preparadas (PDO::prepare / mysqli_prepare) con parámetros enlazados.' },
  { id: 'SEC-C32', title: 'Inclusión de archivos con datos del usuario (PHP)', cat: CAT.CODE, sev: 'critical', cwe: 'CWE-98', owasp: OWASP.A03, exts: PHP,
    re: /\b(include|require)(_once)?\s*\(?\s*\$_(GET|POST|REQUEST|COOKIE)/,
    what: 'Permite incluir archivos locales o remotos elegidos por el atacante (ejecución de código).',
    fix: 'No construyas rutas de include con datos externos; usa una lista blanca de archivos permitidos.' },
  { id: 'SEC-C33', title: 'unserialize()/extract() sobre datos de la petición', cat: CAT.CODE, sev: 'high', cwe: 'CWE-502', owasp: OWASP.A08, exts: PHP,
    re: /\b(unserialize|extract)\s*\(\s*\$_(GET|POST|REQUEST|COOKIE)/,
    what: 'Deserializar o volcar variables de la petición permite manipular el estado interno de la aplicación.',
    fix: 'Usa json_decode y asigna solo los campos esperados.' },

  // ======================= Java / Kotlin
  { id: 'SEC-C40', title: 'Ejecución de comandos con Runtime.exec', cat: CAT.CODE, sev: 'high', cwe: 'CWE-78', owasp: OWASP.A03, exts: JAVA,
    re: /Runtime\.getRuntime\(\)\.exec\s*\(|new\s+ProcessBuilder\s*\(\s*["'].*\+/,
    what: 'Ejecutar comandos construidos con texto externo permite inyección de comandos.',
    fix: 'Pasa los argumentos como lista separada y valida la entrada.' },
  { id: 'SEC-C41', title: 'Consulta SQL concatenada (Java)', cat: CAT.CODE, sev: 'high', cwe: 'CWE-89', owasp: OWASP.A03, exts: JAVA,
    re: /\.(executeQuery|executeUpdate|execute|createQuery|createNativeQuery)\s*\(\s*"[^"]*"\s*\+/,
    what: 'Concatenar variables en el SQL permite inyección SQL.',
    fix: 'Usa PreparedStatement o parámetros nombrados del ORM.' },
  { id: 'SEC-C42', title: 'Deserialización de objetos Java', cat: CAT.CODE, sev: 'medium', cwe: 'CWE-502', owasp: OWASP.A08, exts: JAVA,
    re: /new\s+ObjectInputStream\s*\(/,
    what: 'Deserializar flujos no confiables puede ejecutar código arbitrario.',
    fix: 'Usa formatos de datos (JSON) o filtros de deserialización (ObjectInputFilter).' },
  { id: 'SEC-C43', title: 'Validación de certificados/host desactivada (Java)', cat: CAT.CODE, sev: 'high', cwe: 'CWE-295', owasp: OWASP.A02, exts: JAVA,
    re: /ALLOW_ALL_HOSTNAME_VERIFIER|NoopHostnameVerifier|verify\s*\([^)]*\)\s*\{\s*return\s+true|checkServerTrusted\s*\([^)]*\)\s*\{\s*\}/,
    what: 'La aplicación acepta cualquier certificado o nombre de host.',
    fix: 'Usa la validación estándar del JDK o un almacén de confianza propio correctamente configurado.' },
  { id: 'SEC-C44', title: 'Protección CSRF desactivada (Spring)', cat: CAT.CONFIG, sev: 'medium', cwe: 'CWE-352', owasp: OWASP.A01, exts: JAVA,
    re: /csrf\s*\(\s*\)\s*\.\s*disable\s*\(|\.csrf\s*\(\s*(\w+\s*->\s*\w+\.disable\(\)|AbstractHttpConfigurer::disable)/,
    what: 'Sin CSRF, un sitio externo puede ejecutar acciones en nombre de un usuario autenticado.',
    fix: 'Mantén CSRF activo para aplicaciones con sesión por cookie; desactívalo solo en APIs sin estado con tokens.' },

  // ======================= C# / Go / Ruby / Shell
  { id: 'SEC-C50', title: 'Consulta SQL concatenada (C#)', cat: CAT.CODE, sev: 'high', cwe: 'CWE-89', owasp: OWASP.A03, exts: CS,
    re: /new\s+SqlCommand\s*\(\s*(\$"|"[^"]*"\s*\+)/,
    what: 'La consulta incluye variables pegadas, lo que permite inyección SQL.',
    fix: 'Usa SqlParameter / consultas parametrizadas o Entity Framework.' },
  { id: 'SEC-C51', title: 'Deserialización con BinaryFormatter', cat: CAT.CODE, sev: 'high', cwe: 'CWE-502', owasp: OWASP.A08, exts: CS,
    re: /\bBinaryFormatter\b/,
    what: 'BinaryFormatter es inseguro por diseño y está obsoleto.',
    fix: 'Usa System.Text.Json u otro serializador seguro.' },
  { id: 'SEC-C52', title: 'Validación de certificados desactivada (C#)', cat: CAT.CODE, sev: 'high', cwe: 'CWE-295', owasp: OWASP.A02, exts: CS,
    re: /ServerCertificateValidationCallback\s*[+=]+.*(true|delegate)|DangerousAcceptAnyServerCertificateValidator/,
    what: 'Acepta cualquier certificado del servidor.',
    fix: 'Elimina el callback y usa la validación predeterminada.' },
  { id: 'SEC-C53', title: 'Verificación TLS desactivada (Go)', cat: CAT.CODE, sev: 'high', cwe: 'CWE-295', owasp: OWASP.A02, exts: GO,
    re: /InsecureSkipVerify\s*:\s*true/,
    what: 'El cliente TLS no valida el certificado del servidor.',
    fix: 'Elimina InsecureSkipVerify o configura RootCAs con la CA correcta.' },
  { id: 'SEC-C54', title: 'Comando ejecutado vía shell o SQL con Sprintf (Go)', cat: CAT.CODE, sev: 'high', cwe: 'CWE-78', owasp: OWASP.A03, exts: GO,
    re: /exec\.Command\(\s*"(sh|bash)"\s*,\s*"-c"|\.(Query|Exec|QueryRow)\s*\(\s*fmt\.Sprintf\(/,
    what: 'Ejecutar texto en el shell o armar SQL con Sprintf permite inyección.',
    fix: 'Pasa los argumentos por separado y usa consultas con parámetros ($1, ?).' },
  { id: 'SEC-C55', title: 'Deserialización o evaluación insegura (Ruby)', cat: CAT.CODE, sev: 'high', cwe: 'CWE-502', owasp: OWASP.A08, exts: RB,
    re: /\b(Marshal\.load|YAML\.load)\s*\(|`[^`]*#\{|\bsystem\s*\(\s*["'][^"']*#\{/,
    what: 'Cargar datos no confiables con Marshal/YAML.load o interpolar en comandos permite ejecutar código.',
    fix: 'Usa YAML.safe_load / JSON y pasa argumentos separados a system().' },
  { id: 'SEC-C56', title: 'Script descargado y ejecutado sin verificar (curl | sh)', cat: CAT.CODE, sev: 'high', cwe: 'CWE-494', owasp: OWASP.A08, exts: [...SH, 'dockerfile', 'yml', 'yaml', 'md'],
    re: /\b(curl|wget)\b[^|;&]*\|\s*(sudo\s+)?(ba|z)?sh\b/,
    what: 'Ejecutar directamente un script de Internet entrega el control a quien controle ese sitio.',
    fix: 'Descarga el script, verifica su huella (sha256) y fija la versión antes de ejecutarlo.' },
  { id: 'SEC-C57', title: 'Permisos excesivos (chmod 777)', cat: CAT.CONFIG, sev: 'medium', cwe: 'CWE-732', owasp: OWASP.A05, exts: [...SH, 'dockerfile', 'yml', 'yaml', 'md', 'php', 'py', 'js'],
    re: /\bchmod\s+(-R\s+)?0?777\b/,
    what: 'Dar permisos totales a todos los usuarios facilita la modificación o lectura indebida de archivos.',
    fix: 'Aplica el mínimo privilegio (por ejemplo 640 o 750) y el propietario correcto.' },

  // ======================= CRIPTOGRAFÍA Y AUTENTICACIÓN
  { id: 'SEC-K01', title: 'Algoritmo de hash débil (MD5/SHA-1)', cat: CAT.CRYPTO, sev: 'medium', cwe: 'CWE-328', owasp: OWASP.A02,
    exts: [...JS, ...PY, ...PHP, ...JAVA, ...CS, ...GO, ...RB],
    re: /createHash\(\s*['"](md5|sha1)['"]\s*\)|hashlib\.(md5|sha1)\s*\(|\b(md5|sha1)\s*\(\s*\$|MessageDigest\.getInstance\(\s*"(MD5|SHA-?1)"|\b(MD5|SHA1)\.Create\s*\(|\b(md5|sha1)\.New\s*\(|Digest::(MD5|SHA1)/i,
    what: 'MD5 y SHA-1 se pueden romper con facilidad; no son adecuados para contraseñas ni firmas.',
    fix: 'Usa SHA-256 o superior para integridad y bcrypt/argon2/scrypt para contraseñas.' },
  { id: 'SEC-K02', title: 'Números aleatorios predecibles para secretos', cat: CAT.CRYPTO, sev: 'medium', cwe: 'CWE-338', owasp: OWASP.A02,
    exts: [...JS, ...PY],
    re: /Math\.random\s*\(|\brandom\.(random|randint|choice|randrange)\s*\(/,
    test: (line) => /(token|secret|passw|pass_|\bkey\b|salt|nonce|session|otp|reset|api_?key)/i.test(line),
    what: 'Math.random()/random no son criptográficamente seguros; un atacante puede predecir los valores generados.',
    fix: 'Usa crypto.randomBytes / crypto.getRandomValues (JS) o el módulo secrets (Python).' },
  { id: 'SEC-K03', title: 'Cookies sin protección (HttpOnly/Secure desactivados)', cat: CAT.CRYPTO, sev: 'medium', cwe: 'CWE-614', owasp: OWASP.A05, exts: [...JS, ...PY],
    re: /\b(httpOnly|secure|SESSION_COOKIE_SECURE|SESSION_COOKIE_HTTPONLY)\s*[:=]\s*(false|False)\b/,
    what: 'Una cookie sin HttpOnly/Secure puede robarse con XSS o interceptarse en conexiones sin cifrar.',
    fix: 'Activa httpOnly y secure (y SameSite=Lax/Strict) en las cookies de sesión.' },
  { id: 'SEC-K04', title: 'JWT sin firma o sin verificar expiración', cat: CAT.CRYPTO, sev: 'high', cwe: 'CWE-347', owasp: OWASP.A07, exts: [...JS, ...PY, ...JAVA],
    re: /algorithms?\s*[:=]\s*\[?\s*['"]none['"]|ignoreExpiration\s*:\s*true|verify_signature['"]?\s*[:=]\s*(False|false)/i,
    what: 'Aceptar tokens sin firma o expirados permite suplantar identidades.',
    fix: 'Exige un algoritmo explícito (HS256/RS256), valida firma y expiración y usa secretos largos.' },
  { id: 'SEC-K05', title: 'CORS abierto a cualquier origen', cat: CAT.CONFIG, sev: 'medium', cwe: 'CWE-942', owasp: OWASP.A05, exts: [...JS, ...PY, ...JAVA, ...CS, ...GO, ...PHP, 'conf', 'yml', 'yaml', 'htaccess'],
    re: /Access-Control-Allow-Origin['"]?\s*[:,=]\s*['"]?\*|\borigins?\s*[:=]\s*\[?\s*['"]\*['"]|CORS_ORIGIN_ALLOW_ALL\s*=\s*True|setAllowedOrigins\(\s*[^)]*"\*"|AllowAnyOrigin\s*\(|@CrossOrigin\s*$|\bcors\(\s*\)/,
    what: 'Con CORS abierto cualquier sitio web puede leer respuestas de la API desde el navegador del usuario.',
    fix: 'Lista explícitamente los orígenes permitidos y evita credenciales con comodines.' },
  { id: 'SEC-K06', title: 'Protección CSRF desactivada', cat: CAT.CONFIG, sev: 'medium', cwe: 'CWE-352', owasp: OWASP.A01, exts: [...JS, ...PY, ...RB, ...PHP],
    re: /\bcsrf_exempt\b|csrf\s*:\s*false|skip_before_action\s*:verify_authenticity_token|WTF_CSRF_ENABLED\s*=\s*False/,
    what: 'Sin protección CSRF, sitios externos pueden forzar acciones del usuario autenticado.',
    fix: 'Activa los tokens CSRF del framework en formularios y peticiones que modifican datos.' },
  { id: 'SEC-K07', title: 'Exposición total de endpoints de administración (Actuator)', cat: CAT.CONFIG, sev: 'medium', cwe: 'CWE-200', owasp: OWASP.A05, exts: ['properties', 'yml', 'yaml'],
    re: /management\.endpoints\.web\.exposure\.include\s*[:=]\s*['"]?\*/,
    what: 'Expone métricas, variables de entorno y volcados de memoria de la aplicación.',
    fix: 'Expón solo health e info y protege el resto con autenticación.' },
  { id: 'SEC-K08', title: 'Tarea de seguridad pendiente (TODO/FIXME)', cat: CAT.HYGIENE, sev: 'info', cwe: 'CWE-1059', owasp: OWASP.A04,
    re: /(TODO|FIXME|HACK|XXX)\b.{0,60}\b(security|seguridad|auth|autenticaci|password|contrase|encrypt|cifrad|vulnerab|sanitiz|sql\s*injection|xss)/i,
    test: (line) => /(\/\/|#|\/\*|<!--|--)/.test(line),
    what: 'Hay comentarios que indican trabajo de seguridad sin terminar.',
    fix: 'Convierte estos pendientes en tareas con responsable y fecha, y resuélvelos antes de publicar.' }
];

// ---------------------------------------------------------------- reglas por archivo (ruta/nombre)
export const FILE_RULES = [
  { id: 'SEC-F01', title: 'Archivo de variables de entorno (.env) incluido', cat: CAT.SECRETS, sev: 'high', cwe: 'CWE-540', owasp: OWASP.A05,
    match: (p, name) => /^\.env(\.(local|production|prod|development|dev|staging|test))?$/i.test(name) || /^(production|prod|secrets?)\.env$/i.test(name),
    what: 'Los archivos .env suelen contener contraseñas y claves reales y no deben distribuirse con el proyecto.',
    fix: 'Elimínalo del proyecto, agrega .env al .gitignore y entrega un .env.example con valores de ejemplo.' },
  { id: 'SEC-F02', title: 'Llaves o certificados privados incluidos', cat: CAT.SECRETS, sev: 'high', cwe: 'CWE-321', owasp: OWASP.A02,
    match: (p, name) => /^(id_rsa|id_dsa|id_ecdsa|id_ed25519)$/i.test(name) || /\.(pem|key|p12|pfx|jks|keystore|ppk)$/i.test(name) && !/(public|\.pub|cacert|ca-bundle|chain|fullchain)/i.test(name),
    what: 'Archivos de llaves o almacenes de certificados dentro del proyecto pueden permitir suplantar al servidor o al usuario.',
    fix: 'Quita estos archivos del repositorio, trátalos como comprometidos y guárdalos en un gestor de secretos.' },
  { id: 'SEC-F03', title: 'Archivos de credenciales de servicios', cat: CAT.SECRETS, sev: 'high', cwe: 'CWE-538', owasp: OWASP.A05,
    match: (p, name) => /^(credentials(\.json)?|\.htpasswd|\.netrc|\.pgpass|\.pypirc|\.dockercfg|service[-_]?account.*\.json|secrets?\.(json|ya?ml)|client_secret.*\.json)$/i.test(name) || /(^|\/)\.aws\/credentials$/.test(p) || /(^|\/)\.docker\/config\.json$/.test(p),
    what: 'Estos archivos guardan credenciales para servicios en la nube, registros o servidores.',
    fix: 'Elimínalos del proyecto, rota las credenciales y usa variables de entorno o un gestor de secretos.' },
  { id: 'SEC-F04', title: 'Base de datos o respaldo incluido en el proyecto', cat: CAT.SECRETS, sev: 'medium', cwe: 'CWE-530', owasp: OWASP.A05,
    match: (p, name) => /\.(sqlite3?|db|mdb|bak|dump|backup|sql\.gz)$/i.test(name) && !/(migrations?|fixtures?|seeds?|test)/i.test(p),
    what: 'Una base de datos o respaldo puede contener datos personales o credenciales de usuarios.',
    fix: 'No versiones bases de datos reales; usa datos de ejemplo y agrega estas extensiones al .gitignore.' },
  { id: 'SEC-F05', title: 'Carpeta .git incluida (historial completo del repositorio)', cat: CAT.HYGIENE, sev: 'medium', cwe: 'CWE-538', owasp: OWASP.A05,
    match: (p) => /(^|\/)\.git\//.test(p), once: true,
    what: 'Al compartir el proyecto con .git se entrega todo el historial, incluidos secretos borrados en el pasado.',
    fix: 'Comparte solo el código (git archive) y revisa el historial con herramientas como gitleaks antes de publicar.' },
  { id: 'SEC-F06', title: 'Archivos de registro (logs) incluidos', cat: CAT.HYGIENE, sev: 'low', cwe: 'CWE-532', owasp: OWASP.A09,
    match: (p, name) => /\.log$/i.test(name) && !/node_modules/.test(p),
    what: 'Los logs pueden contener datos personales, tokens o rutas internas.',
    fix: 'Excluye los logs del proyecto (.gitignore) y evita registrar datos sensibles.' },
  { id: 'SEC-F07', title: 'Dependencias instaladas (node_modules / vendor) dentro del proyecto', cat: CAT.HYGIENE, sev: 'low', cwe: 'CWE-1104', owasp: OWASP.A06,
    match: (p) => /(^|\/)(node_modules|vendor|bower_components|\.venv|venv)\//.test(p), once: true,
    what: 'Incluir dependencias instaladas aumenta el tamaño, dificulta su actualización y puede esconder código modificado.',
    fix: 'No versiones estas carpetas: instálalas con el gestor de paquetes a partir del archivo de dependencias.' },
  { id: 'SEC-F08', title: 'Archivos de sistema o editor incluidos', cat: CAT.HYGIENE, sev: 'info', cwe: 'CWE-538', owasp: OWASP.A05,
    match: (p, name) => /^(\.DS_Store|Thumbs\.db|desktop\.ini)$/i.test(name) || /(^|\/)\.(idea|vscode)\//.test(p), once: true,
    what: 'Pueden revelar rutas, nombres de usuario o configuración personal del desarrollador.',
    fix: 'Agrega estos archivos al .gitignore global del equipo.' }
];

export const DOCKER_RULES = [
  { id: 'SEC-F10', title: 'El contenedor se ejecuta como root', cat: CAT.CONFIG, sev: 'medium', cwe: 'CWE-250', owasp: OWASP.A05,
    what: 'Sin una instrucción USER, el proceso corre con privilegios de administrador dentro del contenedor.',
    fix: 'Crea un usuario sin privilegios (RUN adduser ...) y agrega USER antes de CMD/ENTRYPOINT.' },
  { id: 'SEC-F11', title: 'Imagen base sin versión fija (latest)', cat: CAT.CONFIG, sev: 'low', cwe: 'CWE-1104', owasp: OWASP.A06,
    what: 'Usar la etiqueta latest (o ninguna) hace los despliegues impredecibles e impide controlar vulnerabilidades.',
    fix: 'Fija una versión concreta o, mejor, el digest de la imagen (FROM node:20.11-alpine@sha256:...).' },
  { id: 'SEC-F12', title: 'Secreto definido con ENV/ARG en el Dockerfile', cat: CAT.SECRETS, sev: 'high', cwe: 'CWE-798', owasp: OWASP.A05,
    what: 'Los valores de ENV/ARG quedan visibles en las capas de la imagen y en el historial.',
    fix: 'Pasa los secretos en tiempo de ejecución (docker secrets, variables del orquestador) o usa BuildKit --secret.' },
  { id: 'SEC-F13', title: 'Puerto SSH (22) expuesto en el contenedor', cat: CAT.CONFIG, sev: 'medium', cwe: 'CWE-1327', owasp: OWASP.A05,
    what: 'Un servidor SSH dentro del contenedor amplía la superficie de ataque.',
    fix: 'Usa docker exec/kubectl exec para administración y no expongas SSH.' },
  { id: 'SEC-F14', title: 'Contenedor privilegiado o red del host', cat: CAT.CONFIG, sev: 'high', cwe: 'CWE-250', owasp: OWASP.A05,
    what: 'privileged: true o network_mode: host quita el aislamiento del contenedor respecto al servidor.',
    fix: 'Elimina esas opciones y concede solo las capacidades necesarias (cap_add).' },
  { id: 'SEC-F15', title: 'Flujo de CI con permisos excesivos o pull_request_target', cat: CAT.CONFIG, sev: 'medium', cwe: 'CWE-250', owasp: OWASP.A08,
    what: 'permissions: write-all o pull_request_target con código externo permiten robar secretos del pipeline.',
    fix: 'Define permisos mínimos por trabajo y evita ejecutar código de forks con pull_request_target.' }
];
