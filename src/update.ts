/**
 * #41 — app updates for the installed PWA (iPhone Home Screen, Android, desktop).
 *
 * Cycle: check → a new worker installs and waits → the app offers «تحديث الآن» → the learner taps it → that waiting
 * worker is activated → one controlled reload. Nothing reloads by itself, so typing, reviewing and practice are never
 * interrupted; «لاحقًا» hides the offer until the next launch (the waiting version also takes over once every WordLoop
 * window has been closed).
 *
 * Checks run on launch, when the app comes back to the foreground (iOS resumes PWAs without reloading them), when the
 * network returns, and every 30 minutes while visible — never while offline.
 */
export type UpdateStatus='idle'|'available'|'updating'|'failed'|'elsewhere';

const CHECK_EVERY=30*60*1000,ACTIVATE_TIMEOUT=12000;
let status:UpdateStatus='idle';
let registration:ServiceWorkerRegistration|null=null;
let requested=false,reloaded=false,dismissed=false;
const listeners=new Set<(s:UpdateStatus)=>void>();

function set(next:UpdateStatus){if(next==='available'&&dismissed)next='idle';status=next;for(const l of listeners)l(status);}
export function updateStatus(){return status;}
export function onUpdateStatus(l:(s:UpdateStatus)=>void){listeners.add(l);return ()=>{listeners.delete(l);};}

function watch(reg:ServiceWorkerRegistration){
  // A worker that finished installing while a previous version controls the page is a real update.
  if(reg.waiting&&navigator.serviceWorker.controller)set('available');
  reg.addEventListener('updatefound',()=>{
    const w=reg.installing;if(!w)return;
    w.addEventListener('statechange',()=>{if(w.state==='installed'&&navigator.serviceWorker.controller){dismissed=false;set('available');}});
  });
}

/** Ask the server for a newer worker (cheap: sw.js only). Skipped offline or in the background. */
export function checkForUpdate(){
  if(!registration||!navigator.onLine||document.visibilityState!=='visible')return;
  registration.update().catch(()=>{/* offline, or the Access session expired: try again on the next resume */});
}

export function startUpdates(){
  if(!('serviceWorker' in navigator))return;
  let hadController=!!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(!hadController){hadController=true;return;} // first install taking control: not an update
    if(requested){if(!reloaded){reloaded=true;window.location.reload();}return;}
    // Activated from another WordLoop window: this one still runs the old code.
    set('elsewhere');
  });
  const register=async()=>{
    try{registration=await navigator.serviceWorker.register('/sw.js')??null;}catch(e){console.warn(e);return;}
    if(!registration)return; // service workers blocked (privacy settings, some test browsers): the app simply runs without updates
    watch(registration);
    document.addEventListener('visibilitychange',checkForUpdate);
    window.addEventListener('online',checkForUpdate);
    window.addEventListener('pageshow',checkForUpdate);
    setInterval(checkForUpdate,CHECK_EVERY);
  };
  if(document.readyState==='complete')void register();else window.addEventListener('load',()=>void register(),{once:true});
}

/** «تحديث الآن»: activate the waiting version, then reload once when it takes control. */
export function applyUpdate(){
  if(status==='elsewhere'){window.location.reload();return;}
  const waiting=registration?.waiting;
  if(!waiting){set('failed');return;}
  requested=true;set('updating');
  waiting.postMessage({type:'SKIP_WAITING'});
  setTimeout(()=>{if(status==='updating'&&!reloaded){requested=false;set('failed');}},ACTIVATE_TIMEOUT);
}
/** «لاحقًا»: hide until the next launch or the next new version. */
export function dismissUpdate(){dismissed=true;set('idle');}
