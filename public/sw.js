// #41: every build stamps its own id here (vite.config.ts → wordloopBuildId), so each deploy ships a byte-different
// worker: the browser then installs it and the app can offer «تحديث الآن». In dev the placeholder stays as is.
const VERSION = '__WL_BUILD__';
const CACHE = 'wordloop-shell-' + VERSION;
/** Only a real page of this app may become the offline shell — never a redirect (e.g. Cloudflare Access sign-in / OTP) or an error. */
const isAppPage = r => r.ok && !r.redirected && r.type === 'basic' && (r.headers.get('content-type') || '').includes('text/html');
// Files referenced from inside the bundle (lazy FSRS chunks, self-hosted fonts) are not listed in index.html,
// so we read the HTML's JS/CSS once and precache everything they point to under /assets/.
const ASSET_REF=/\/?assets\/[\w.-]+\.(?:js|css|woff2)/g;
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    const response=await fetch('/',{cache:'reload'});
    if(!isAppPage(response))throw new Error('Could not precache WordLoop shell');
    const html=await response.clone().text();
    await cache.put('/',response);
    const assets=new Set([...html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g)].map(m=>m[1]));
    for(const file of [...assets].filter(f=>/\.(?:js|css)$/.test(f))){
      const r=await fetch(file,{cache:'reload'});
      if(!r.ok)continue;
      for(const m of (await r.text()).matchAll(ASSET_REF))assets.add('/'+m[0].replace(/^\//,''));
    }
    await cache.addAll(['/manifest.webmanifest','/icons/icon-192.png','/icons/icon-512.png',...assets]);
    // No automatic skipWaiting (#41): a new version waits until the learner taps «تحديث الآن» (or every WordLoop window is closed),
    // so it never swaps the app under someone typing a card or reviewing.
  })());
});
self.addEventListener('message',event=>{
  if(event.data?.type==='SKIP_WAITING')void self.skipWaiting();
  if(event.data?.type==='GET_VERSION')event.ports[0]?.postMessage(VERSION);
});
self.addEventListener('activate', event => {event.waitUntil((async()=>{for(const name of await caches.keys())if(name!==CACHE)await caches.delete(name);await self.clients.claim();})());});
self.addEventListener('fetch', event => {
  if(event.request.method!=='GET'||event.request.url.includes('/api/'))return;
  if(event.request.mode==='navigate'){
    // The app lives at / (routes are #hash). Any other page reached by navigation — e.g. /cdn-cgi/access/login after an
    // expired Access session — is passed through and never stored as the offline shell.
    const isShell=new URL(event.request.url).pathname==='/';
    event.respondWith(fetch(event.request).then(response=>{if(isShell&&isAppPage(response)){const clone=response.clone();void caches.open(CACHE).then(c=>c.put('/',clone));}return response;}).catch(async()=>(await caches.match('/'))||Response.error()));
  } else {
    // ignoreVary: module/font requests carry an Origin header; a "Vary: Origin" response must still match offline.
    event.respondWith(caches.match(event.request,{ignoreVary:true}).then(hit=>hit||fetch(event.request).then(response=>{
      if(response.ok&&new URL(event.request.url).origin===self.location.origin){const copy=response.clone();void caches.open(CACHE).then(c=>c.put(event.request,copy));}
      return response;
    })));
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
