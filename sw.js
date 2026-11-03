/* Only public app shell assets are cached; no Excel files, reports, or student data. */
const SHELL_CACHE='mock-exam-shell-v10';
const SHELL=['./','./index.html','./styles.css','./feature-styles.css','./app.js','./features.js','./report-folders.js','./workspace-navigation.js','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-maskable-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(SHELL_CACHE).then(cache=>cache.addAll(SHELL)));self.skipWaiting()});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('mock-exam-shell-')&&key!==SHELL_CACHE).map(key=>caches.delete(key)))));self.clients.claim()});
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
 event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();caches.open(SHELL_CACHE).then(cache=>cache.put(event.request,copy)).catch(()=>{})}return response}).catch(()=>caches.match(event.request)));
});