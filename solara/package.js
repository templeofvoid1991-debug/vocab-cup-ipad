import { safePath } from './zip.js';
export function localPath(value) {
  if(typeof value!=='string' || /[?#%]|^[a-z]+:|^\/|\/\//i.test(value) || value!==value.trim()) throw new Error('Ungültiger Paketpfad.');
  return safePath(value.replace(/^\.\//,''));
}
export async function readPackage(zip) {
  const matches=[...zip.entries.keys()].filter(p=>p==='solara-package.json'||p.endsWith('/solara-package.json'));
  if(matches.length!==1) throw new Error('Bitte das Solara-iPad-Paket auswählen. Die Mac-App lässt sich hier nicht installieren.');
  const root=matches[0].slice(0,-'solara-package.json'.length);
  const manifest=JSON.parse(new TextDecoder().decode(await zip.read(matches[0])));
  if(manifest.schema!==1 || manifest.product!=='solara' || manifest.start!=='index.html' || !Array.isArray(manifest.files) || manifest.files.length>1000 || manifest.files.length<10) throw new Error('Das Solara-Dateiverzeichnis ist beschädigt.');
  const files=new Set(), records=new Map();
  for(const row of manifest.files) {
    const path=localPath(row.path);
    if(files.has(path)|| !Number.isSafeInteger(row.bytes)||row.bytes<1|| !/^[a-f0-9]{64}$/.test(row.sha256)) throw new Error('Ungültiger Solara-Dateieintrag.');
    if(!zip.entries.has(root+path)||zip.entries.get(root+path).expanded!==row.bytes) throw new Error(`Das Paket ist unvollständig: ${path}`);
    files.add(path);records.set(path,row);
  }
  for(const path of ['index.html','bridge.js','style.css','browser-stage.apk','runtime/pythons.js','runtime/cpythonrc.py','runtime/cpython312/main.js','runtime/browserfs.min.js','runtime/cpython312/main.wasm','runtime/cpython312/main.data','repo/index-090-cp312.json','repo/repodata.json','repo/cp312/pygame_static-1.0-cp312-cp312-wasm32_bi_emscripten.whl']) if(!files.has(path)) throw new Error(`Spieldatei fehlt: ${path}`);
  const html=new TextDecoder().decode(await zip.read(root+'index.html'));
  if(!html.includes('The Starheart of Solara') || /(?:src|href)\s*=\s*["']https?:\/\//i.test(html)) throw new Error('Das Paket ist keine vollständige Offline-Ausgabe.');
  files.add('solara-package.json');
  return {root,html,files,records};
}
