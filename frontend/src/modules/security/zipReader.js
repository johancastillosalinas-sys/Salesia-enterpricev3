/**
 * @file zipReader.js
 * @description Lector de archivos ZIP en el navegador, sin librerías externas.
 * Soporta compresión "stored" y "deflate" (con DecompressionStream) y ZIP64.
 * Todo se procesa en memoria: nada se sube a ningún servidor.
 */

export class ZipError extends Error {}

const SIG_EOCD = 0x06054b50;
const SIG_CD = 0x02014b50;
const SIG_LOCAL = 0x04034b50;
const SIG_Z64_LOCATOR = 0x07064b50;
const SIG_Z64_EOCD = 0x06064b50;

function decodeName(bytes, utf8Flag) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { return new TextDecoder(utf8Flag ? 'utf-8' : 'windows-1252').decode(bytes); }
}

export class ZipArchive {
  constructor(arrayBuffer) {
    this.bytes = new Uint8Array(arrayBuffer);
    this.view = new DataView(arrayBuffer);
    this.entries = [];
    this.#readDirectory();
  }

  #findEocd() {
    const len = this.bytes.length;
    if (len < 22) throw new ZipError('El archivo es demasiado pequeño para ser un ZIP.');
    const min = Math.max(0, len - 22 - 65535);
    for (let i = len - 22; i >= min; i--) {
      if (this.view.getUint32(i, true) === SIG_EOCD) return i;
    }
    throw new ZipError('No es un archivo ZIP válido (no se encontró el directorio central).');
  }

  #readDirectory() {
    const v = this.view;
    const eocd = this.#findEocd();
    let total = v.getUint16(eocd + 10, true);
    let cdSize = v.getUint32(eocd + 12, true);
    let cdOffset = v.getUint32(eocd + 16, true);

    if (total === 0xFFFF || cdSize === 0xFFFFFFFF || cdOffset === 0xFFFFFFFF) {
      const loc = eocd - 20;
      if (loc < 0 || v.getUint32(loc, true) !== SIG_Z64_LOCATOR) throw new ZipError('ZIP64 inválido.');
      const rec = Number(v.getBigUint64(loc + 8, true));
      if (v.getUint32(rec, true) !== SIG_Z64_EOCD) throw new ZipError('ZIP64 inválido.');
      total = Number(v.getBigUint64(rec + 32, true));
      cdSize = Number(v.getBigUint64(rec + 40, true));
      cdOffset = Number(v.getBigUint64(rec + 48, true));
    }
    if (cdOffset + cdSize > this.bytes.length) throw new ZipError('El ZIP está incompleto o dañado.');

    let p = cdOffset;
    for (let i = 0; i < total; i++) {
      if (p + 46 > this.bytes.length || v.getUint32(p, true) !== SIG_CD) throw new ZipError('El directorio central del ZIP está dañado.');
      const flags = v.getUint16(p + 8, true);
      const method = v.getUint16(p + 10, true);
      let compressed = v.getUint32(p + 20, true);
      let size = v.getUint32(p + 24, true);
      const nameLen = v.getUint16(p + 28, true);
      const extraLen = v.getUint16(p + 30, true);
      const commentLen = v.getUint16(p + 32, true);
      let offset = v.getUint32(p + 42, true);
      const name = decodeName(this.bytes.subarray(p + 46, p + 46 + nameLen), !!(flags & 0x800));

      if (size === 0xFFFFFFFF || compressed === 0xFFFFFFFF || offset === 0xFFFFFFFF) {
        let q = p + 46 + nameLen;
        const end = q + extraLen;
        while (q + 4 <= end) {
          const id = v.getUint16(q, true), sz = v.getUint16(q + 2, true);
          if (id === 0x0001) {
            let r = q + 4;
            if (size === 0xFFFFFFFF) { size = Number(v.getBigUint64(r, true)); r += 8; }
            if (compressed === 0xFFFFFFFF) { compressed = Number(v.getBigUint64(r, true)); r += 8; }
            if (offset === 0xFFFFFFFF) { offset = Number(v.getBigUint64(r, true)); }
            break;
          }
          q += 4 + sz;
        }
      }
      const path = name.replace(/\\/g, '/');
      this.entries.push({ path, size, compressedSize: compressed, method, offset, encrypted: !!(flags & 1), isDir: path.endsWith('/') });
      p += 46 + nameLen + extraLen + commentLen;
    }
  }

  /** Lee y descomprime una entrada. `limit` evita bombas de descompresión. */
  async read(entry, limit = 4 * 1024 * 1024) {
    if (entry.encrypted) throw new ZipError('Entrada cifrada.');
    const v = this.view;
    const o = entry.offset;
    if (o + 30 > this.bytes.length || v.getUint32(o, true) !== SIG_LOCAL) throw new ZipError(`Entrada dañada: ${entry.path}`);
    const start = o + 30 + v.getUint16(o + 26, true) + v.getUint16(o + 28, true);
    const data = this.bytes.subarray(start, start + entry.compressedSize);

    if (entry.method === 0) return data.length > limit ? data.subarray(0, limit) : data;
    if (entry.method !== 8) throw new ZipError(`Método de compresión no soportado (${entry.method}).`);

    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    const reader = stream.getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > limit) { await reader.cancel(); break; }
      chunks.push(value);
    }
    const out = new Uint8Array(Math.min(total, limit));
    let pos = 0;
    for (const c of chunks) { out.set(c.subarray(0, Math.max(0, out.length - pos)), pos); pos += c.length; }
    return out;
  }
}
