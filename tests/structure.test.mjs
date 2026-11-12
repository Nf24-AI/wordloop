import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(f)=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
test('No Supabase or login in local-first frontend',()=>{const app=read('src/App.tsx');assert.doesNotMatch(app,/supabase|signInWithPassword|signUp/);assert.match(app,/listWords\(/);});
test('FSRS-7 is explicit and review transaction is atomic',()=>{const code=read('src/data.ts');assert.match(code,/version:'FSRS-7'/);assert.match(code,/transaction\(\['words','reviews'\],'readwrite'\)/);});
test('Cloudflare push stores no text or meanings',()=>{const schema=read('worker/schema.sql');assert.doesNotMatch(schema,/(?:^|\s)(term|meaning|translation|example|fsrs_state)\s+TEXT/mi);assert.match(schema,/next_due_at/);});
test('User owns backup and restore',()=>{const app=read('src/App.tsx');assert.match(app,/buildBackup\(/);assert.match(app,/restoreBackup\(/);assert.match(app,/window.confirm/);});
test('Offline shell and web push listeners exist',()=>{const sw=read('public/sw.js');assert.match(sw,/addEventListener\('fetch'/);assert.match(sw,/addEventListener\('push'/);});
