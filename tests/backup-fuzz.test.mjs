// #3 — backup integrity fuzzing: hundreds of corrupted, oversized, duplicated and hostile backup files.
// Each one is either restored as valid data or refused with a learner-readable message — and a refused file never
// changes a single byte of the existing database. Deterministic (seeded), so failures are reproducible.
import 'fake-indexeddb/auto';
import {IDBFactory} from 'fake-indexeddb';
import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {addWord,reviewWord,createFolder,createDeck,buildBackup,restoreBackup,listWords,listReviews,listLibrary,resetConnectionForTests} from '../src/data.ts';

beforeEach(()=>{globalThis.indexedDB=new IDBFactory();resetConnectionForTests();});
let seed=20261116;const rnd=()=>{seed=(seed*1103515245+12345)%2147483648;return seed/2147483648;};
const pick=a=>a[Math.floor(rnd()*a.length)];
const snapshot=async()=>JSON.stringify([await listWords(),await listReviews(),await listLibrary()]);
const HOSTILE=[null,undefined,'',' ',0,-1,1e308,NaN,true,[],{},'x'.repeat(100_000),'<img src=x onerror=alert(1)>','2026-02-30T25:61:00Z','not-a-date',{__proto__:{polluted:true}},['a']];
/** One random corruption of a deep copy of a valid backup. */
function mutate(valid){
  const b=JSON.parse(JSON.stringify(valid));
  const pools=[b,...b.words,...b.reviews,...b.folders,...b.decks,...b.words.map(w=>w.fsrsState)].filter(Boolean);
  const kind=Math.floor(rnd()*7);
  if(kind===0){const o=pick(pools),k=pick(Object.keys(o));o[k]=pick(HOSTILE);}            // wrong type / hostile value
  else if(kind===1){const o=pick(pools),k=pick(Object.keys(o));delete o[k];}               // missing field
  else if(kind===2&&b.words.length){b.words.push(JSON.parse(JSON.stringify(b.words[0])));}  // duplicate id
  else if(kind===3&&b.reviews.length){b.reviews[0].wordId='ghost';}                        // orphan review
  else if(kind===4){b.version=pick([0,5,'3',null,99]);}                                     // unknown version
  else if(kind===5&&b.words.length){b.words[0].deckId='missing-deck';}                      // unknown deck
  else{const o=pick(pools);o['__proto__']={polluted:true};o.constructor='x';}              // prototype keys
  return b;
}

test('fuzz: 400 corrupted backups are refused cleanly or restored validly; a refused file never changes the database',async()=>{
  const f=await createFolder('Fuzz'),d=await createDeck({folderId:f.id,name:'D',contentLanguage:'es-ES',meaningLanguage:'ar-SA'});
  for(const t of ['uno','dos','tres']){const w=await addWord({term:t,meanings:['m'],example:'',translation:'',tag:'',contentType:'vocabulary',deckId:d.id});await reviewWord(w.id,'good');}
  const valid=await buildBackup();
  let refused=0,restored=0;
  for(let i=0;i<400;i++){
    const before=await snapshot(),file=mutate(valid);
    try{await restoreBackup(file);restored++;
      // Accepted: what is stored must still be a usable library (every card in a known deck, every review on a card).
      const [words,reviews,lib]=[await listWords(),await listReviews(),await listLibrary()];
      const decks=new Set(lib.decks.map(x=>x.id)),ids=new Set(words.map(w=>w.id));
      assert.ok(words.every(w=>decks.has(w.deckId)&&!Number.isNaN(Date.parse(w.dueAt))),`case ${i}: accepted data is consistent`);
      assert.ok(reviews.every(r=>ids.has(r.wordId)),`case ${i}: no orphan reviews`);
      await restoreBackup(valid); // back to the baseline for the next case
    }catch(e){refused++;
      assert.ok(e instanceof Error&&/[؀-ۿ]/.test(e.message),`case ${i}: a learner-readable Arabic message, got ${e?.message}`);
      assert.equal(await snapshot(),before,`case ${i}: refused file left the database untouched`);
    }
  }
  assert.ok(refused>200,`most corruptions are refused (refused ${refused}, restored ${restored})`);
  assert.equal(({}).polluted,undefined,'no prototype pollution');
});

test('fuzz: oversized files are refused before anything is read into the database',async()=>{
  await addWord({term:'keep',meanings:['m'],example:'',translation:'',tag:'',contentType:'vocabulary'});
  const before=await snapshot(),valid=await buildBackup();
  const huge={...valid,words:Array.from({length:50_001},(_,i)=>({...valid.words[0],id:'w'+i}))};
  await assert.rejects(restoreBackup(huge),/الحد المسموح/);
  assert.equal(await snapshot(),before);
});
