import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}
const paths = (await walk("out")).filter((p) => !p.endsWith("/sw.js"));
const urls = paths.map((p) => `${base}/${p.slice(4)}`);
urls.push(`${base}/`);
const hash = createHash("sha256");
for (const p of paths) {
  hash.update(p);
  hash.update(await readFile(p));
}
const prefix = `moe-terrain-${createHash("sha256")
  .update(base || "/")
  .digest("hex")
  .slice(0, 8)}-`;
const cache = `${prefix}${hash.digest("hex").slice(0, 14)}`;
const sw = `const CACHE=${JSON.stringify(cache)};const URLS=${JSON.stringify(urls)};const SCOPE=${JSON.stringify(`${base}/`)};const PREFIX=${JSON.stringify(prefix)};
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE);try{for(const url of URLS){const response=await fetch(url,{cache:'reload'});if(!response.ok)throw Error('Missing '+url);await cache.put(url,response);}}catch(e){await caches.delete(CACHE);throw e;}})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith(PREFIX)&&key!==CACHE)await caches.delete(key);await self.clients.claim();for(const client of await self.clients.matchAll())client.postMessage({type:'OFFLINE_READY'});})()));
self.addEventListener('message',event=>{if(event.data?.type==='CHECK_READY')event.waitUntil((async()=>{const cache=await caches.open(CACHE);let ready=true;for(const url of URLS)if(!await cache.match(url)){ready=false;break;}if(ready)event.source?.postMessage({type:'OFFLINE_READY'});})());});
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith(SCOPE))return;event.respondWith((async()=>{const cached=await caches.match(event.request,{ignoreSearch:true});if(cached)return cached;if(event.request.mode==='navigate'){try{return await fetch(event.request);}catch{return (await caches.match(SCOPE))||Response.error();}}return fetch(event.request);})());});`;
await writeFile("out/sw.js", sw);
console.log(`PWA: ${urls.length} fichiers embarqués ; cache ${cache}`);
