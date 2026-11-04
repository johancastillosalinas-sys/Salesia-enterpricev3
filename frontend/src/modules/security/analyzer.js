/**
 * @file analyzer.js
 * @description Analizador estático de seguridad para proyectos comprimidos en ZIP.
 * Lee el ZIP en memoria, inventaría el proyecto, aplica reglas de seguridad por línea y por archivo,
 * revisa dependencias contra una lista indicativa, detecta controles positivos y calcula un puntaje 0–100.
 * Nada sale del navegador.
 */

import { ZipArchive } from './zipReader.js';
import { LINE_RULES, FILE_RULES, DOCKER_RULES, SEV, SEV_ORDER, CAT, CATEGORIES, maskSecret, looksLikeSecret } from './rules.js';
import { findAdvisory } from './advisories.js';

export const ANALYZER_VERSION = '1.0';
export const LIMITS = {
  maxZipBytes: 250 * 1024 * 1024, maxEntries: 30000, maxFileBytes: 2 * 1024 * 1024, lockfileBytes: 20 * 1024 * 1024,
  maxTotalBytes: 400 * 1024 * 1024, maxLineLength: 1500, maxInstances: 200
};

const OWASP_A05 = 'A05:2021 · Configuración de seguridad incorrecta';
const OWASP_A06 = 'A06:2021 · Componentes vulnerables y obsoletos';
const OWASP_A04 = 'A04:2021 · Diseño inseguro';

const EXCLUDED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt', 'coverage', '__pycache__', '.venv', 'venv', '.idea', '.vscode',
  'target', 'vendor', 'bower_components', '.gradle', '.tox', '.pytest_cache', '.mypy_cache', '.angular', '.svelte-kit', 'Pods']);
const BINARY_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'webp', 'svgz', 'tif', 'tiff', 'psd', 'woff', 'woff2', 'ttf', 'otf', 'eot', 'mp3', 'mp4', 'avi', 'mov', 'wav', 'ogg', 'webm',
  'zip', 'gz', 'tgz', 'rar', '7z', 'tar', 'bz2', 'xz', 'jar', 'war', 'ear', 'class', 'exe', 'dll', 'so', 'dylib', 'bin', 'o', 'obj', 'a', 'lib', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'pyc', 'pyo', 'whl', 'apk', 'ipa', 'dmg', 'iso', 'jks', 'p12', 'pfx', 'keystore', 'sqlite', 'sqlite3', 'db', 'mdb', 'ttc', 'swf', 'wasm', 'node', 'lockb']);
