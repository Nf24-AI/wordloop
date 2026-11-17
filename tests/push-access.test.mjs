// #60: an expired Cloudflare Access session (staging) must read as «sign in again», not as an opaque «Load failed».
import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {accessFetch,PushNetworkError} from '../src/net.ts';
const api=(p,i)=>accessFetch(p,i,globalThis.localStorage?.getItem('wordloop-locale')==='en'?'en':'ar');

const realFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=realFetch;delete globalThis.localStorage;});
const store=v=>({getItem:()=>v,setItem(){},removeItem(){}});

test('a redirect (Access login) stops at the redirect and asks to sign in again — never follows it',async()=>{
  let seen;
  globalThis.fetch=async(path,init)=>{seen=init;return {type:'opaqueredirect',status:0};};
  await assert.rejects(api('/api/push/key'),e=>e instanceof PushNetworkError&&e.reason==='signin'&&/سجّل الدخول/.test(e.message));
  assert.equal(seen.redirect,'manual');assert.equal(seen.credentials,'same-origin');
});

test('the message follows the interface language',async()=>{
  globalThis.localStorage=store('en');
  globalThis.fetch=async()=>({type:'basic',status:302});
  await assert.rejects(api('/api/push/sync',{method:'POST'}),/sign-in has expired/);
});

test('a normal answer passes through unchanged (including 4xx/5xx the caller handles)',async()=>{
  globalThis.fetch=async(_p,init)=>({type:'basic',status:503,ok:false,init});
  const r=await api('/api/push/key');assert.equal(r.status,503);
  globalThis.fetch=async()=>({type:'basic',status:200,ok:true});
  assert.equal((await api('/api/push/test',{method:'POST'})).ok,true);
});

test('a network failure while online is re-thrown as is',async()=>{
  globalThis.fetch=async()=>{throw new TypeError('Load failed');};
  await assert.rejects(api('/api/push/key'),TypeError);
});
