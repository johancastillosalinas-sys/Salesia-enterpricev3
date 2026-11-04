/**
 * @file advisories.js
 * @description Lista INDICATIVA y sin conexión de componentes con vulnerabilidades conocidas.
 * No reemplaza a herramientas como `npm audit`, `pip-audit` u OWASP Dependency-Check.
 * `fixed` = primera versión que corrige el problema.
 */

export const ADVISORIES = [
  { eco: 'npm', name: 'lodash', fixed: '4.17.21', severity: 'high', id: 'CVE-2021-23337', title: 'Inyección de comandos en _.template y contaminación de prototipos' },
  { eco: 'npm', name: 'minimist', fixed: '1.2.6', severity: 'critical', id: 'CVE-2021-44906', title: 'Contaminación de prototipos' },
  { eco: 'npm', name: 'axios', fixed: '0.21.2', severity: 'high', id: 'CVE-2021-3749', title: 'Denegación de servicio por expresión regular (ReDoS)' },
  { eco: 'npm', name: 'jquery', fixed: '3.5.0', severity: 'medium', id: 'CVE-2020-11022', title: 'Cross-site scripting (XSS) en htmlPrefilter' },
  { eco: 'npm', name: 'express', fixed: '4.17.3', severity: 'medium', id: 'CVE-2022-24999', title: 'Contaminación de prototipos en qs (parser de consultas)' },
  { eco: 'npm', name: 'moment', fixed: '2.29.4', severity: 'high', id: 'CVE-2022-31129', title: 'Denegación de servicio por expresión regular (ReDoS)' },
  { eco: 'npm', name: 'node-fetch', fixed: '2.6.7', severity: 'high', id: 'CVE-2022-0235', title: 'Exposición de cabeceras sensibles en redirecciones' },
  { eco: 'npm', name: 'jsonwebtoken', fixed: '9.0.0', severity: 'high', id: 'CVE-2022-23529', title: 'Validación insuficiente de claves de verificación' },
  { eco: 'npm', name: 'underscore', fixed: '1.12.1', severity: 'critical', id: 'CVE-2021-23358', title: 'Inyección de código en _.template' },
  { eco: 'npm', name: 'handlebars', fixed: '4.7.7', severity: 'critical', id: 'CVE-2021-23369', title: 'Ejecución remota de código en plantillas' },
  { eco: 'npm', name: 'serialize-javascript', fixed: '3.1.0', severity: 'high', id: 'CVE-2020-7660', title: 'Ejecución remota de código por serialización insegura' },
  { eco: 'pypi', name: 'pyyaml', fixed: '5.4', severity: 'critical', id: 'CVE-2020-14343', title: 'Ejecución arbitraria de código al cargar YAML' },
  { eco: 'pypi', name: 'requests', fixed: '2.31.0', severity: 'medium', id: 'CVE-2023-32681', title: 'Filtración de cabecera Proxy-Authorization' },
  { eco: 'pypi', name: 'urllib3', fixed: '1.26.5', severity: 'high', id: 'CVE-2021-33503', title: 'Denegación de servicio por expresión regular (ReDoS)' },
  { eco: 'pypi', name: 'flask', fixed: '2.2.5', severity: 'high', id: 'CVE-2023-30861', title: 'Cookies de sesión expuestas por caché de proxies' },
  { eco: 'pypi', name: 'jinja2', fixed: '2.11.3', severity: 'high', id: 'CVE-2020-28493', title: 'Denegación de servicio por expresión regular (ReDoS)' },
  { eco: 'maven', name: 'log4j-core', fixed: '2.17.1', severity: 'critical', id: 'CVE-2021-44228', title: 'Log4Shell: ejecución remota de código por JNDI' },
  { eco: 'maven', name: 'jackson-databind', fixed: '2.9.10.8', severity: 'high', id: 'CVE-2020-36518', title: 'Deserialización insegura / denegación de servicio' }
];

/** Extrae (mayor, menor, parche) del primer número de versión de un texto como "^4.17.15" o ">=2.0". */
export function parseVersion(spec) {
  const m = /(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:\.(\d+))?/.exec(String(spec || ''));
  return m ? [m[1], m[2], m[3], m[4]].map(x => parseInt(x || '0', 10)) : null;
}

export function compareVersions(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/** @returns el aviso que aplica o null */
export function findAdvisory(eco, name, versionSpec) {
  const adv = ADVISORIES.find(a => a.eco === eco && a.name === String(name).toLowerCase());
  if (!adv) return null;
  const v = parseVersion(versionSpec);
  if (!v) return null;
  return compareVersions(v, parseVersion(adv.fixed)) < 0 ? adv : null;
}
