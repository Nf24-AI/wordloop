#!/usr/bin/env node
// #64 — before/after comparison of two eval runs (no network):  node scripts/compare-evals.mjs <before.json> <after.json> <out.md>
// The BEFORE stories are also re-scored with the CURRENT matcher and answer checks, so «what changed in the model's
// output» and «what changed in how we measure» are reported separately.
import {readFileSync,writeFileSync} from 'node:fs';
import {termsIn,answerProblems,MAX_ANSWER_WORDS,LENGTH_BAND} from '../src/story.ts';
const [bf,af,out]=process.argv.slice(2);
if(!bf||!af||!out){console.error('usage: compare-evals.mjs before.json after.json out.md');process.exit(2);}
const B=JSON.parse(readFileSync(bf,'utf8')),A=JSON.parse(readFileSync(af,'utf8'));
const words=s=>s.split(/\s+/).filter(Boolean).length;
const probs=r=>r.story?r.story.questions.flatMap((q,i)=>[...answerProblems(q.question,q.answer,r.lang,r.genre),...(words(q.answer)>MAX_ANSWER_WORDS?['answerTooLong']:[])].map(p=>`Q${i+1} ${p}`)):[];
// Names = capitalised words NOT at a sentence start (after a lowercase letter or comma), or a speaker label «Ana:».
const names=r=>{if(!r.story)return [];const t=r.story.story;
  return [...new Set([...t.matchAll(/(?<=[\p{Ll},;]\s)(\p{Lu}\p{Ll}+)/gu),...t.matchAll(/(?:^|\n)(\p{Lu}\p{Ll}+):/gu)].map(m=>m[1]))];};
const row=r=>{if(!r)return null;const st=r.story,n=st?words(st.story):0,[lo,hi]=LENGTH_BAND[r.level];
  return {ok:r.ok,calls:r.attempts,ms:r.ms,neurons:r.neurons,cov:st?`${termsIn(st.story,r.requested,r.lang).length}/${r.requested.length}`:'-',
    rawCov:`${r.used.length}/${r.requested.length}`,probs:probs(r),len:n,inBand:st?n>=lo&&n<=hi:false,title:st?.title??'-'};};
const ids=[...new Set([...B.results,...A.results].map(r=>r.id))].sort((a,b)=>a-b);
const sum=(R,f)=>R.reduce((n,r)=>n+f(r),0),pass=R=>R.filter(r=>r.ok);
const titles=R=>new Set(pass(R).map(r=>r.story.title.toLowerCase())).size;
const nameCount=R=>{const m=new Map();for(const r of pass(R))for(const n of names(r))m.set(n,(m.get(n)||0)+1);return [...m].filter(([,c])=>c>1).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([n,c])=>`${n}×${c}`).join(', ')||'—';};
const both=ids.filter(id=>A.results.some(r=>r.id===id));
const Bs=B.results.filter(r=>both.includes(r.id)),As=A.results.filter(r=>both.includes(r.id));
const md=`# Eval comparison — before (${B.promptVersion}) vs after (${A.promptVersion})

Compared cases: ${both.length} (the after-run covers ${A.results.length} of 20${A.stopped?`; ${A.stopped}`:''}).

| measure (same ${both.length} cases) | before | after |
|---|---|---|
| automatic gate PASS | ${pass(Bs).length}/${Bs.length} | ${pass(As).length}/${As.length} |
| needed a repair | ${Bs.filter(r=>r.attempts>1).length} | ${As.filter(r=>r.attempts>1).length} |
| words found — as reported at the time | ${sum(Bs,r=>r.used.length)}/${sum(Bs,r=>r.requested.length)} | ${sum(As,r=>r.used.length)}/${sum(As,r=>r.requested.length)} |
| answer problems (current checks: vague / person / > ${MAX_ANSWER_WORDS} words) | ${sum(Bs,r=>probs(r).length)} | ${sum(As,r=>probs(r).length)} |
| length inside the level band | ${Bs.filter(r=>row(r).inBand).length}/${pass(Bs).length} | ${As.filter(r=>row(r).inBand).length}/${pass(As).length} |
| distinct titles | ${titles(Bs)}/${pass(Bs).length} | ${titles(As)}/${pass(As).length} |
| names reused across stories | ${nameCount(Bs)} | ${nameCount(As)} |
| median latency | ${[...Bs.map(r=>r.ms)].sort((a,b)=>a-b)[Bs.length>>1]} ms | ${[...As.map(r=>r.ms)].sort((a,b)=>a-b)[As.length>>1]} ms |
| neurons | ${sum(Bs,r=>r.neurons)} | ${sum(As,r=>r.neurons)} |

Before-stories re-scored with today's matcher: ${sum(Bs,r=>r.story?termsIn(r.story.story,r.requested,r.lang).length:0)}/${sum(Bs,r=>r.requested.length)} words (the gain there is measurement, not the model).

| # | lang · CEFR · type | before: gate · words · answer problems · length | after: gate · calls · words · answer problems · length | after: first-call issues (repaired) |
|---|---|---|---|---|
${ids.map(id=>{const b=B.results.find(r=>r.id===id),a=A.results.find(r=>r.id===id),x=row(b),y=row(a);
  return `| ${id} | ${b.lang} · ${b.level} · ${b.genre} | ${x.ok?'PASS':'FAIL'} · ${x.rawCov} · ${x.probs.join(', ')||'—'} · ${x.len}${x.inBand?'':' ⚠'} | ${y?`${y.ok?'PASS':'FAIL'} · ${y.calls} · ${y.cov} · ${y.probs.join(', ')||'—'} · ${y.len}${y.inBand?'':' ⚠'}`:'not run (budget)'} | ${a?.firstIssues?.join(', ')||'—'} |`;}).join('\n')}

⚠ = outside the level's word band (the gate allows ±30%).
`;
writeFileSync(out,md);console.log(md.split('\n').slice(0,16).join('\n'));
