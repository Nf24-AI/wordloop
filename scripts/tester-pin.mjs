#!/usr/bin/env node
// #70 — owner tool for Staging tester PINs. Runs on the owner's machine only; the PIN is shown ONCE in this terminal
// and is never written to a file, to GitHub, to D1 or to any log. D1 receives only HMAC(PIN_PEPPER, PIN).
//
//   PIN_PEPPER_FILE=C:\Users\<you>\.wordloop\pin-pepper.txt  (outside the repo; same value as the Worker secret PIN_PEPPER)
//
//   node scripts/tester-pin.mjs init-pepper                 create the pepper file (then: wrangler secret put PIN_PEPPER)
//   node scripts/tester-pin.mjs create  --label tester-1 [--days 7]
//   node scripts/tester-pin.mjs renew   <id> [--days 7]     new PIN, same local-data profile; the old PIN is revoked
//   node scripts/tester-pin.mjs revoke  <id>                PIN stops working + every session of it ends now
//   node scripts/tester-pin.mjs signout <id>                ends its sessions only (the PIN still works)
//   node scripts/tester-pin.mjs list
//   add --dry-run to print the SQL instead of running it (the PIN is then NOT shown and nothing is created).
import {createHmac,randomBytes,randomInt} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const PIN_LENGTH=8;
const DB_NAME='wordloop-push-staging';
const REPO=resolve(dirname(fileURLToPath(import.meta.url)),'..');

/** Same value as worker/auth.ts pinHash(). */
export const pinHashNode=(pepper,pin)=>createHmac('sha256',pepper).update('wordloop-pin-v1|'+pin).digest('hex');
/** A uniformly random 8-digit PIN that is not trivially guessable (one repeated digit, a run like 12345678, or 2 repeating halves). */
export function weakPin(pin){
  if(/^(\d)\1+$/.test(pin))return true;
  const d=[...pin].map(Number),step=d[1]-d[0];
  if(Math.abs(step)===1&&d.every((x,i)=>i===0||x-d[i-1]===step))return true;
  return pin.slice(0,4)===pin.slice(4)||/^(\d\d)\1\1\1$/.test(pin);
}
export function newPin(rand=randomInt){
  for(;;){const pin=String(rand(0,10**PIN_LENGTH)).padStart(PIN_LENGTH,'0');if(!weakPin(pin))return pin;}
}
const id=()=>randomBytes(8).toString('hex');
const sqlText=s=>`'${String(s).replace(/'/g,"''")}'`;
export function safeLabel(l){if(typeof l!=='string'||!/^[\p{L}\p{N} _.-]{1,40}$/u.test(l))throw Error('--label: 1–40 letters, digits, space, _ . - (avoid real names)');return l;}
const hexId=v=>{if(!/^[0-9a-f]{16}$/.test(v||''))throw Error('tester id: 16 hex characters (see «list»)');return v;};

export function readPepper(file=process.env.PIN_PEPPER_FILE){
  if(!file)throw Error('Set PIN_PEPPER_FILE to the pepper file outside the repository.');
  const abs=resolve(file);
  if(abs.toLowerCase().startsWith(REPO.toLowerCase()))throw Error('PIN_PEPPER_FILE must be OUTSIDE the repository.');
  const p=readFileSync(abs,'utf8').trim();
  if(p.length<32)throw Error('The pepper is too short (expected 64 hex characters).');
  return p;
}
/** SQL for a new tester; `profile` is reused by «renew» so the tester keeps the same local data. */
export function createSql({pepper,pin,label,days,profile=id(),testerId=id(),now=Date.now()}){
  return `INSERT INTO testers (id,label,profile,pin_hash,created_at,expires_at) VALUES (${sqlText(testerId)},${sqlText(label)},${sqlText(profile)},${sqlText(pinHashNode(pepper,pin))},${now},${now+days*864e5});`;
}
/** Wrangler on Windows can crash while exiting («Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)») AFTER the
 *  query ran. Such a run counts only when its own output proves success: JSON results with success:true, or «Executed N». */
