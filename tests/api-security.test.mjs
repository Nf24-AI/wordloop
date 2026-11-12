import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.ts';
import {testBrowser} from '@codefusion-cc/web-push/testing';

const base='https://wordloop-staging.nf24-wordloop.workers.dev';
const untouchedDB={prepare(){throw new Error('Unsafe: invalid request reached database');}};
const env={PUSH_DB:untouchedDB,PUSH_LIMIT:{limit:async()=>({success:true})}};
const token='test-token-'.repeat(7);
function post(route,body,origin=base){
  return new Request(base+route,{
    method:'POST',
    headers:{Origin:origin,'Content-Type':'application/json'},
    body:typeof body==='string'?body:JSON.stringify(body)
  });
}

test('health response does not expose user data or allow caching',async()=>{
  const res=await worker.fetch(new Request(base+'/api/health'),{});
  assert.equal(res.status,200);
  assert.equal(res.headers.get('cache-control'),'no-store');
  assert.equal(res.headers.get('x-content-type-options'),'nosniff');
  const data=await res.json();
  assert.deepEqual(data,{service:'wordloop',storage:'device-only',push:'optional'});
});

test('push writes reject requests from different origins before touching D1',async()=>{
  const response=await worker.fetch(post('/api/push/sync',{},'https://attacker.example'),env);
  assert.equal(response.status,403);
});

test('push writes reject opaque browser origins before touching D1',async()=>{
  const response=await worker.fetch(post('/api/push/sync',{},'null'),env);
  assert.equal(response.status,403);
});

test('oversize request bodies are rejected before touching D1',async()=>{
  const response=await worker.fetch(post('/api/push/sync','x'.repeat(11000)),env);
  assert.equal(response.status,400);
});

test('reject unsupported private push destinations before writing D1',async()=>{
  const {subscription}=await testBrowser();
  const invalid={...subscription,endpoint:'https://127.0.0.1/simulated-push'};
  const response=await worker.fetch(post('/api/push/sync',{token,subscription:invalid,nextDueAt:null}),env);
  assert.equal(response.status,400);
});

test('reject external non-push HTTPS endpoints before writing D1',async()=>{
  const {subscription}=await testBrowser();
  const invalid={...subscription,endpoint:'https://example.org/untrusted-push'};
  const response=await worker.fetch(post('/api/push/sync',{token,subscription:invalid,nextDueAt:null}),env);
  assert.equal(response.status,400);
});

test('unconfigured VAPID does not expose a public key or a private key',async()=>{
  const response=await worker.fetch(new Request(base+'/api/push/key'),{});
  assert.equal(response.status,503);
  const data=await response.json();
  assert.deepEqual(Object.keys(data),['error']);
});


test('native rate limiter returns HTTP 429 before touching D1',async()=>{
  const denied={PUSH_DB:untouchedDB,PUSH_LIMIT:{limit:async()=>({success:false})}};
  const response=await worker.fetch(post('/api/push/sync',{}),denied);
  assert.equal(response.status,429);
  assert.equal(response.headers.get('cache-control'),'no-store');
});
