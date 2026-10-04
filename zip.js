import { inflateSync } from "./vendor/fflate-0.8.2.js";

const MAX_TOTAL = 600 * 1024 * 1024;
const MAX_FILE = 100 * 1024 * 1024;
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let value = n;
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  crcTable[n] = value >>> 0;
}
export function crc32(data) {
  let value = 0xffffffff;
  for (const byte of data) value = (value >>> 8) ^ crcTable[(value ^ byte) & 255];
  return (value ^ 0xffffffff) >>> 0;
}
export function safePath(name) {
  if (!name || name.startsWith("/") || name.includes("\\") || /[\x00-\x1f]/.test(name) || name.split("/").some(part => part === ".." || part === ".") || /^[a-z]:/i.test(name)) {
    throw new Error("Die ZIP enthält einen ungültigen Dateipfad.");
  }
  return name;
}
export async function openZip(file) {
  if (file.size > MAX_TOTAL) throw new Error("Die ZIP ist zu groß. Bitte das normale Vocab-Cup-Käuferpaket auswählen.");
  const tail = new Uint8Array(await file.slice(Math.max(0, file.size - 65557)).arrayBuffer());
  const tailView = new DataView(tail.buffer);
  let end = -1;
  for (let index = tail.length - 22; index >= 0; index--) {
    if (tailView.getUint32(index, true) === 0x06054b50 && index + 22 + tailView.getUint16(index + 20, true) === tail.length) { end = index; break; }
  }
  if (end < 0) throw new Error("Keine vollständige ZIP-Datei. Bitte den Eduki-Download erneut laden.");
  const count = tailView.getUint16(end + 10, true);
  const size = tailView.getUint32(end + 12, true);
  const offset = tailView.getUint32(end + 16, true);
  if (tailView.getUint32(end + 4, true) !== 0 || tailView.getUint16(end + 8, true) !== count || count === 65535 || offset === 0xffffffff || size === 0xffffffff || count > 6000 || offset + size > file.size - 22 || size > 8 * 1024 * 1024) {
    throw new Error("Dieses ZIP-Format wird nicht unterstützt. Bitte die unveränderte Eduki-ZIP verwenden.");
  }
  const central = new Uint8Array(await file.slice(offset, offset + size).arrayBuffer());
  const view = new DataView(central.buffer);
  const entries = new Map();
  let cursor = 0, totalSize = 0;
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > central.length || view.getUint32(cursor, true) !== 0x02014b50) throw new Error("Das ZIP-Dateiverzeichnis ist beschädigt.");
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const crc = view.getUint32(cursor + 16, true);
    const compressed = view.getUint32(cursor + 20, true);
    const expanded = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    if (next > central.length) throw new Error("Das ZIP-Dateiverzeichnis ist unvollständig.");
    const name = safePath(new TextDecoder(flags & 2048 ? "utf-8" : "windows-1252").decode(central.subarray(cursor + 46, cursor + 46 + nameLength)));
    totalSize += expanded;
    if (flags & 1 || ![0, 8].includes(method) || expanded > MAX_FILE || totalSize > MAX_TOTAL || localOffset + 30 + compressed > offset) throw new Error("Die ZIP ist verschlüsselt, zu groß oder beschädigt. Bitte das normale Käuferpaket verwenden.");
    if (entries.has(name)) throw new Error("Die ZIP enthält doppelte Dateinamen.");
    if (!name.endsWith("/")) entries.set(name, { name, method, crc, compressed, expanded, localOffset });
    cursor = next;
  }
  return {
    entries,
    async read(name) {
      const entry = entries.get(name);
      if (!entry) throw new Error(`Im Käuferpaket fehlt: ${name}`);
      const header = new DataView(await file.slice(entry.localOffset, entry.localOffset + 30).arrayBuffer());
      if (header.byteLength !== 30 || header.getUint32(0, true) !== 0x04034b50) throw new Error("Ein ZIP-Dateikopf ist beschädigt.");
      const start = entry.localOffset + 30 + header.getUint16(26, true) + header.getUint16(28, true);
      if (start + entry.compressed > offset) throw new Error("Eine Spieldatei ist unvollständig.");
      const input = new Uint8Array(await file.slice(start, start + entry.compressed).arrayBuffer());
      // Extract one file at a time so iPad memory does not hold the complete game.
      const bytes = entry.method === 0 ? input : inflateSync(input, { out: new Uint8Array(entry.expanded) });
      if (bytes.length !== entry.expanded || crc32(bytes) !== entry.crc) throw new Error(`Beschädigte Spieldatei: ${name}`);
      return bytes;
    },
  };
}
