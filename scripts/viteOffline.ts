import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, relative } from 'node:path'
import type { Plugin } from 'vite'

/** Build-owned shell cache: includes hashed lazy chunks without an extra runtime dependency. */
export function offlineShell(): Plugin {
  let output = ''
  return {
    name:'azulia-offline-shell', apply:'build',
    configResolved(config) { output = resolve(config.root,config.build.outDir) },
    async closeBundle() {
      const files:string[] = []
      async function walk(directory:string) {
        for (const item of await readdir(directory,{ withFileTypes:true })) {
          const path = resolve(directory,item.name)
          if (item.isDirectory()) await walk(path)
          else {
            const name = relative(output,path).replaceAll('\\','/')
            if (name === 'index.html' || name === 'manifest.webmanifest' || /^assets\/.*\.(js|css|wasm)$/.test(name) || /^fonts\/(DejaVuSans(?:-Bold)?\.ttf|LICENSE\.txt)$/.test(name) || /^brand\/(app-[\w-]+\.png|apple-touch-icon\.png|azulia-logo\.webp|azulia-icon\.png)$/.test(name)) files.push(name)
          }
        }
      }
      await walk(output)
      files.sort()
      const hash = createHash('sha256')
      for (const file of files) { hash.update(file); hash.update(await readFile(resolve(output,file))) }
      const version = hash.digest('hex').slice(0,16)
      const source = `const PREFIX = 'azulia-shell-' + encodeURIComponent(new URL(self.registration.scope).pathname) + '-';
const CACHE = PREFIX + '${version}';
const URLS = ${JSON.stringify(files)}.map(path => new URL(path,self.registration.scope).href);
// Load large PDF assets only when the tool is used; cache them for later offline use.
const SHELL_URLS = URLS.filter(url => !url.endsWith('.wasm') && !new URL(url).pathname.includes('/fonts/'));
self.addEventListener('install',event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL_URLS))));
self.addEventListener('activate',event => event.waitUntil((async () => {
  const keys = (await caches.keys()).filter(key => key.startsWith(PREFIX));
  const previous = keys.filter(key => key !== CACHE).slice(-1);
  await Promise.all(keys.filter(key => key !== CACHE && !previous.includes(key)).map(key => caches.delete(key)));
  await self.clients.claim();
})()));
self.addEventListener('message',event => { if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting(); });
self.addEventListener('fetch',event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      if (!response.ok) throw new Error('Navigation unavailable');
      return response;
    }).catch(() => caches.open(CACHE).then(cache => cache.match(new URL('index.html',self.registration.scope).href))));
  } else if (URLS.includes(url.href)) {
    event.respondWith(caches.open(CACHE).then(async cache => {
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) await cache.put(request,response.clone()).catch(() => {});
      return response;
    }));
  }
});
`
      await writeFile(resolve(output,'sw.js'),source)
    },
  }
}
