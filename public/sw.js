const CACHE = 'wordloop-shell-v3';
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    const response=await fetch('/',{cache:'reload'});
    if(!response.ok)throw new Error('Could not precache WordLoop shell');
    const html=await response.clone().text();
    await cache.put('/',response);
    const assets=[...new Set([...html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g)].map(m=>m[1]))];
    await cache.addAll(['/manifest.webmanifest','/icons/icon-192.png',...assets]);
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {event.waitUntil((async()=>{for(const name of await caches.keys())if(name!==CACHE)await caches.delete(name);await self.clients.claim();})());});
self.addEventListener('fetch', event => {
  if(event.request.method!=='GET'||event.request.url.includes('/api/'))return;
  if(event.request.mode==='navigate'){
    event.respondWith(fetch(event.request).then(response=>{const clone=response.clone();void caches.open(CACHE).then(c=>c.put('/',clone));return response;}).catch(async()=>(await caches.match('/'))||Response.error()));
  } else {
    event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request).then(response=>{if(response.ok&&new URL(event.request.url).origin===self.location.origin)void caches.open(CACHE).then(c=>c.put(event.request,response.clone()));return response;})));
  }
});
self.addEventListener('push',event=>{
  let payload={title:'كلماتك تنتظرك',body:'عندك كلمات تستاهل مراجعة سريعة.',url:'/'};
  try{if(event.data)payload={...payload,...event.data.json()};}catch{}
  const url=typeof payload.url==='string' && payload.url.startsWith('/')&&!payload.url.startsWith('//')?payload.url:'/';
  event.waitUntil(self.registration.showNotification(String(payload.title).slice(0,100),{body:String(payload.body).slice(0,250),icon:'/icons/icon-192.png',badge:'/icons/icon-192.png',tag:'wordloop-review',data:{url}}));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target = new URL(event.notification.data?.url||'/',self.location.origin).href;
  event.waitUntil((async()=>{const pages=await self.clients.matchAll({type:'window',includeUncontrolled:true});const p=pages.find(x=>x.url.startsWith(self.location.origin));if(p){await p.navigate(target);return p.focus();}return self.clients.openWindow(target);})());
});
