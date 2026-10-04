import { safePath } from "./zip.js";

export function localPath(value) {
  const path = value.replace(/^\.\//, "").split(/[?#]/)[0];
  if (/^[a-z]+:|^\/|^\/\//i.test(path)) throw new Error("Das Paket verweist auf externe Dateien und kann nicht offline installiert werden.");
  return safePath(decodeURIComponent(path));
}

// Select the actual game, not the outer desktop start/README page. The same
// reader accepts the existing Eduki archives, including the nested Math games.
export async function readPackage(zip, edition) {
  const candidates = [...zip.entries.keys()].filter(path =>
    (path === edition.startFile || path.endsWith("/" + edition.startFile)) && !path.startsWith("__MACOSX/"));
  if (candidates.length !== 1) throw new Error(`Bitte die ${edition.demo ? "Demo-ZIP" : "Vollversions-ZIP"} für ${edition.name} auswählen.`);
  const root = candidates[0].slice(0, -edition.startFile.length);
  const html = new TextDecoder().decode(await zip.read(root + edition.startFile));
  const title = /<title>([\s\S]*?)<\/title>/i.exec(html)?.[1] || "";
  const demo = /data-build\s*=\s*["']demo["']/.test(html) || /src\s*=\s*["']demo-mode\.js(?:[?"'])/.test(html);
  if (!title.includes(edition.title) || demo !== edition.demo || !/id=["']setup["']/.test(html) || !/id=["']field["']/.test(html)) {
    throw new Error(`Dieses Paket gehört nicht zu ${edition.name}. Vollversionen und Demos haben eigene Installationsseiten.`);
  }
  if (edition.editionId) {
    const source = new TextDecoder().decode(await zip.read(root + "edition.js"));
    const id = /"id"\s*:\s*"([^"]+)"/.exec(source)?.[1];
    if (id !== edition.editionId) throw new Error("Das Paket gehört zu einer anderen Edition.");
  }
  let files;
  if (zip.entries.has(root + "offline-assets.json")) {
    const list = JSON.parse(new TextDecoder().decode(await zip.read(root + "offline-assets.json")));
    if (!Array.isArray(list) || !list.length || list.some(path => typeof path !== "string")) throw new Error("Das Offline-Dateiverzeichnis ist beschädigt.");
    const runtimeList = list.map(localPath).filter(path => !/(^|\/)(?:\.DS_Store|\._[^/]+|__MACOSX)(?:\/|$)/.test(path));
    files = new Set([edition.startFile, "offline-assets.json", ...runtimeList]);
  } else {
    // Old Math packages already contain the complete offline runtime. Enumerate
    // their game subtree locally; no repurchase or special re-download needed.
    files = new Set([...zip.entries.keys()].filter(path => path.startsWith(root)).map(path => path.slice(root.length))
      .filter(path => /\.(?:html|js|css|json|webmanifest|png|jpe?g|svg|webp|gif|woff2?|ttf|otf|mp3|wav|ogg|m4a|mp4|txt|pdf)$/i.test(path) && !/(^|\/)(tests|tmp|integration|backups)\//.test(path)));
  }
  for (const match of html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
    files.add(localPath(match[1]));
  }
  for (const path of zip.entries.keys()) {
    const relative = path.slice(root.length);
    if (path.startsWith(root) && /(^|\/)LICENSE[^/]*$/i.test(relative)) files.add(relative);
  }
  for (const path of files) {
    safePath(path);
    if (!zip.entries.has(root + path)) throw new Error(`Das Paket ist unvollständig: ${path}`);
  }
  return { root, html, files };
}
