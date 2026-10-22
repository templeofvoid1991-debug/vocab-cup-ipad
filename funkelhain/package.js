import { safePath } from './zip.js';
export function localPath(value) {
 const p=value.replace(/^\.\//,'').split(/[?#]/)[0];
 if(/^[a-z]+:|^\/|^\/\//i.test(p))throw Error('Eine Laufzeitdatei verweist nach außerhalb des Offline-Pakets.');
 return safePath(decodeURIComponent(p));
}
export async function readPackage(zip,edition) {
 const candidates=[...zip.entries.keys()].filter(p=>/(^|\/)Funkelhain\/index\.html$/.test(p)&&!p.startsWith('__MACOSX/'));
 if(candidates.length!==1)throw Error('Bitte die vollständige Funkelhain-Web-ZIP auswählen (Funkelhain.zip).');
 const start=candidates[0],root=start.slice(0,-'index.html'.length),html=new TextDecoder().decode(await zip.read(start));
 if(!/<title>[^<]*Funkelhain/i.test(html)||!['welcome','village','hiddenNumber','teacherDialog'].every(id=>new RegExp('id=["\x27]'+id+'["\x27]').test(html))||!html.includes('runtime.js')||!html.includes('content.js'))throw Error('Die ZIP enthält keine vollständige Funkelhain-App.');
 const files=new Set([...zip.entries.keys()].filter(p=>p.startsWith(root)).map(p=>p.slice(root.length)).filter(p=>p&&!/(^|\/)(?:\.DS_Store|\._[^/]+|__MACOSX)(?:\/|$)/.test(p)));
 for(const m of html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)){
  if(m[1].startsWith('data:'))continue;files.add(localPath(m[1]));
 }
 const parent=root.slice(0,-'Funkelhain/'.length),extraFiles=new Map();
 if(zip.entries.has(parent+'LIZENZEN.txt')){extraFiles.set('LIZENZEN.txt',parent+'LIZENZEN.txt');files.add('LIZENZEN.txt');}
 else if(!files.has('LIZENZEN.txt'))throw Error('Die Quellen- und Lizenzdatei fehlt. Bitte die vollständige Web-ZIP wählen.');
 for(const p of files){safePath(p);if(!zip.entries.has(extraFiles.get(p)||root+p))throw Error('Spieldatei fehlt: '+p);}
 return {root,html,files,extraFiles};
}
