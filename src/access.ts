/**
 * #70 Staging tester access (PIN). The Worker protects every page and API; this file only keeps local data honest:
 * IndexedDB belongs to one browser profile, so the words here are bound to the FIRST tester who signs in on it.
 * If another tester signs in on the same browser, the app does not open (no merge, nothing deleted) and asks them to
 * use their own browser profile or device. Off (no request at all) unless this is a Staging build.
 */
import {claimLocalOwner,localOwner} from './data.ts';

export type AccessState={mode:'off'}|{mode:'pin';ref:string;expiresAt:string};
export type AccessCheck='ok'|'mismatch'|'signin';
let state:AccessState={mode:'off'};
export const accessState=():AccessState=>state;
const STAGE=(import.meta as unknown as {env?:Record<string,string|undefined>}).env?.VITE_WORDLOOP_STAGE==='true';

type Owner={get:()=>Promise<string|null>;claim:(ref:string)=>Promise<void>};
export async function checkAccess(fetcher:typeof fetch=fetch,owner:Owner={get:localOwner,claim:claimLocalOwner},stage=STAGE):Promise<AccessCheck>{
  if(!stage)return 'ok';
  let res:Response;
  try{res=await fetcher('/api/auth/me',{credentials:'same-origin',redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(5000)});}
  catch{return 'ok';} // offline: the page itself came from this device's cache, and so did its words
  if(res.status===401||res.type==='opaqueredirect')return 'signin';
  if(!res.ok)return 'ok'; // gate off (404) or not reachable: nothing to bind
  let ref='',expiresAt='';
  try{const j=await res.json() as {mode?:string;tester?:{ref?:unknown;expiresAt?:unknown}};
    if(j.mode!=='pin'||typeof j.tester?.ref!=='string'||!/^[0-9a-f]{24}$/.test(j.tester.ref))return 'ok';
    ref=j.tester.ref;expiresAt=String(j.tester.expiresAt??'');}catch{return 'ok';}
  state={mode:'pin',ref,expiresAt};
  const current=await owner.get();
  if(!current){await owner.claim(ref);return 'ok';}
  return current===ref?'ok':'mismatch';
}
/** Ends the session on the server, drops the offline page cache (never IndexedDB: the words stay), opens the sign-in page. */
export async function signOut(){
  try{await fetch('/api/auth/logout',{method:'POST',headers:{Accept:'application/json'},credentials:'same-origin'});}catch{/* offline: the cookie expires by itself */}
  try{for(const k of await caches.keys())if(k.startsWith('wordloop-'))await caches.delete(k);}catch{/* no Cache API */}
  location.assign('/login?bye=1');
}
