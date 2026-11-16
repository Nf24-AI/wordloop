// #41 — static guarantees of the update flow (the browser behaviour is covered by tests/e2e/pwa-update.e2e.mjs).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');

test('sw.js carries a per-build version and a matching cache name (no fixed wordloop-shell-v4)',()=>{
  const sw=read('public/sw.js');
  assert.match(sw,/const VERSION = '__WL_BUILD__';/);
  assert.match(sw,/const CACHE = 'wordloop-shell-' \+ VERSION;/);
  assert.doesNotMatch(sw,/wordloop-shell-v\d/);
  assert.match(read('vite.config.ts'),/replaceAll\('__WL_BUILD__',id\)/);
});
test('a new worker waits for «تحديث الآن»: skipWaiting only on the SKIP_WAITING message',()=>{
  const sw=read('public/sw.js');
  const calls=[...sw.matchAll(/self\.skipWaiting\(\)/g)];
  assert.equal(calls.length,1);
  assert.match(sw,/data\?\.type==='SKIP_WAITING'\)void self\.skipWaiting\(\)/);
});
test('only the real app page at / becomes the offline shell (never an Access redirect / sign-in page)',()=>{
  const sw=read('public/sw.js');
  assert.match(sw,/!r\.redirected && r\.type === 'basic'/);
  assert.match(sw,/pathname==='\/'/);
  assert.match(sw,/if\(isShell&&isAppPage\(response\)\)/);
  assert.match(sw,/if\(!isAppPage\(response\)\)throw/);
});
test('the app never reloads by itself: reload only after the learner asked, once',()=>{
  const u=read('src/update.ts');
  assert.match(u,/if\(requested\)\{if\(!reloaded\)\{reloaded=true;window\.location\.reload\(\);\}return;\}/);
  assert.equal([...u.matchAll(/location\.reload\(\)/g)].length,2,'controlled reload + explicit «أعد التحميل» only');
  assert.match(read('src/App.tsx'),/guardLeave\(applyUpdate\)/);
});