const LOCKFILES = new Set(['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'composer.lock', 'Gemfile.lock', 'poetry.lock', 'Pipfile.lock', 'go.sum', 'Cargo.lock', 'bun.lockb', 'npm-shrinkwrap.json']);
const LANG = {
  js: 'JavaScript', jsx: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript', ts: 'TypeScript', tsx: 'TypeScript', vue: 'Vue', svelte: 'Svelte',
  py: 'Python', php: 'PHP', phtml: 'PHP', java: 'Java', kt: 'Kotlin', kts: 'Kotlin', scala: 'Scala', groovy: 'Groovy', cs: 'C#', vb: 'Visual Basic', go: 'Go', rb: 'Ruby', rs: 'Rust',
  c: 'C', h: 'C', cpp: 'C++', cc: 'C++', hpp: 'C++', swift: 'Swift', dart: 'Dart', sh: 'Shell', bash: 'Shell', ps1: 'PowerShell', sql: 'SQL',
  html: 'HTML', htm: 'HTML', css: 'CSS', scss: 'CSS', sass: 'CSS', less: 'CSS', md: 'Markdown', yml: 'YAML', yaml: 'YAML', json: 'JSON', xml: 'XML', toml: 'TOML', ini: 'INI', dockerfile: 'Docker'
};
const CODE_LANGS = new Set(['JavaScript', 'TypeScript', 'Vue', 'Svelte', 'Python', 'PHP', 'Java', 'Kotlin', 'Scala', 'Groovy', 'C#', 'Visual Basic', 'Go', 'Ruby', 'Rust', 'C', 'C++', 'Swift', 'Dart', 'Shell', 'PowerShell', 'SQL']);
const TEST_PATH = /(^|\/)(tests?|__tests__|specs?|mocks?|fixtures?|examples?|samples?|docs?|demo|e2e)\//i;
const DOC_EXT = new Set(['md', 'txt', 'rst', 'adoc']);
const DOWNGRADE = { critical: 'high', high: 'medium', medium: 'low', low: 'info', info: 'info' };

const sleep = () => new Promise(r => setTimeout(r, 0));
const extOf = (name) => {
  if (/^\.env/i.test(name)) return 'env';
  if (/^dockerfile/i.test(name) || /\.dockerfile$/i.test(name)) return 'dockerfile';
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toLowerCase() : '';
};

// Índice de reglas por extensión (las reglas sin "exts" aplican a todos los textos)
const RULES_BY_EXT = new Map();
const UNIVERSAL_RULES = LINE_RULES.filter(r => !r.exts);
function rulesFor(ext) {
  if (!RULES_BY_EXT.has(ext)) RULES_BY_EXT.set(ext, [...UNIVERSAL_RULES, ...LINE_RULES.filter(r => r.exts && r.exts.includes(ext))]);
  return RULES_BY_EXT.get(ext);
}

class Findings {
  constructor() { this.map = new Map(); }
  add(rule, { file, line = null, snippet = '', sev = rule.sev, note = '' }) {
    let f = this.map.get(rule.id);
    if (!f) { f = { rule, count: 0, instances: [], sevCounts: {} }; this.map.set(rule.id, f); }
    f.count++;
    f.sevCounts[sev] = (f.sevCounts[sev] || 0) + 1;
    if (f.instances.length < LIMITS.maxInstances) f.instances.push({ file, line, snippet, note, severity: sev });
  }
  addCustom(id, def, inst) {
    this.add({ id, title: def.title, cat: def.cat, sev: def.sev, cwe: def.cwe, owasp: def.owasp, what: def.what, fix: def.fix }, inst);
  }
  list() {
    return [...this.map.values()].map(f => {
      const sev = SEV_ORDER.find(s => f.sevCounts[s]) || f.rule.sev;
      return {
        ruleId: f.rule.id, title: f.rule.title, severity: sev, category: f.rule.cat, cwe: f.rule.cwe, owasp: f.rule.owasp,
        description: f.rule.what, recommendation: f.rule.fix, count: f.count, instances: f.instances
      };
    });
  }
}

// ---------------------------------------------------------------- manifiestos de dependencias
function parseManifest(name, text, path) {
  const deps = [];
  try {
    if (name === 'package.json') {
      const j = JSON.parse(text);
      for (const [section, dev] of [['dependencies', false], ['devDependencies', true], ['peerDependencies', false], ['optionalDependencies', false]]) {
        for (const [n, spec] of Object.entries(j[section] || {})) deps.push({ eco: 'npm', name: n, spec: String(spec), dev, file: path });
      }
      return { type: 'npm', deps, meta: { name: j.name, scripts: j.scripts || {} } };
    }
    if (/^requirements.*\.txt$/i.test(name)) {
      for (const raw of text.split(/\r?\n/)) {
        const line = raw.replace(/#.*/, '').trim();
        if (!line || /^(-|--)/.test(line)) continue;
        const m = /^([A-Za-z0-9_.-]+)(?:\[[^\]]*\])?\s*(==|>=|<=|~=|>|<|!=)?\s*([0-9][^\s;,]*)?/.exec(line);
        if (m) deps.push({ eco: 'pypi', name: m[1].toLowerCase(), spec: `${m[2] || ''}${m[3] || ''}`, op: m[2] || '', file: path });
      }
      return { type: 'pip', deps };
    }
    if (name === 'pyproject.toml' || name === 'Pipfile') {
      let section = '';
      for (const raw of text.split(/\r?\n/)) {
        const h = /^\s*\[([^\]]+)\]/.exec(raw);
        if (h) { section = h[1]; continue; }
        if (/dependencies/i.test(section)) {
          const m = /^\s*([A-Za-z0-9_.-]+)\s*=\s*["']([^"']+)["']/.exec(raw);
          if (m && m[1].toLowerCase() !== 'python') deps.push({ eco: 'pypi', name: m[1].toLowerCase(), spec: m[2], file: path });
        }
      }
      return { type: 'python', deps };
    }
    if (name === 'pom.xml') {
      const re = /<dependency>\s*<groupId>[^<]*<\/groupId>\s*<artifactId>([^<]+)<\/artifactId>\s*(?:<version>([^<]+)<\/version>)?/g;
      let m; while ((m = re.exec(text))) deps.push({ eco: 'maven', name: m[1].toLowerCase(), spec: m[2] || '', file: path });
      return { type: 'maven', deps, meta: { springBoot: /spring-boot/.test(text) } };
    }
    if (/^build\.gradle(\.kts)?$/.test(name)) {
      const re = /(?:implementation|api|compile|runtimeOnly|testImplementation)\s*\(?\s*['"]([^:'"]+):([^:'"]+):([^'"]+)['"]/g;
      let m; while ((m = re.exec(text))) deps.push({ eco: 'maven', name: m[2].toLowerCase(), spec: m[3], file: path });
      return { type: 'gradle', deps, meta: { springBoot: /spring-boot/.test(text) } };
    }
    if (name === 'composer.json') {
      const j = JSON.parse(text);
      for (const [n, spec] of Object.entries({ ...(j.require || {}), ...(j['require-dev'] || {}) })) deps.push({ eco: 'composer', name: n, spec: String(spec), file: path });
      return { type: 'composer', deps };
    }
    if (name === 'Gemfile') {
      for (const raw of text.split(/\r?\n/)) {
        const m = /^\s*gem\s+['"]([^'"]+)['"](?:\s*,\s*['"]([^'"]+)['"])?/.exec(raw);
        if (m) deps.push({ eco: 'rubygems', name: m[1], spec: m[2] || '', file: path });
      }
      return { type: 'bundler', deps };
    }
    if (name === 'go.mod') {
      for (const raw of text.split(/\r?\n/)) {
        const m = /^\s*(?:require\s+)?([\w./~-]+\.[\w./~-]+)\s+v([\d][\w.+-]*)/.exec(raw);
        if (m) deps.push({ eco: 'go', name: m[1], spec: m[2], file: path });
      }
      return { type: 'go', deps };
    }
    if (/\.csproj$/i.test(name)) {
      const re = /<PackageReference\s+Include="([^"]+)"\s+Version="([^"]+)"/g;
      let m; while ((m = re.exec(text))) deps.push({ eco: 'nuget', name: m[1], spec: m[2], file: path });
      return { type: 'nuget', deps };
    }
  } catch { /* manifiesto inválido: se ignora */ }
  return null;
}

const FRAMEWORKS = [
  ['react', 'React'], ['vue', 'Vue'], ['@angular/core', 'Angular'], ['next', 'Next.js'], ['nuxt', 'Nuxt'], ['svelte', 'Svelte'], ['express', 'Express'],
  ['@nestjs/core', 'NestJS'], ['fastify', 'Fastify'], ['koa', 'Koa'], ['vite', 'Vite'], ['tailwindcss', 'Tailwind CSS'], ['electron', 'Electron'],
  ['django', 'Django'], ['flask', 'Flask'], ['fastapi', 'FastAPI'], ['tornado', 'Tornado'], ['sqlalchemy', 'SQLAlchemy'],
  ['laravel/framework', 'Laravel'], ['symfony/framework-bundle', 'Symfony'], ['rails', 'Ruby on Rails'], ['sinatra', 'Sinatra']
];

const CONTROL_DEFS = [
  { id: 'lockfile', label: 'Archivo de bloqueo de dependencias (lockfile)' },
  { id: 'gitignore', label: '.gitignore que excluye archivos .env' },
  { id: 'envExample', label: 'Plantilla de variables de entorno (.env.example)' },
  { id: 'securityPolicy', label: 'Política de seguridad (SECURITY.md)' },
  { id: 'depBot', label: 'Actualización automática de dependencias (Dependabot / Renovate)' },
  { id: 'ciSecurity', label: 'Análisis de seguridad automatizado en CI (CodeQL, Snyk, Trivy, Semgrep…)' },
  { id: 'tests', label: 'Pruebas automatizadas' },
  { id: 'passwordHash', label: 'Hash seguro de contraseñas (bcrypt, argon2, scrypt)' },
  { id: 'securityHeaders', label: 'Cabeceras de seguridad HTTP (helmet, CSP, talisman)' },
  { id: 'rateLimit', label: 'Límite de peticiones (rate limiting)' },
  { id: 'validation', label: 'Validación de entradas (zod, joi, pydantic, class-validator…)' },
  { id: 'csrf', label: 'Protección CSRF' },
  { id: 'dockerNonRoot', label: 'Contenedor con usuario sin privilegios', onlyIf: 'docker' }
];

function gradeFor(score) {
  if (score >= 90) return { letter: 'A', name: 'Excelente', risk: 'Bajo', color: '#16a34a' };
  if (score >= 75) return { letter: 'B', name: 'Buena', risk: 'Moderado', color: '#65a30d' };
  if (score >= 60) return { letter: 'C', name: 'Regular', risk: 'Medio', color: '#ca8a04' };
  if (score >= 40) return { letter: 'D', name: 'Deficiente', risk: 'Alto', color: '#ea580c' };
  return { letter: 'E', name: 'Crítica', risk: 'Crítico', color: '#b91c1c' };
}

/** Curva de decaimiento: cada punto de penalización resta menos cuanto peor está el proyecto. */
export const DECAY = 55;
const toScore = (penalty) => 100 * Math.exp(-penalty / DECAY);

export function computeScore(findings, controlsPresent) {
  const penaltyOf = (f) => SEV[f.severity].weight * (1 + 0.25 * Math.min(f.count - 1, 7));
  const penalty = findings.reduce((a, f) => a + penaltyOf(f), 0);
  const bonus = Math.min(8, controlsPresent * 1.2);
  const bySev = Object.fromEntries(SEV_ORDER.map(s => [s, findings.filter(f => f.severity === s).length]));
  const caps = [];
  if (bySev.critical >= 6) caps.push({ max: 34, reason: `${bySev.critical} tipos de hallazgos críticos` });
  else if (bySev.critical >= 3) caps.push({ max: 44, reason: `${bySev.critical} tipos de hallazgos críticos` });
  else if (bySev.critical >= 1) caps.push({ max: 64, reason: 'Existe al menos un hallazgo crítico' });
  if (bySev.high >= 4) caps.push({ max: 74, reason: `${bySev.high} tipos de hallazgos de severidad alta` });
  else if (bySev.high >= 1) caps.push({ max: 89, reason: 'Existe al menos un hallazgo de severidad alta' });

  const raw = Math.max(0, Math.min(100, toScore(Math.max(0, penalty - bonus))));
  let value = raw;
  const applied = [];
  for (const c of caps) if (value > c.max) { value = c.max; applied.push(c); }
  value = Math.round(value);

  const byCategory = CATEGORIES.map(cat => {
    const list = findings.filter(f => f.category === cat);
    const p = list.reduce((a, f) => a + penaltyOf(f), 0);
    return { category: cat, score: Math.round(toScore(p)), findings: list.length, instances: list.reduce((a, f) => a + f.count, 0) };
  });
  return { value, raw: Math.round(raw), penalty: Math.round(penalty * 10) / 10, bonus: Math.round(bonus * 10) / 10, caps: applied, bySeverity: bySev, byCategory, grade: gradeFor(value) };
}

// ---------------------------------------------------------------- análisis principal
/**
 * @param {ArrayBuffer} buffer contenido del ZIP
 * @param {{fileName?:string, includeDeps?:boolean, user?:object}} options
 * @param {(p:{stage:string, percent:number, detail?:string})=>void} onProgress
 */
export async function analyzeProject(buffer, options = {}, onProgress = () => {}) {
  const t0 = Date.now();
  const { fileName = 'proyecto.zip', includeDeps = false } = options;
  if (buffer.byteLength > LIMITS.maxZipBytes) throw new Error(`El ZIP supera el máximo permitido (${Math.round(LIMITS.maxZipBytes / 1048576)} MB).`);

  onProgress({ stage: 'Leyendo el archivo ZIP…', percent: 3 });
  await sleep();
  const zip = new ZipArchive(buffer);
  const files = zip.entries.filter(e => !e.isDir && !/(^|\/)__MACOSX\//.test(e.path));
  if (files.length === 0) throw new Error('El ZIP no contiene archivos.');
  if (files.length > LIMITS.maxEntries) throw new Error(`El ZIP tiene ${files.length.toLocaleString('es-PE')} archivos; el máximo es ${LIMITS.maxEntries.toLocaleString('es-PE')}.`);

  // raíz común (muchos ZIP traen una sola carpeta contenedora)
  const firstSeg = files[0].path.split('/')[0];
  const hasRoot = files.every(e => e.path.includes('/') && e.path.split('/')[0] === firstSeg);
  const prefix = hasRoot ? `${firstSeg}/` : '';
  const projectName = hasRoot ? firstSeg : fileName.replace(/\.zip$/i, '');
  const rel = (e) => (prefix ? e.path.slice(prefix.length) : e.path);

  const findings = new Findings();
  const inventory = { totalFiles: files.length, analyzedFiles: 0, totalLines: 0, totalBytes: 0, skipped: { excluded: 0, binary: 0, tooLarge: 0, encrypted: 0, minified: 0, unreadable: 0 }, languages: new Map(), folders: new Map(), frameworks: new Set(), largest: [] };
  const present = new Set();
  const manifests = [];
  const deps = [];
  const lockInfo = { npm: new Map() };
  const controlsEvidence = new Map();
  const markControl = (id, evidence) => { if (!controlsEvidence.has(id)) controlsEvidence.set(id, evidence); };
  const dockerfiles = [];
  const candidates = [];
  let hasWorkflows = false, hasCode = false, dockerSeen = false;

  // ---- paso 1: inventario y reglas por archivo
  onProgress({ stage: 'Inventariando archivos…', percent: 8 });
  await sleep();
  const onceDone = new Set();
  for (const e of files) {
    const r = rel(e);
    const name = r.split('/').pop();
    present.add(r);
    const segments = r.split('/');
    const folder = segments.length > 1 ? segments[0] : '(raíz)';
    inventory.folders.set(folder, (inventory.folders.get(folder) || 0) + 1);

    const excluded = segments.slice(0, -1).some(s => EXCLUDED_DIRS.has(s));
    for (const rule of FILE_RULES) {
      if (!rule.match(r, name)) continue;
      if (rule.once) {
        if (onceDone.has(rule.id)) continue;
        onceDone.add(rule.id);
        const di = segments.findIndex(s => EXCLUDED_DIRS.has(s));
        const isDir = di >= 0 && ['SEC-F05', 'SEC-F07', 'SEC-F08'].includes(rule.id);
        findings.add(rule, { file: isDir ? `${segments.slice(0, di + 1).join('/')}/` : r, note: isDir ? 'Carpeta incluida en el ZIP' : '' });
      } else if (!excluded) findings.add(rule, { file: r, note: `${Math.max(1, Math.round(e.size / 1024))} KB` });
    }
    if (excluded && !includeDeps) { inventory.skipped.excluded++; continue; }
    if (e.encrypted) { inventory.skipped.encrypted++; continue; }
    const ext = extOf(name);
    if (BINARY_EXT.has(ext)) { inventory.skipped.binary++; continue; }
    const isLock = LOCKFILES.has(name);
    const limit = isLock ? LIMITS.lockfileBytes : LIMITS.maxFileBytes;
    if (e.size > limit) { inventory.skipped.tooLarge++; continue; }
    candidates.push({ e, r, name, ext, isLock });
  }

  // ---- paso 2: lectura y análisis de contenido
  let totalRead = 0;
  for (let i = 0; i < candidates.length; i++) {
    const { e, r, name, ext, isLock } = candidates[i];
    if (i % 15 === 0) {
      onProgress({ stage: 'Analizando código y configuración…', percent: 10 + Math.round((i / candidates.length) * 70), detail: `${i.toLocaleString('es-PE')} de ${candidates.length.toLocaleString('es-PE')} archivos` });
      await sleep();
    }
    if (totalRead > LIMITS.maxTotalBytes) { inventory.skipped.tooLarge++; continue; }

    let bytes;
    try { bytes = await zip.read(e, isLock ? LIMITS.lockfileBytes : LIMITS.maxFileBytes); }
    catch { inventory.skipped.unreadable++; continue; }
    totalRead += bytes.length;
    if (bytes.subarray(0, 4000).includes(0)) { inventory.skipped.binary++; continue; }
    const text = new TextDecoder('utf-8').decode(bytes);

    const manifest = parseManifest(name, text, r);
    if (manifest) { manifests.push({ path: r, type: manifest.type, count: manifest.deps.length }); deps.push(...manifest.deps); if (manifest.meta?.springBoot) inventory.frameworks.add('Spring Boot'); }
    if (name === 'package-lock.json' || name === 'npm-shrinkwrap.json') {
      try {
        const lock = JSON.parse(text);
        for (const [k, v] of Object.entries(lock.packages || {})) {
          const idx = k.lastIndexOf('node_modules/');
          if (idx >= 0 && v.version) lockInfo.npm.set(k.slice(idx + 13), v.version);
        }
      } catch { /* ignorar */ }
    }
    if (isLock) { inventory.analyzedFiles++; continue; }

    const lines = text.split(/\r?\n/);
    const lang = LANG[ext];
    inventory.analyzedFiles++;
    inventory.totalLines += lines.length;
    inventory.totalBytes += bytes.length;
    inventory.largest.push({ file: r, bytes: bytes.length });
    if (lang) {
      const l = inventory.languages.get(lang) || { name: lang, files: 0, lines: 0 };
      l.files++; l.lines += lines.length; inventory.languages.set(lang, l);
      if (CODE_LANGS.has(lang)) hasCode = true;
    }
    if (/\.min\.(js|css)$/i.test(name) || ext === 'map' || (text.length > 20000 && text.length / lines.length > 500)) { inventory.skipped.minified++; continue; }

    // archivos especiales y controles positivos
    if (/^(dockerfile)/i.test(name) || ext === 'dockerfile') { dockerSeen = true; dockerfiles.push({ r, lines }); }
    if (/(^|\/)\.github\/workflows\/[^/]+\.ya?ml$/.test(r)) {
      hasWorkflows = true;
      if (/pull_request_target|permissions:\s*write-all/.test(text)) {
        const ln = lines.findIndex(l => /pull_request_target|permissions:\s*write-all/.test(l)) + 1;
        findings.add(DOCKER_RULES[5], { file: r, line: ln, snippet: lines[ln - 1].trim().slice(0, 140) });
      }
      if (/codeql|snyk|trivy|semgrep|gitleaks|dependency-check|bandit|npm audit|pip-audit|osv-scanner|sonar|checkmarx|veracode/i.test(text)) markControl('ciSecurity', r);
    }
    if (/^(docker-)?compose[\w.-]*\.ya?ml$/i.test(name)) {
      lines.forEach((l, idx) => { if (/^\s*privileged:\s*true|network_mode:\s*['"]?host/.test(l)) findings.add(DOCKER_RULES[4], { file: r, line: idx + 1, snippet: l.trim() }); });
    }
    if (name === '.gitignore' && /(^|\n)\s*\.env/.test(text)) markControl('gitignore', r);
    if (/(^|\/)SECURITY(\.md)?$/i.test(r)) markControl('securityPolicy', r);
    if (/(^|\/)(\.github\/dependabot\.ya?ml|renovate\.json5?|\.renovaterc(\.json)?)$/.test(r)) markControl('depBot', r);
    if (/^\.env\.(example|sample|template)$/i.test(name)) markControl('envExample', r);
    if (/(^|\/)(tests?|__tests__|specs?)\//i.test(r) || /\.(test|spec)\.[jt]sx?$/.test(name) || /^test_.*\.py$/.test(name)) markControl('tests', r);
    if (/\b(bcrypt|bcryptjs|argon2|scrypt|passlib|password_hash\s*\(|BCryptPasswordEncoder|PBKDF2)\b/i.test(text) && CODE_LANGS.has(lang)) markControl('passwordHash', r);
    if (/\bhelmet\b|Content-Security-Policy|flask[-_]talisman|django-csp|Strict-Transport-Security/i.test(text) && (CODE_LANGS.has(lang) || ext === 'json')) markControl('securityHeaders', r);
    if (/express-rate-limit|rate-limiter-flexible|flask[-_]limiter|slowapi|django-ratelimit|@nestjs\/throttler|RateLimit|throttle/i.test(text) && (CODE_LANGS.has(lang) || ext === 'json')) markControl('rateLimit', r);
    if (/\b(zod|joi|yup|express-validator|class-validator|pydantic|marshmallow|ajv|cerberus|wtforms)\b/i.test(text) && (CODE_LANGS.has(lang) || ext === 'json' || ext === 'txt')) markControl('validation', r);
    if (/\b(csurf|lusca|CsrfViewMiddleware|csrf_protect|flask[-_]wtf|csrf_token|csrfToken|XSRF)\b/i.test(text) && (CODE_LANGS.has(lang) || ext === 'html' || ext === 'json')) markControl('csrf', r);

    // reglas por línea
    const downgraded = TEST_PATH.test(r) || DOC_EXT.has(ext) || /\.(test|spec)\./.test(name);
    const rules = rulesFor(ext);
    if (rules.length) {
      for (let n = 0; n < lines.length; n++) {
        const line = lines[n];
        if (line.length < 6 || line.length > LIMITS.maxLineLength) continue;
        const comment = isCommentLine(line);
        for (const rule of rules) {
          if (comment && !rule.secret && rule.id !== 'SEC-K08') continue;
          const m = rule.re.exec(line);
          if (!m) continue;
          if (rule.test && !rule.test(line, m, { path: r, ext, name })) continue;
          const sev = downgraded ? DOWNGRADE[rule.sev] : rule.sev;
          const snippet = (rule.secret ? line.replace(m[0], maskSecret(m[0])) : line).trim().slice(0, 150);
          findings.add(rule, { file: r, line: n + 1, snippet, sev, note: downgraded ? 'Archivo de prueba o documentación (severidad reducida)' : '' });
        }
      }
    }
    if (/^(dockerfile)/i.test(name) || ext === 'dockerfile') analyzeDockerfile(r, lines, findings);
  }

  // ---- paso 3: dependencias
  onProgress({ stage: 'Revisando dependencias…', percent: 84 });
  await sleep();
  const flagged = [];
  for (const d of deps) {
    const resolved = d.eco === 'npm' ? lockInfo.npm.get(d.name) : null;
    const version = resolved || d.spec;
    const adv = findAdvisory(d.eco, d.name, version);
    if (adv) flagged.push({ ...d, version, resolved: !!resolved, advisory: adv });
  }
  for (const f of flagged) {
    const adv = f.advisory;
    findings.addCustom(`SEC-D:${adv.id}`, {
      title: `Dependencia vulnerable: ${adv.name} (${adv.id})`, cat: CAT.DEPS, sev: adv.severity, cwe: 'CWE-1395', owasp: OWASP_A06,
      what: `${adv.title}. Se declara ${adv.name} ${f.version}${f.resolved ? ' (versión resuelta en el lockfile)' : ' (versión mínima permitida por el rango)'}; la corrección está en la ${adv.fixed}.`,
      fix: `Actualiza ${adv.name} a la versión ${adv.fixed} o superior y vuelve a generar el archivo de bloqueo. Verifica con npm audit / pip-audit / OWASP Dependency-Check, ya que esta lista es indicativa.`
    }, { file: f.file, snippet: `${f.name}@${f.version}`, note: adv.id });
  }
  for (const r of present) {   // bibliotecas JS embebidas (jquery-1.12.4.min.js)
    const m = /(^|\/)jquery-(\d+\.\d+(?:\.\d+)?)(?:\.min)?\.js$/i.exec(r);
    const adv = m && findAdvisory('npm', 'jquery', m[2]);
    if (adv) {
      findings.addCustom('SEC-D04', { title: 'Biblioteca JavaScript embebida y desactualizada', cat: CAT.DEPS, sev: 'medium', cwe: 'CWE-1395', owasp: OWASP_A06,
        what: `El proyecto incluye jQuery ${m[2]} como archivo local. ${adv.title} (${adv.id}); corregido en ${adv.fixed}.`, fix: 'Actualiza la biblioteca o instálala desde el gestor de paquetes para poder auditarla y actualizarla.' }, { file: r, snippet: `jQuery ${m[2]}`, note: adv.id });
    }
  }
  const hasLock = (...names) => names.some(n => [...present].some(p => p.split('/').pop() === n));
  const manifestTypes = new Set(manifests.map(m => m.type));
  const lockChecks = [
    ['npm', ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', 'npm-shrinkwrap.json'], 'package.json'],
    ['composer', ['composer.lock'], 'composer.json'], ['bundler', ['Gemfile.lock'], 'Gemfile'], ['go', ['go.sum'], 'go.mod'],
    ['python', ['poetry.lock', 'Pipfile.lock', 'uv.lock'], 'pyproject.toml / Pipfile']
  ];
  for (const [type, locks, manifestName] of lockChecks) {
    if (!manifestTypes.has(type)) continue;
    if (hasLock(...locks)) markControl('lockfile', locks.find(l => hasLock(l)));
    else findings.addCustom('SEC-D02', { title: 'Sin archivo de bloqueo de dependencias (lockfile)', cat: CAT.DEPS, sev: 'low', cwe: 'CWE-1104', owasp: OWASP_A06,
      what: 'Sin lockfile cada instalación puede traer versiones distintas, incluidas versiones comprometidas o con vulnerabilidades nuevas.', fix: 'Genera y versiona el lockfile (npm install, poetry lock, composer install…) y usa instalaciones reproducibles (npm ci).' },
      { file: manifestName, note: `Ecosistema: ${type}` });
  }
  if (manifestTypes.has('pip') && hasLock('poetry.lock', 'Pipfile.lock')) markControl('lockfile', 'poetry.lock / Pipfile.lock');
  for (const d of deps) {
    const unpinnedNpm = d.eco === 'npm' && !d.dev && (/^(\*|latest|x|)$/i.test(d.spec.trim()) || /^(git|https?:|github:)/i.test(d.spec) || (/^>=?\s*\d/.test(d.spec) && !/<|\|\|/.test(d.spec)));
    const unpinnedPip = d.eco === 'pypi' && d.file.endsWith('.txt') && d.op !== '==';
    if (unpinnedNpm || unpinnedPip) {
      findings.addCustom('SEC-D03', { title: 'Dependencias sin versión fija', cat: CAT.DEPS, sev: 'low', cwe: 'CWE-1104', owasp: OWASP_A06,
        what: 'Las versiones abiertas (*, latest, >=) permiten instalar automáticamente versiones nuevas sin revisar, incluido código malicioso en ataques a la cadena de suministro.',
        fix: 'Fija versiones exactas o rangos acotados (^1.2.3, ==1.2.3) y actualiza de forma controlada con Dependabot o Renovate.' },
        { file: d.file, snippet: `${d.name}${d.spec ? ` ${d.spec}` : ' (sin versión)'}` });
    }
  }
  const allDepNames = new Set(deps.map(d => d.name));
  if (allDepNames.has('express') && !allDepNames.has('helmet')) {
    findings.addCustom('SEC-H05', { title: 'Servidor Express sin cabeceras de seguridad (helmet)', cat: CAT.CONFIG, sev: 'low', cwe: 'CWE-693', owasp: OWASP_A05,
      what: 'La aplicación usa Express pero no se detecta helmet; faltan cabeceras como CSP, X-Frame-Options o HSTS.', fix: 'Instala helmet y actívalo con app.use(helmet()). Ajusta la política CSP a tu aplicación.' }, { file: 'package.json', snippet: 'express sin helmet' });
  }
  for (const [dep, label] of FRAMEWORKS) if (allDepNames.has(dep)) inventory.frameworks.add(label);
  if (present.has('manage.py')) inventory.frameworks.add('Django');
  if (present.has('artisan')) inventory.frameworks.add('Laravel');
  if (manifestTypes.has('maven')) inventory.frameworks.add('Maven');
  if (manifestTypes.has('gradle')) inventory.frameworks.add('Gradle');
  if (manifestTypes.has('go')) inventory.frameworks.add('Go modules');
  if (dockerSeen) inventory.frameworks.add('Docker');
  if (hasWorkflows) inventory.frameworks.add('GitHub Actions');
  const hasDep = (list) => deps.some(d => list.includes(d.name));
  if (hasDep(['bcrypt', 'bcryptjs', 'argon2', 'passlib', 'scrypt'])) markControl('passwordHash', 'dependencias');
  if (hasDep(['helmet', 'flask-talisman', 'django-csp'])) markControl('securityHeaders', 'dependencias');
  if (hasDep(['express-rate-limit', 'rate-limiter-flexible', 'flask-limiter', 'slowapi', 'django-ratelimit', '@nestjs/throttler'])) markControl('rateLimit', 'dependencias');
  if (hasDep(['zod', 'joi', 'yup', 'express-validator', 'class-validator', 'pydantic', 'marshmallow', 'ajv'])) markControl('validation', 'dependencias');
  if (hasDep(['csurf', 'lusca', 'flask-wtf'])) markControl('csrf', 'dependencias');
  if (allDepNames.has('django')) markControl('csrf', 'Django incluye protección CSRF');
  if (dockerfiles.length && dockerfiles.every(d => hasNonRootUser(d.lines))) markControl('dockerNonRoot', dockerfiles[0].r);

  // ---- paso 4: higiene general
  onProgress({ stage: 'Evaluando buenas prácticas…', percent: 90 });
  await sleep();
  if (hasCode && ![...present].some(p => p === '.gitignore' || p.endsWith('/.gitignore'))) {
    findings.addCustom('SEC-H01', { title: 'El proyecto no tiene archivo .gitignore', cat: CAT.HYGIENE, sev: 'low', cwe: 'CWE-538', owasp: OWASP_A05,
      what: 'Sin .gitignore es fácil subir por error credenciales, dependencias o archivos locales al repositorio.', fix: 'Crea un .gitignore con .env, claves, logs, carpetas de dependencias y salidas de compilación.' }, { file: '(raíz del proyecto)' });
  }
  if (hasCode && !controlsEvidence.has('securityPolicy')) {
    findings.addCustom('SEC-H02', { title: 'No hay política de seguridad (SECURITY.md)', cat: CAT.HYGIENE, sev: 'info', cwe: 'CWE-1059', owasp: OWASP_A04,
      what: 'No se indica cómo reportar vulnerabilidades, lo que retrasa su corrección.', fix: 'Agrega un SECURITY.md con un contacto y el proceso de reporte responsable.' }, { file: '(raíz del proyecto)' });
  }
  if (hasCode && !controlsEvidence.has('ciSecurity')) {
    findings.addCustom('SEC-H03', { title: 'Sin análisis de seguridad automatizado', cat: CAT.HYGIENE, sev: 'info', cwe: 'CWE-1059', owasp: OWASP_A04,
      what: 'No se detectó CodeQL, Snyk, Trivy, Semgrep u otra herramienta en el pipeline.', fix: 'Activa CodeQL o Semgrep y el escaneo de dependencias (Dependabot/Snyk) en cada pull request.' }, { file: '.github/workflows/' });
  }
  if (hasCode && !controlsEvidence.has('tests')) {
    findings.addCustom('SEC-H04', { title: 'No se detectaron pruebas automatizadas', cat: CAT.HYGIENE, sev: 'info', cwe: 'CWE-1059', owasp: OWASP_A04,
      what: 'Sin pruebas es más difícil detectar regresiones de seguridad al cambiar el código.', fix: 'Agrega pruebas unitarias y de integración, incluyendo casos de autorización y validación de entradas.' }, { file: '(proyecto)' });
  }

  // ---- paso 5: puntaje y resultado
  onProgress({ stage: 'Calculando el puntaje de seguridad…', percent: 96 });
  await sleep();
  const list = findings.list().sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity) || b.count - a.count);
  list.forEach((f, i) => { f.id = `H-${String(i + 1).padStart(2, '0')}`; });

  const applicable = CONTROL_DEFS.filter(c => !c.onlyIf || (c.onlyIf === 'docker' && dockerSeen));
  const controls = applicable.map(c => ({ id: c.id, label: c.label, present: controlsEvidence.has(c.id), evidence: controlsEvidence.get(c.id) || '' }));
  const score = computeScore(list, controls.filter(c => c.present).length);

  const totalLangLines = [...inventory.languages.values()].reduce((a, l) => a + l.lines, 0) || 1;
  const languages = [...inventory.languages.values()].sort((a, b) => b.lines - a.lines).map(l => ({ ...l, pct: Math.round(l.lines / totalLangLines * 1000) / 10 }));
  const folders = [...inventory.folders.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([name, count]) => ({ name, count }));
  inventory.largest.sort((a, b) => b.bytes - a.bytes);

  onProgress({ stage: 'Análisis completado', percent: 100 });
  return {
    meta: { projectName, fileName, zipBytes: buffer.byteLength, analyzedAt: Date.now(), durationMs: Date.now() - t0, analyzerVersion: ANALYZER_VERSION, includeDeps, user: options.user || null },
    inventory: {
      totalFiles: inventory.totalFiles, analyzedFiles: inventory.analyzedFiles, totalLines: inventory.totalLines, totalBytes: inventory.totalBytes, skipped: inventory.skipped,
      languages, folders, manifests, frameworks: [...inventory.frameworks].sort(), largest: inventory.largest.slice(0, 5), dependencies: deps.length
    },
    findings: list,
    dependencies: { total: deps.length, flagged },
    controls,
    score
  };
}

function isCommentLine(line) {
  return /^\s*(\/\/|\/\*|\*\s|\*$|#(?!\s*(include|define))|<!--|--\s)/.test(line);
}

function hasNonRootUser(lines) {
  const users = lines.map(l => /^\s*USER\s+(\S+)/i.exec(l)).filter(Boolean).map(m => m[1].toLowerCase());
  return users.length > 0 && !['root', '0', '0:0'].includes(users[users.length - 1]);
}

function analyzeDockerfile(path, lines, findings) {
  const aliases = new Set();
  let lastFrom = 1;
  lines.forEach((raw, idx) => {
    const line = raw.trim();
    const from = /^FROM\s+(--platform=\S+\s+)?(\S+)(?:\s+AS\s+(\S+))?/i.exec(line);
    if (from) {
      lastFrom = idx + 1;
      const image = from[2];
      if (from[3]) aliases.add(from[3].toLowerCase());
      if (image.toLowerCase() !== 'scratch' && !aliases.has(image.toLowerCase()) && !image.includes('$') && !image.includes('@sha256')) {
        const tag = image.includes(':') ? image.split(':').pop() : '';
        if (!tag || tag === 'latest') findings.add(DOCKER_RULES[1], { file: path, line: idx + 1, snippet: line.slice(0, 120) });
      }
    }
    const env = /^(ENV|ARG)\s+([\w]*(PASSWORD|PASSWD|SECRET|TOKEN|API_?KEY|PRIVATE_?KEY)[\w]*)\s*[= ]\s*(\S+)/i.exec(line);
    if (env) {
      const value = env[4].replace(/^["']|["']$/g, '');
      if (looksLikeSecret(value)) findings.add(DOCKER_RULES[2], { file: path, line: idx + 1, snippet: `${env[1].toUpperCase()} ${env[2]}=${maskSecret(value)}` });
    }
    if (/^EXPOSE\s+.*\b22\b/i.test(line)) findings.add(DOCKER_RULES[3], { file: path, line: idx + 1, snippet: line });
  });
  if (!hasNonRootUser(lines)) findings.add(DOCKER_RULES[0], { file: path, line: lastFrom, snippet: 'No se define una instrucción USER sin privilegios' });
}
