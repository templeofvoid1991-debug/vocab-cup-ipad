import { openZip, safePath } from "./zip.js";

const store = VocabCupInstallStore;
const base = new URL(store.base);
const fileInput = document.querySelector("#packageFile");
const status = document.querySelector("#installStatus");
const progress = document.querySelector("#installProgress");
const installedPanel = document.querySelector("#installedPanel");
const description = document.querySelector("#installedDescription");
const playLink = document.querySelector("#playLink");
const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIPad = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const startFile = "Start Vocab Cup.html";
const mimeTypes = { html: "text/html; charset=utf-8", js: "text/javascript; charset=utf-8", css: "text/css; charset=utf-8", json: "application/json", webmanifest: "application/manifest+json", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", svg: "image/svg+xml", txt: "text/plain; charset=utf-8", pdf: "application/pdf" };
const localPath = value => {
  const path = value.replace(/^\.\//, "").split(/[?#]/)[0];
  if (/^[a-z]+:|^\//i.test(path)) throw new Error("Das Paket verweist auf externe Dateien und kann nicht offline installiert werden.");
  return safePath(decodeURIComponent(path));
};

async function verify(installed) {
  const cache = await caches.open(installed.cacheName);
  for (const path of installed.files) if (!(await cache.match(new URL("game/" + path, base)))) return false;
  return true;
}
async function showInstalled(installed) {
  installedPanel.hidden = !installed;
  if (!installed) return;
  description.textContent = `${installed.files.length} Spieldateien lokal installiert. Deine Eduki-ZIP wurde nicht hochgeladen.`;
  playLink.href = new URL("game/" + encodeURIComponent(startFile), base).href;
}

async function install(file) {
  fileInput.disabled = true;
  progress.hidden = false;
  progress.value = 0;
  progress.max = 1;
  status.textContent = "Käuferpaket wird geprüft. Bitte die App geöffnet lassen…";
  let candidateCache = null;
  let committed = false;
  let wakeLock;
  try {
    try { wakeLock = await navigator.wakeLock?.request("screen"); } catch { /* Keep-open instruction remains visible. */ }
    const zip = await openZip(file);
    const candidates = [...zip.entries.keys()].filter(path => path === startFile || path.endsWith("/" + startFile)).filter(path => !path.startsWith("__MACOSX/"));
    if (candidates.length !== 1) throw new Error("Bitte die vollständige Vocab-Cup-ZIP aus deinem Eduki-Kauf auswählen.");
    const root = candidates[0].slice(0, -startFile.length);
    const html = new TextDecoder().decode(await zip.read(root + startFile));
    const doc = new DOMParser().parseFromString(html, "text/html");
    if (!doc.title.includes("Vocab Cup") || !doc.querySelector("#setup") || !doc.querySelector("#field")) throw new Error("Dieses Paket enthält keine unterstützte Vocab-Cup-Version.");
    const assetList = JSON.parse(new TextDecoder().decode(await zip.read(root + "offline-assets.json")));
    if (!Array.isArray(assetList) || assetList.length < 100 || assetList.some(path => typeof path !== "string")) throw new Error("Das Offline-Dateiverzeichnis im Paket fehlt oder ist beschädigt.");

    // The installation helper owns the offline cache. Do not register the desktop worker.
    for (const script of doc.querySelectorAll("script[src]")) {
      if (localPath(script.getAttribute("src")) === "desktop-app.js") script.remove();
    }
    const files = new Set([startFile, "offline-assets.json", ...assetList.map(localPath)]);
    for (const element of doc.querySelectorAll("script[src], link[rel=stylesheet], link[rel=icon], link[rel=apple-touch-icon]")) {
      files.add(localPath(element.getAttribute("src") || element.getAttribute("href")));
    }
    // Preserve the source/licensing notices with the locally installed game.
    for (const path of zip.entries.keys()) {
      const relative = path.slice(root.length);
      if (path.startsWith(root) && (relative.startsWith("docs/LICENSE") || /(^|\/)LICENSE[^/]*$/i.test(relative))) files.add(relative);
    }
    for (const path of files) if (!zip.entries.has(root + path)) throw new Error(`Das Käuferpaket ist unvollständig: ${path}`);

    const compatibilityStyle = doc.createElement("link");
    compatibilityStyle.rel = "stylesheet";
    compatibilityStyle.href = "../game-compat.css";
    doc.head.append(compatibilityStyle);
    const manifest = doc.querySelector("link[rel=manifest]");
    if (manifest) manifest.setAttribute("href", "../manifest.webmanifest");
    const viewport = doc.querySelector("meta[name=viewport]");
    if (viewport && !viewport.content.includes("viewport-fit")) viewport.content += ", viewport-fit=cover";
    const back = doc.createElement("p");
    back.className = "setup-hint";
    const link = doc.createElement("a");
    link.href = "../index.html?setup=1";
    link.textContent = "iPad-Installation / Update";
    link.style.color = "inherit";
    back.append(link);
    doc.querySelector("#setupTitle")?.after(back);
    const importedHTML = "<!doctype html>\n" + doc.documentElement.outerHTML;

    candidateCache = store.prefix + "game-" + crypto.randomUUID();
    const cache = await caches.open(candidateCache);
    const paths = [...files];
    progress.max = paths.length;
    for (const [index, path] of paths.entries()) {
      const bytes = path === startFile ? importedHTML : await zip.read(root + path);
      const type = mimeTypes[path.split(".").at(-1).toLowerCase()] || "application/octet-stream";
      await cache.put(new URL("game/" + path, base), new Response(bytes, { headers: { "Content-Type": type } }));
      progress.value = index + 1;
      status.textContent = `${index + 1} von ${paths.length} Dateien installiert. Bitte die App geöffnet lassen…`;
    }
    const installed = { cacheName: candidateCache, files: paths, installedAt: new Date().toISOString(), sourceName: file.name };
    status.textContent = "Offline-Dateien werden überprüft…";
    if (!await verify(installed)) throw new Error("Die Spieldateien konnten nicht vollständig gespeichert werden. Bitte freien Speicher prüfen und erneut versuchen.");
    // Switch packages only after every file was verified. Failed updates keep the old game.
    await store.write(installed);
    committed = true;
    for (const name of await caches.keys()) {
      if (name.startsWith(store.prefix + "game-") && name !== candidateCache) {
        try { await caches.delete(name); } catch { /* A later installation can remove the old cache. */ }
      }
    }
    await showInstalled(installed);
    status.textContent = "Fertig. Das vollständige Spiel ist auf diesem iPad gespeichert. Jetzt im Flugmodus testen.";
  } catch (error) {
    if (candidateCache && !committed) await caches.delete(candidateCache);
    status.textContent = error.name === "QuotaExceededError"
      ? "Nicht genug freier Speicher. Bitte Platz schaffen und die ZIP erneut auswählen."
      : `Installation nicht abgeschlossen: ${error.message}`;
  } finally {
    try { await wakeLock?.release(); } catch { /* Screen lock may already have been released. */ }
    fileInput.disabled = false;
    fileInput.value = "";
  }
}

fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  if (!file) return;
  if (navigator.locks) {
    await navigator.locks.request(store.prefix + "install", { ifAvailable: true }, async lock => {
      if (lock) await install(file);
      else status.textContent = "In einem anderen Fenster läuft bereits eine Installation. Bitte dort abschließen.";
    });
  } else await install(file);
});

try {
  if (!isSecureContext || !("serviceWorker" in navigator) || !("caches" in window)) throw new Error("Bitte die Installationsadresse in aktuellem Safari über HTTPS öffnen. Eine HTML-Datei aus der Dateien-App reicht nicht.");
  await navigator.serviceWorker.register("./service-worker.js", { scope: "./" });
  await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller) {
    await new Promise(resolve => navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true }));
  }
  const installed = await store.read();
  const valid = installed && await verify(installed);
  await showInstalled(valid ? installed : null);
  if (standalone) document.querySelector("#browserInstructions").hidden = true;
  if (isIPad && !standalone) {
    status.textContent = "Bitte zuerst zum Home-Bildschirm hinzufügen und das neue Icon öffnen. Dort deine Eduki-ZIP auswählen.";
  } else {
    fileInput.disabled = false;
    status.textContent = valid ? "Das Spiel ist vollständig offline installiert." : installed
      ? "Die gespeicherten Spieldateien sind unvollständig. Bitte die Eduki-ZIP erneut auswählen."
      : "Bereit. Wähle deine gekaufte Vocab-Cup-ZIP aus.";
  }
  if (valid && standalone && !new URL(location.href).searchParams.has("setup")) location.replace(playLink.href);
} catch (error) {
  status.textContent = `Einrichtung noch nicht möglich: ${error.message}`;
}
