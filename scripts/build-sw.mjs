import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadEnv } from 'vite';
import { configureHeaders } from '../src/cloud-config.js';
await writeFile('dist/_headers',configureHeaders(await readFile('public/_headers','utf8'),{...loadEnv('production',process.cwd(),'VITE_'),...process.env}));
const assets = (await readdir('dist/assets')).map(x=>'/assets/'+x);
const paths=['/','/index.html','/manifest.webmanifest','/icon-192.png','/icon-512.png',...assets];
const hash=createHash('sha256');
for (const p of paths.filter(p=>p!=='/')) hash.update(await readFile('dist'+p));
const cache='momentum-'+hash.digest('hex').slice(0,16);
await writeFile('dist/sw.js', `
const CACHE=${JSON.stringify(cache)};
const FILES=${JSON.stringify(paths)};
self.addEventListener('install', event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES))));
// Updates wait until all old tabs close; no forced reload while editing.
self.addEventListener('activate', event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('momentum-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch', event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
  if(event.request.mode==='navigate') {
    event.respondWith(caches.open(CACHE).then(cache=>cache.match('/index.html')).then(cached=>cached||fetch(event.request)));
  } else if(FILES.includes(url.pathname)) {
    event.respondWith(caches.open(CACHE).then(cache=>cache.match(url.pathname)).then(cached=>cached||fetch(event.request)));
  }
});
`);