export function completed(stdout,json){
  if(json){try{const j=JSON.parse(stdout);return Array.isArray(j)&&j.length>0&&j.every(x=>x&&x.success===true);}catch{return false;}}
  return /Executed \d+ (?:commands?|queries)/.test(stdout||'');
}
function wrangler(args,{json=false}={}){
  // Node runs the project's wrangler directly — no shell, so SQL in --command reaches it as ONE argument on every OS.
  const r=spawnSync(process.execPath,[join(REPO,'node_modules','wrangler','bin','wrangler.js'),'d1','execute',DB_NAME,'--remote',...(json?['--json']:[]),...args],{cwd:REPO,encoding:'utf8'});
  if(r.status!==0&&!completed(r.stdout,json))throw Error('wrangler failed: '+(r.stderr||r.stdout||'').split('\n').filter(l=>!/pin_hash|token/i.test(l)).slice(-4).join(' '));
  return r.stdout;
}
/** Writes go through a temporary --file (several statements at once; the SQL never appears in a process list). */
function execSql(sql,dry,{json=false}={}){
  if(dry){console.log(sql);return '';}
  const dir=join(tmpdir(),'wl-pin-'+id());mkdirSync(dir);const f=join(dir,'q.sql');
  try{writeFileSync(f,sql);return wrangler(['--file',f],{json});}finally{rmSync(dir,{recursive:true,force:true});}
}
/** Reads use --command (only that returns rows); writes use --file. */
const query=sql=>JSON.parse(wrangler(['--command',sql],{json:true}))[0]?.results??[];
const flag=(args,name,def)=>{const i=args.indexOf(name);return i>=0?args[i+1]:def;};
const days=args=>{const d=Number(flag(args,'--days','7'));if(!Number.isInteger(d)||d<1||d>30)throw Error('--days: 1–30');return d;};

async function main(argv){
  const [cmd,...args]=argv,dry=args.includes('--dry-run');
  if(cmd==='init-pepper'){
    const file=process.env.PIN_PEPPER_FILE;if(!file)throw Error('Set PIN_PEPPER_FILE first.');
    if(resolve(file).toLowerCase().startsWith(REPO.toLowerCase()))throw Error('PIN_PEPPER_FILE must be OUTSIDE the repository.');
    if(existsSync(file))throw Error('The pepper file already exists; a new pepper would invalidate every PIN.');
    mkdirSync(dirname(resolve(file)),{recursive:true});writeFileSync(file,randomBytes(32).toString('hex'),{mode:0o600});
    console.log(`Created ${file}.\nNext (owner approval): npx wrangler secret put PIN_PEPPER < "${file}"`);return;
  }
  if(cmd==='create'||cmd==='renew'){
    const pepper=readPepper(),pin=newPin(),d=days(args);
    let sql,label,profile;
    if(cmd==='renew'){
      const old=hexId(args[0]);
      const rows=query(`SELECT label,profile FROM testers WHERE id=${sqlText(old)}`);
      if(!rows.length)throw Error('No tester with that id.');
      ({label,profile}=rows[0]);
      sql=`UPDATE testers SET revoked_at=${Date.now()} WHERE id=${sqlText(old)};\nDELETE FROM tester_sessions WHERE tester_id=${sqlText(old)};\n`;
    }else{label=safeLabel(flag(args,'--label'));sql='';}
    const testerId=id();
    sql+=createSql({pepper,pin,label,days:d,profile,testerId});
    if(dry){console.log(sql.replace(/'[0-9a-f]{64}'/,"'<pin hash>'"));console.log('-- dry run: no PIN was issued');return;}
    execSql(sql,false);
    // The ONLY place the PIN ever appears. Hand it to the tester privately; it cannot be shown again.
    console.log(`\nTester ${label} · id ${testerId} · valid ${d} days\nPIN (shown once): ${pin.slice(0,4)} ${pin.slice(4)}\n`);
    return;
  }
  if(cmd==='revoke'){const t=hexId(args[0]);execSql(`UPDATE testers SET revoked_at=${Date.now()} WHERE id=${sqlText(t)};\nDELETE FROM tester_sessions WHERE tester_id=${sqlText(t)};`,dry);console.log(dry?'':'Revoked: the PIN and all its sessions stop working on the next request.');return;}
  if(cmd==='signout'){const t=hexId(args[0]);execSql(`DELETE FROM tester_sessions WHERE tester_id=${sqlText(t)};`,dry);console.log(dry?'':'All sessions ended; the PIN still works.');return;}
  if(cmd==='list'){
    console.table(query(`SELECT id,label,datetime(created_at/1000,'unixepoch') AS created,datetime(expires_at/1000,'unixepoch') AS expires,
      CASE WHEN revoked_at IS NULL THEN '' ELSE datetime(revoked_at/1000,'unixepoch') END AS revoked,
      (SELECT count(*) FROM tester_sessions s WHERE s.tester_id=testers.id AND s.expires_at>${Date.now()}) AS sessions FROM testers ORDER BY created_at`));
    return;
  }
  console.log(readFileSync(fileURLToPath(import.meta.url),'utf8').split('\n').slice(1,13).map(l=>l.replace(/^\/\/ ?/,'')).join('\n'));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
  main(process.argv.slice(2)).catch(e=>{console.error('Error: '+e.message);process.exit(1);});
