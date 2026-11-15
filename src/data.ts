import {DefaultScheduler, Rating, type Grade as FsrsGrade} from 'ts-fsrs';

export type Grade='again'|'hard'|'good'|'easy';
/** #5: the four card kinds. Stored lowercase; UI labels live in the UI layer. */
export type ContentType='vocabulary'|'phrase'|'sentence'|'idiom';
export const CONTENT_TYPES:readonly ContentType[]=['vocabulary','phrase','sentence','idiom'];
/** Maximum length of the English text per kind. Sentences need room; everything else stays short. */
export const TERM_LIMIT:Record<ContentType,number>={vocabulary:100,phrase:160,sentence:300,idiom:160};
export const NOTE_LIMIT=500;
/** A card as the app uses it. Cards saved before #5 have no `contentType`/`note`; they are read as vocabulary with an empty note. */
/**
 * A card as the app uses it. Cards saved before #5 have no `contentType`/`note` (read as vocabulary, empty note);
 * cards saved before #15 have no `deckId` (read as belonging to the default deck). Reading never rewrites storage.
 * `contentLanguage`/`meaningLanguage` are optional per-card overrides of the deck languages (#15/#19).
 */
export type Word={id:string;deckId:string;contentType:ContentType;term:string;meaning:string;meanings:string[];example:string;translation:string;note:string;tag:string;createdAt:string;updatedAt:string;dueAt:string;fsrsState:Record<string,unknown>;archived:boolean;revision:number;contentLanguage?:string;meaningLanguage?:string};
type StoredWord=Omit<Word,'contentType'|'note'|'deckId'|'meanings'>&{contentType?:ContentType;note?:string;deckId?:string;meanings?:unknown};
export type Review={id:string;wordId:string;grade:Grade;reviewedAt:string;nextDueAt:string};
/** #15: a folder groups decks (e.g. «الإنجليزية»). */
export type Folder={id:string;name:string;createdAt:string;updatedAt:string};
/** #15: a deck belongs to exactly one folder and holds cards of any kind. Languages are BCP-47 and independent of the UI locale. */
export type Deck={id:string;folderId:string;name:string;contentLanguage:string;meaningLanguage:string;createdAt:string;updatedAt:string};
/** Backup v3 (#15) adds folders, decks and each card's deckId. v1 and v2 files still import (into the default deck). */
export type Backup={app:'wordloop';version:3;exportedAt:string;folders:Folder[];decks:Deck[];words:Word[];reviews:Review[]};
export const isContentType=(v:unknown):v is ContentType=>CONTENT_TYPES.includes(v as ContentType);
/**
 * #15: fixed, well-known ids for the default folder and deck, so every device and every imported v1/v2 backup maps
 * pre-#15 cards to the same place. Stored names are Arabic; the UI may localise them by id.
 */
export const DEFAULT_FOLDER_ID='00000000-0000-4000-8000-00000000f001';
export const DEFAULT_DECK_ID='00000000-0000-4000-8000-00000000d001';
/** Existing WordLoop content is English with Arabic meanings. */
export const DEFAULT_CONTENT_LANGUAGE='en-US',DEFAULT_MEANING_LANGUAGE='ar-SA';
export const NAME_LIMIT=60;
/** #26: one card, one FSRS schedule, one or more meanings. Each meaning keeps the old 240-character limit. */
export const MEANING_LIMIT=240,MAX_MEANINGS=10;
/** A stored `meanings` value is used only if it is a well-formed list; anything else falls back to the legacy `meaning`. */
function storedMeanings(v:unknown):string[]|null{
  return Array.isArray(v)&&v.length>=1&&v.length<=MAX_MEANINGS&&v.every(m=>typeof m==='string'&&m.trim().length>0&&m.length<=MEANING_LIMIT)?[...v]:null;
}
/** Cleans meanings typed by the learner: trimmed, empty boxes dropped, exact repeats removed. Throws when none is left or a limit is exceeded. */
export function cleanMeanings(input:readonly unknown[]):string[]{
  const out:string[]=[];
  for(const m of input){if(typeof m!=='string')continue;const t=m.trim();if(t&&!out.some(x=>x.toLocaleLowerCase()===t.toLocaleLowerCase()))out.push(t);}
  if(!out.length)throw Error('أضف الكلمة ومعناها أولًا');
  if(out.length>MAX_MEANINGS||out.some(m=>m.length>MEANING_LIMIT))throw Error('أحد النصوص أطول من اللازم');
  return out;
}
export const DEFAULT_FOLDER_NAME='غير مصنفة',DEFAULT_DECK_NAME='بطاقاتي';
/**
 * Legacy-safe view of a stored card: id, dates, FSRS state and revision are passed through untouched.
 * #26: `meanings` is authoritative when well-formed; a pre-#26 card's single `meaning` becomes `meanings[0]` exactly.
 * `meaning` always mirrors `meanings[0]`, so older builds (which read only `meaning`) keep working after a rollback.
 */
export function normalizeWord(w:StoredWord):Word{
  const meanings=storedMeanings(w.meanings)??[w.meaning];
  return {...w,meaning:meanings[0],meanings,deckId:typeof w.deckId==='string'&&w.deckId?w.deckId:DEFAULT_DECK_ID,contentType:isContentType(w.contentType)?w.contentType:'vocabulary',note:typeof w.note==='string'?w.note:''};
}
/** Canonical BCP-47 tag (e.g. `en-us` → `en-US`), or null when the tag is not a valid language tag. */
export function canonicalLanguage(tag:unknown):string|null{
  if(typeof tag!=='string'||!tag||tag.length>35||!/^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$/.test(tag))return null;
  try{return Intl.getCanonicalLocales(tag)[0]??null;}catch{return null;}
}
/** The languages a card is studied in: its own override, else its deck's, else the defaults. Never inferred from the text. */
export function cardLanguages(word:Pick<Word,'deckId'|'contentLanguage'|'meaningLanguage'>,decks:readonly Deck[]):{content:string;meaning:string}{
  const deck=decks.find(d=>d.id===word.deckId);
  return {content:word.contentLanguage||deck?.contentLanguage||DEFAULT_CONTENT_LANGUAGE,meaning:word.meaningLanguage||deck?.meaningLanguage||DEFAULT_MEANING_LANGUAGE};
}
const DB='wordloop-local-v1', VERSION=1;
const ratings:Record<Grade,FsrsGrade>={again:Rating.Again,hard:Rating.Hard,good:Rating.Good,easy:Rating.Easy};
let dbPromise:Promise<IDBDatabase>|null=null;
const request=<T>(r:IDBRequest<T>):Promise<T>=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error||new Error('تعذّر قراءة البيانات المحلية'));});
function open():Promise<IDBDatabase>{
  if(!dbPromise){
    const pending:Promise<IDBDatabase>=new Promise((resolve,reject)=>{
      const r=indexedDB.open(DB,VERSION);
      r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains('words'))db.createObjectStore('words',{keyPath:'id'});if(!db.objectStoreNames.contains('reviews'))db.createObjectStore('reviews',{keyPath:'id'});if(!db.objectStoreNames.contains('meta'))db.createObjectStore('meta',{keyPath:'key'});};
      r.onsuccess=()=>{
        const db=r.result;
        // #4: a closed connection must not stay cached, or every later read/write fails until a reload.
        // `close` fires when the browser drops the connection (e.g. WebKit after the app was backgrounded).
        const forget=()=>{if(dbPromise===pending)dbPromise=null;};
        db.onversionchange=()=>{db.close();forget();};
        db.onclose=forget;
        resolve(db);
      };
      r.onerror=()=>{if(dbPromise===pending)dbPromise=null;reject(r.error||new Error('تعذّر فتح مساحة الكلمات'));};
    });
    dbPromise=pending;
  }
  return dbPromise;
}
/** Starts a transaction, reopening once if the cached connection was already closed. Nothing has been read or written when it retries. */
async function transaction(stores:string|string[],mode:IDBTransactionMode):Promise<IDBTransaction>{
  const db=await open();
  try{return db.transaction(stores,mode);}
  catch(e){
    if(!(e instanceof DOMException&&e.name==='InvalidStateError'))throw e;
    dbPromise=null;return (await open()).transaction(stores,mode);
  }
}
/** Test-only: drop the cached connection so a fresh fake IndexedDB can be used. */
export function resetConnectionForTests(){dbPromise=null;}
async function getAll<T>(store:'words'|'reviews'):Promise<T[]>{return request((await transaction(store,'readonly')).objectStore(store).getAll()) as Promise<T[]>;}
function settled(tx:IDBTransaction):Promise<void>{return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||new Error('تعذّر حفظ التغيير'));tx.onabort=()=>reject(tx.error||new Error('لم يكتمل الحفظ'));});}

/* #4: other tabs/windows of the app refresh after any committed local write. Only a ping is sent, never word data. */
const CHANNEL='wordloop-local-changes';
const channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel(CHANNEL):null;
(channel as unknown as {unref?:()=>void}|null)?.unref?.(); // Node test runner only: don't keep the process alive
function announceChange(){try{channel?.postMessage({type:'changed'});}catch{/* best effort */}}
export function onOtherTabChange(listener:()=>void):()=>void{
  if(typeof BroadcastChannel==='undefined')return ()=>{};
  const ch=new BroadcastChannel(CHANNEL);ch.onmessage=()=>listener();
  return ()=>ch.close();
}
/** Duplicate key: case-insensitive, surrounding and repeated inner whitespace ignored. */
export function normalizeTerm(term:string){return term.trim().replace(/\s+/g,' ').toLocaleLowerCase();}
/* ---------- #15: folders and decks ----------
 * Stored as records in the existing `meta` store (keys `folder:<id>` / `deck:<id>`), so the IndexedDB schema
 * version stays 1: no upgrade transaction runs, and an older app build can still open the database after a rollback.
 */
type LibraryRecord=({key:string;type:'folder'}&Folder)|({key:string;type:'deck'}&Deck);
const folderKey=(id:string)=>`folder:${id}`,deckKey=(id:string)=>`deck:${id}`;
/** Exact key ranges for each kind, so nothing else in meta (e.g. `lastBackup`) is ever read or cleared as library data. */
const LIBRARY_RANGES=()=>[IDBKeyRange.bound('deck:','deck:￿'),IDBKeyRange.bound('folder:','folder:￿')];
function defaultFolder(at:string):Folder{return {id:DEFAULT_FOLDER_ID,name:DEFAULT_FOLDER_NAME,createdAt:at,updatedAt:at};}
function defaultDeck(at:string):Deck{return {id:DEFAULT_DECK_ID,folderId:DEFAULT_FOLDER_ID,name:DEFAULT_DECK_NAME,contentLanguage:DEFAULT_CONTENT_LANGUAGE,meaningLanguage:DEFAULT_MEANING_LANGUAGE,createdAt:at,updatedAt:at};}
const asFolder=({id,name,createdAt,updatedAt}:Folder):Folder=>({id,name,createdAt,updatedAt});
const asDeck=({id,folderId,name,contentLanguage,meaningLanguage,createdAt,updatedAt}:Deck):Deck=>({id,folderId,name,contentLanguage,meaningLanguage,createdAt,updatedAt});
async function readLibrary(store:IDBObjectStore):Promise<{folders:Folder[];decks:Deck[]}>{
  const all=(await Promise.all(LIBRARY_RANGES().map(r=>request(store.getAll(r))))).flat() as LibraryRecord[];
  return {folders:all.filter(r=>r.type==='folder').map(r=>asFolder(r as Folder)),decks:all.filter(r=>r.type==='deck').map(r=>asDeck(r as Deck))};
}
/** Creates the default folder/deck if missing. Idempotent; runs inside the caller's readwrite transaction. */
async function ensureDefaults(store:IDBObjectStore){
  const at=new Date().toISOString();
  if(!await request(store.get(folderKey(DEFAULT_FOLDER_ID))))store.put({key:folderKey(DEFAULT_FOLDER_ID),type:'folder',...defaultFolder(at)});
  if(!await request(store.get(deckKey(DEFAULT_DECK_ID))))store.put({key:deckKey(DEFAULT_DECK_ID),type:'deck',...defaultDeck(at)});
}
const byName=(a:{name:string},b:{name:string})=>a.name.localeCompare(b.name,'ar');
/** Folders and decks, sorted by name, with the defaults always present. Only `meta` is written (defaults, once). */
export async function listLibrary():Promise<{folders:Folder[];decks:Deck[]}>{
  const tx=await transaction('meta','readwrite'),end=settled(tx),store=tx.objectStore('meta');
  await ensureDefaults(store);const lib=await readLibrary(store);await end;
  return {folders:lib.folders.sort(byName),decks:lib.decks.sort(byName)};
}
function cleanName(name:string){const n=String(name??'').trim().replace(/\s+/g,' ');if(!n)throw Error('اكتب اسمًا أولًا');if(n.length>NAME_LIMIT)throw Error('أحد النصوص أطول من اللازم');return n;}
function languageOrThrow(tag:unknown){const c=canonicalLanguage(tag);if(!c)throw Error('رمز اللغة غير صحيح');return c;}
/** Runs one library change atomically over meta (+ words when needed), with the defaults guaranteed to exist. */
async function libraryChange<T>(stores:('meta'|'words')[],fn:(meta:IDBObjectStore,lib:{folders:Folder[];decks:Deck[]},tx:IDBTransaction)=>Promise<T>):Promise<T>{
  const tx=await transaction(stores,'readwrite'),end=settled(tx),meta=tx.objectStore('meta');
  let out:T;
  try{await ensureDefaults(meta);out=await fn(meta,await readLibrary(meta),tx);}
  catch(e){try{tx.abort();}catch{/* already finished */}await end.catch(()=>undefined);throw e;}
  await end;announceChange();return out;
}
const sameName=(a:string,b:string)=>normalizeTerm(a)===normalizeTerm(b);
export async function createFolder(name:string):Promise<Folder>{
  return libraryChange(['meta'],async(meta,{folders})=>{
    const n=cleanName(name);
    if(folders.some(f=>sameName(f.name,n)))throw Error('يوجد مجلد بهذا الاسم');
    const at=new Date().toISOString(),folder:Folder={id:crypto.randomUUID(),name:n,createdAt:at,updatedAt:at};
    meta.add({key:folderKey(folder.id),type:'folder',...folder});return folder;
  });
}
export async function renameFolder(id:string,name:string):Promise<Folder>{
  return libraryChange(['meta'],async(meta,{folders})=>{
    const n=cleanName(name),f=folders.find(x=>x.id===id);if(!f)throw Error('لم نجد المجلد');
    if(folders.some(x=>x.id!==id&&sameName(x.name,n)))throw Error('يوجد مجلد بهذا الاسم');
    const next={...f,name:n,updatedAt:new Date().toISOString()};meta.put({key:folderKey(id),type:'folder',...next});return next;
  });
}
export type NewDeck={folderId:string;name:string;contentLanguage?:string;meaningLanguage?:string};
export async function createDeck(data:NewDeck):Promise<Deck>{
  return libraryChange(['meta'],async(meta,{folders,decks})=>{
    const n=cleanName(data.name);
    if(!folders.some(f=>f.id===data.folderId))throw Error('لم نجد المجلد');
    if(decks.some(d=>d.folderId===data.folderId&&sameName(d.name,n)))throw Error('توجد حزمة بهذا الاسم في المجلد');
    const at=new Date().toISOString();
    const deck:Deck={id:crypto.randomUUID(),folderId:data.folderId,name:n,contentLanguage:languageOrThrow(data.contentLanguage??DEFAULT_CONTENT_LANGUAGE),meaningLanguage:languageOrThrow(data.meaningLanguage??DEFAULT_MEANING_LANGUAGE),createdAt:at,updatedAt:at};
    meta.add({key:deckKey(deck.id),type:'deck',...deck});return deck;
  });
}
/** Rename a deck, change its languages or move it to another folder. Cards, reviews and FSRS are not touched. */
export async function updateDeck(id:string,patch:{name?:string;folderId?:string;contentLanguage?:string;meaningLanguage?:string}):Promise<Deck>{
  return libraryChange(['meta'],async(meta,{folders,decks})=>{
    const d=decks.find(x=>x.id===id);if(!d)throw Error('لم نجد الحزمة');
    const next:Deck={...d,
      name:patch.name===undefined?d.name:cleanName(patch.name),
      folderId:patch.folderId??d.folderId,
      contentLanguage:patch.contentLanguage===undefined?d.contentLanguage:languageOrThrow(patch.contentLanguage),
      meaningLanguage:patch.meaningLanguage===undefined?d.meaningLanguage:languageOrThrow(patch.meaningLanguage),
      updatedAt:new Date().toISOString()};
    if(!folders.some(f=>f.id===next.folderId))throw Error('لم نجد المجلد');
    if(decks.some(x=>x.id!==id&&x.folderId===next.folderId&&sameName(x.name,next.name)))throw Error('توجد حزمة بهذا الاسم في المجلد');
    meta.put({key:deckKey(id),type:'deck',...next});return next;
  });
}
/** Deletes an empty deck. Never cascades: a deck that still holds any card (archived included) is refused. */
export async function deleteDeck(id:string):Promise<void>{
  await libraryChange(['meta','words'],async(meta,{decks},tx)=>{
    if(id===DEFAULT_DECK_ID)throw Error('ما نقدر نحذف الحزمة الافتراضية');
    if(!decks.some(d=>d.id===id))throw Error('لم نجد الحزمة');
    const words=(await request(tx.objectStore('words').getAll()) as StoredWord[]).map(normalizeWord);
    if(words.some(w=>w.deckId===id))throw Error('الحزمة فيها بطاقات، انقلها أولًا');
    meta.delete(deckKey(id));
  });
}
/** Deletes an empty folder. Never cascades: a folder that still holds a deck is refused. */
export async function deleteFolder(id:string):Promise<void>{
  await libraryChange(['meta'],async(meta,{folders,decks})=>{
    if(id===DEFAULT_FOLDER_ID)throw Error('ما نقدر نحذف المجلد الافتراضي');
    if(!folders.some(f=>f.id===id))throw Error('لم نجد المجلد');
    if(decks.some(d=>d.folderId===id))throw Error('المجلد فيه حزم، انقلها أولًا');
    meta.delete(folderKey(id));
  });
}
/** Moves a card to another deck. id, createdAt, dueAt, revision, FSRS state and review history stay exactly as they were. */
export async function moveWord(id:string,deckId:string):Promise<Word>{
  return libraryChange(['meta','words'],async(_meta,{decks},tx)=>{
    if(!decks.some(d=>d.id===deckId))throw Error('لم نجد الحزمة');
    const store=tx.objectStore('words'),stored=await request<StoredWord|undefined>(store.get(id));
    if(!stored)throw Error('لم نجد الكلمة');
    const next:Word={...normalizeWord(stored),deckId,updatedAt:new Date().toISOString()};store.put(next);return next;
  });
}
export type DeckCount={cards:number;due:number};
export type FolderCount={decks:number;cards:number;due:number};
/** Active card / due counts per deck and folder. A card whose deck is missing counts in the default deck, never dropped. */
export function libraryCounts(words:readonly Word[],decks:readonly Deck[],now=Date.now()):{deck:Map<string,DeckCount>;folder:Map<string,FolderCount>}{
  const deckIds=new Set(decks.map(d=>d.id)),folderOf=new Map(decks.map(d=>[d.id,d.folderId]));
  const deck=new Map<string,DeckCount>(),folder=new Map<string,FolderCount>();
  const folderEntry=(id:string)=>{let f=folder.get(id);if(!f){f={decks:0,cards:0,due:0};folder.set(id,f);}return f;};
  for(const d of decks){deck.set(d.id,{cards:0,due:0});folderEntry(d.folderId).decks++;}
  for(const w of words){
    if(w.archived)continue;
    const id=deckIds.has(w.deckId)?w.deckId:DEFAULT_DECK_ID,due=Date.parse(w.dueAt)<=now?1:0;
    let dc=deck.get(id);if(!dc){dc={cards:0,due:0};deck.set(id,dc);}dc.cards++;dc.due+=due;
    const fc=folderEntry(folderOf.get(id)??DEFAULT_FOLDER_ID);fc.cards++;fc.due+=due;
  }
  return {deck,folder};
}
export async function listWords():Promise<Word[]>{return (await getAll<StoredWord>('words')).map(normalizeWord).sort((a,b)=>a.dueAt.localeCompare(b.dueAt));}
export async function listReviews(){return getAll<Review>('reviews');}
export async function getWord(id:string):Promise<Word|undefined>{const w=await request<StoredWord|undefined>((await transaction('words','readonly')).objectStore('words').get(id));return w&&normalizeWord(w);}
/** `meanings` (#26) or the single legacy `meaning`; at least one non-empty meaning is required. */
export type NewCard={contentType?:ContentType;deckId?:string;term:string;meaning?:string;meanings?:string[];example:string;translation:string;note?:string;tag:string;contentLanguage?:string;meaningLanguage?:string};
/**
 * #26: the unified Add form no longer asks for a kind. New cards get a safe internal kind from the text's shape only
 * (never its meaning): one word → vocabulary; ends like a sentence or has 6+ words → sentence; otherwise phrase.
 * Idiom is never guessed. Legacy kinds stay stored and displayed as they were (#5).
 */
export function inferContentType(term:string):ContentType{
  const t=term.trim().replace(/\s+/g,' ');const n=t?t.split(' ').length:0;
  if(n<=1)return 'vocabulary';
  if(/[.!?؟…]$/.test(t)||n>=6)return 'sentence';
  return 'phrase';
}
export async function addWord(data:NewCard):Promise<Word>{
  const contentType=data.contentType??'vocabulary';
  if(!isContentType(contentType))throw Error('نوع البطاقة غير معروف');
  const term=data.term.trim().replace(/\s+/g,' '),note=(data.note??'').trim();
  if(!term)throw Error('أضف الكلمة ومعناها أولًا');
  const meanings=cleanMeanings(data.meanings??[data.meaning??'']);
  if(term.length>TERM_LIMIT[contentType]||data.example.length>500||data.translation.length>400||note.length>NOTE_LIMIT||data.tag.length>40)throw Error('أحد النصوص أطول من اللازم');
  // Duplicates are checked within the same kind only: "break the ice" may be both a phrase and an idiom.
  const words=await listWords();const key=normalizeTerm(term);if(words.some(w=>!w.archived&&w.contentType===contentType&&normalizeTerm(w.term)===key))throw Error('هذه الكلمة موجودة عندك بالفعل');
  const deckId=data.deckId??DEFAULT_DECK_ID;
  // Optional per-card language override (#26 point 3); stored only when given, validated as BCP-47.
  const langs:{contentLanguage?:string;meaningLanguage?:string}={};
  for(const k of ['contentLanguage','meaningLanguage'] as const){const v=data[k];if(v===undefined)continue;const c=canonicalLanguage(v);if(!c)throw Error('رمز اللغة غير صحيح');langs[k]=c;}
  if(deckId!==DEFAULT_DECK_ID&&!(await listLibrary()).decks.some(d=>d.id===deckId))throw Error('لم نجد الحزمة');
  const now=new Date(),id=crypto.randomUUID();
  const scheduler=await DefaultScheduler({version:'FSRS-7',desiredRetention:0.9,enableShortTerm:true,learningSteps:['1m','10m'],relearningSteps:['10m']});
  const fsrs=scheduler.newCard({cardId:id,now});
  const word:Word={id,deckId,contentType,term,meaning:meanings[0],meanings,example:data.example.trim(),translation:data.translation.trim(),note,tag:data.tag.trim()||'عام',createdAt:now.toISOString(),updatedAt:now.toISOString(),dueAt:fsrs.dueAt.toISOString(),fsrsState:JSON.parse(JSON.stringify(fsrs)),archived:false,revision:0,...langs};
  const tx=await transaction('words','readwrite'),end=settled(tx);tx.objectStore('words').add(word);await end;
  announceChange();return word;
}
export type CardEdit={term?:string;meanings?:string[];example?:string;translation?:string;note?:string;tag?:string};
/**
 * #26: edit a card's content (term, meanings, example, translation, note, tag). The card keeps its id, deck, kind,
 * createdAt, dueAt, fsrsState, revision, archive state and review history: editing never regrades or reschedules.
 */
export async function editWord(id:string,patch:CardEdit):Promise<Word>{
  const tx=await transaction('words','readwrite'),end=settled(tx),store=tx.objectStore('words');
  let next:Word;
  try{
    const stored=await request<StoredWord|undefined>(store.get(id));if(!stored)throw Error('لم نجد الكلمة');
    const old=normalizeWord(stored);
    const term=patch.term===undefined?old.term:patch.term.trim().replace(/\s+/g,' ');
    const meanings=patch.meanings===undefined?old.meanings:cleanMeanings(patch.meanings);
    const pick=(v:string|undefined,was:string)=>v===undefined?was:v.trim();
    const example=pick(patch.example,old.example),translation=pick(patch.translation,old.translation),note=pick(patch.note,old.note),tag=patch.tag===undefined?old.tag:(patch.tag.trim()||'عام');
    if(!term)throw Error('أضف الكلمة ومعناها أولًا');
    if(term.length>TERM_LIMIT[old.contentType]||example.length>500||translation.length>400||note.length>NOTE_LIMIT||tag.length>40)throw Error('أحد النصوص أطول من اللازم');
    if(normalizeTerm(term)!==normalizeTerm(old.term)){
      const all=(await request(store.getAll()) as StoredWord[]).map(normalizeWord);
      if(all.some(w=>w.id!==id&&!w.archived&&w.contentType===old.contentType&&normalizeTerm(w.term)===normalizeTerm(term)))throw Error('هذه الكلمة موجودة عندك بالفعل');
    }
    next={...old,term,meaning:meanings[0],meanings,example,translation,note,tag,updatedAt:new Date().toISOString()};
    store.put(next);
  }catch(e){try{tx.abort();}catch{/* already finished */}await end.catch(()=>undefined);throw e;}
  await end;announceChange();return next;
}
export async function archiveWord(id:string):Promise<void>{const tx=await transaction('words','readwrite'),end=settled(tx),store=tx.objectStore('words');const w=await request<StoredWord|undefined>(store.get(id));if(!w){tx.abort();throw Error('لم نجد الكلمة');}store.put({...normalizeWord(w),archived:true,updatedAt:new Date().toISOString()});await end;announceChange();}
export async function reviewWord(id:string,grade:Grade):Promise<string>{
  const readTx=await transaction('words','readonly');const stored=await request<StoredWord|undefined>(readTx.objectStore('words').get(id));const old=stored&&normalizeWord(stored);
  if(!old||old.archived)throw Error('لم نجد الكلمة');
  if(new Date(old.dueAt).getTime()>Date.now()+1000)throw Error('لم يحن وقت مراجعة هذه الكلمة');
  const now=new Date(),scheduler=await DefaultScheduler({version:'FSRS-7',desiredRetention:0.9,enableShortTerm:true,learningSteps:['1m','10m'],relearningSteps:['10m']});
  const raw=old.fsrsState;
  const card={...raw,dueAt:new Date(String(raw.dueAt)),lastReviewAt:raw.lastReviewAt?new Date(String(raw.lastReviewAt)):null};
  const result=scheduler.review({card:card as Parameters<typeof scheduler.review>[0]['card'],grade:ratings[grade],now});
  const nextAt=result.card.dueAt.toISOString();
  // Two stores committed in one atomic local transaction.
  const tx=await transaction(['words','reviews'],'readwrite'),end=settled(tx),store=tx.objectStore('words');
  const existing=await request<StoredWord|undefined>(store.get(id));
  if(!existing||existing.revision!==old.revision){tx.abort();throw Error('تغيرت هذه الكلمة في تبويب آخر، حدّث الصفحة');}
  // Built on the record read inside this transaction, so a concurrent deck move (which keeps revision) is not undone.
  store.put({...normalizeWord(existing),fsrsState:JSON.parse(JSON.stringify(result.card)),dueAt:nextAt,updatedAt:now.toISOString(),revision:old.revision+1});
  tx.objectStore('reviews').put({id:crypto.randomUUID(),wordId:id,grade,reviewedAt:now.toISOString(),nextDueAt:nextAt} satisfies Review);
  await end;announceChange();return nextAt;
}
function text(v:unknown,max:number):v is string{return typeof v==='string'&&v.length<=max;}
/** v1 cards have no kind (read as vocabulary); v2+ cards must carry a known kind; v3 cards must name a deck. */
function validWord(w:unknown,version:1|2|3):w is StoredWord{
  if(!w||typeof w!=='object')return false;
  const x=w as Partial<StoredWord>;
  if(version>=2?!isContentType(x.contentType):x.contentType!==undefined&&!isContentType(x.contentType))return false;
  if(version===3&&!(text(x.deckId,80)&&x.deckId.length>0))return false;
  // #26: an optional meanings list must be well-formed; the legacy single meaning stays required in every version.
  if(x.meanings!==undefined&&!storedMeanings(x.meanings))return false;
  if(x.contentLanguage!==undefined&&!canonicalLanguage(x.contentLanguage))return false;
  if(x.meaningLanguage!==undefined&&!canonicalLanguage(x.meaningLanguage))return false;
  if(x.note!==undefined&&!text(x.note,NOTE_LIMIT))return false;
  const kind=isContentType(x.contentType)?x.contentType:'vocabulary';
  return text(x.id,80)&&text(x.term,TERM_LIMIT[kind])&&x.term.length>0&&text(x.meaning,240)&&x.meaning.length>0&&text(x.example,500)&&text(x.translation,400)&&text(x.tag,40)&&text(x.createdAt,64)&&text(x.updatedAt,64)&&text(x.dueAt,64)&&Number.isFinite(Date.parse(x.dueAt))&&typeof x.revision==='number'&&Number.isInteger(x.revision)&&x.revision>=0&&typeof x.archived==='boolean'&&typeof x.fsrsState==='object'&&!!x.fsrsState&&!Array.isArray(x.fsrsState)&&text((x.fsrsState as Record<string,unknown>).dueAt,64)&&Number.isFinite(Date.parse(String((x.fsrsState as Record<string,unknown>).dueAt)))&&x.dueAt===(x.fsrsState as Record<string,unknown>).dueAt;
}
function validReview(r:unknown):r is Review{
  if(!r||typeof r!=='object')return false;
  const x=r as Partial<Review>;
  return text(x.id,80)&&text(x.wordId,80)&&['again','hard','good','easy'].includes(String(x.grade))&&text(x.reviewedAt,64)&&text(x.nextDueAt,64)&&Number.isFinite(Date.parse(x.reviewedAt))&&Number.isFinite(Date.parse(x.nextDueAt));
}
const validStamp=(v:unknown):v is string=>text(v,64)&&Number.isFinite(Date.parse(v));
function validFolder(f:unknown):f is Folder{
  if(!f||typeof f!=='object')return false;const x=f as Partial<Folder>;
  return text(x.id,80)&&x.id.length>0&&text(x.name,NAME_LIMIT)&&x.name.trim().length>0&&validStamp(x.createdAt)&&validStamp(x.updatedAt);
}
function validDeck(d:unknown):d is Deck{
  if(!d||typeof d!=='object')return false;const x=d as Partial<Deck>;
  return text(x.id,80)&&x.id.length>0&&text(x.folderId,80)&&text(x.name,NAME_LIMIT)&&x.name.trim().length>0&&!!canonicalLanguage(x.contentLanguage)&&!!canonicalLanguage(x.meaningLanguage)&&validStamp(x.createdAt)&&validStamp(x.updatedAt);
}
/**
 * Validates a backup file completely before anything local is touched. v1/v2 files predate folders, so their cards
 * go to the default deck; v3 must be internally consistent (every deck in a known folder, every card in a known deck).
 * Always returned as v3.
 */
export function validateBackup(data:unknown):Backup{
  if(!data||typeof data!=='object')throw Error('هذا الملف ليس نسخة WordLoop');
  const v=data as {app?:unknown;version?:unknown;exportedAt?:unknown;words?:unknown;reviews?:unknown;folders?:unknown;decks?:unknown};
  if(v.app!=='wordloop'||(v.version!==1&&v.version!==2&&v.version!==3)||!Array.isArray(v.words)||!Array.isArray(v.reviews))throw Error('صيغة الملف غير مدعومة');
  if(v.version===3&&(!Array.isArray(v.folders)||!Array.isArray(v.decks)))throw Error('صيغة الملف غير مدعومة');
  if(v.words.length>50000||v.reviews.length>500000||(Array.isArray(v.folders)&&v.folders.length>1000)||(Array.isArray(v.decks)&&v.decks.length>5000))throw Error('هذا الملف أكبر من الحد المسموح');
  const version=v.version;
  if(!v.words.every(w=>validWord(w,version))||!v.reviews.every(validReview))throw Error('بعض البيانات في الملف غير صحيحة');
  const at=validStamp(v.exportedAt)?v.exportedAt:new Date().toISOString();
  let folders:Folder[],decks:Deck[],words:Word[];
  if(version===3){
    if(!(v.folders as unknown[]).every(validFolder)||!(v.decks as unknown[]).every(validDeck))throw Error('بعض البيانات في الملف غير صحيحة');
    // Only known fields are kept, with canonical language tags. The default folder/deck are added if a file lacks them.
    folders=(v.folders as Folder[]).map(asFolder);
    decks=(v.decks as Deck[]).map(d=>({...asDeck(d),contentLanguage:canonicalLanguage(d.contentLanguage)!,meaningLanguage:canonicalLanguage(d.meaningLanguage)!}));
    if(!folders.some(f=>f.id===DEFAULT_FOLDER_ID))folders.unshift(defaultFolder(at));
    if(!decks.some(d=>d.id===DEFAULT_DECK_ID))decks.unshift(defaultDeck(at));
    words=(v.words as StoredWord[]).map(w=>{
      const n=normalizeWord(w);
      if(n.contentLanguage)n.contentLanguage=canonicalLanguage(n.contentLanguage)!;
      if(n.meaningLanguage)n.meaningLanguage=canonicalLanguage(n.meaningLanguage)!;
      return n;
    });
  }else{
    // v1/v2: every card goes to the default deck; nothing else about it changes.
    folders=[defaultFolder(at)];decks=[defaultDeck(at)];
    words=(v.words as StoredWord[]).map(w=>({...normalizeWord(w),deckId:DEFAULT_DECK_ID}));
  }
  const reviews=v.reviews as Review[];
  const folderIds=new Set(folders.map(f=>f.id)),deckIds=new Set(decks.map(d=>d.id)),wordIds=new Set(words.map(w=>w.id)),reviewIds=new Set(reviews.map(r=>r.id));
  if(wordIds.size!==words.length||reviewIds.size!==reviews.length||reviews.some(r=>!wordIds.has(r.wordId)))throw Error('توجد بيانات مكررة أو مراجعات بلا كلمات');
  if(folderIds.size!==folders.length||deckIds.size!==decks.length||decks.some(d=>!folderIds.has(d.folderId))||words.some(w=>!deckIds.has(w.deckId)))throw Error('بعض البيانات في الملف غير صحيحة');
  return {app:'wordloop',version:3,exportedAt:at,folders,decks,words,reviews};
}
export async function buildBackup():Promise<Backup>{
  const {folders,decks}=await listLibrary();
  return {app:'wordloop',version:3,exportedAt:new Date().toISOString(),folders,decks,words:await listWords(),reviews:await listReviews()};
}
/** Replaces cards, reviews, folders and decks in one transaction. Other meta (the last-backup date) is kept. */
export async function restoreBackup(backup:unknown):Promise<void>{
  const safe=validateBackup(backup),tx=await transaction(['words','reviews','meta'],'readwrite'),end=settled(tx);
  const words=tx.objectStore('words'),reviews=tx.objectStore('reviews'),meta=tx.objectStore('meta');
  // Any synchronous failure must abort, or the browser would commit the clear() on its own.
  try{
    words.clear();reviews.clear();for(const r of LIBRARY_RANGES())meta.delete(r);
    for(const f of safe.folders)meta.put({key:folderKey(f.id),type:'folder',...f});
    for(const d of safe.decks)meta.put({key:deckKey(d.id),type:'deck',...d});
    for(const w of safe.words)words.put(w);for(const r of safe.reviews)reviews.put(r);
  }
  catch(e){try{tx.abort();}catch{/* already finished */}await end.catch(()=>undefined);throw e;}
  await end;announceChange();
}
export async function rememberBackup(){const tx=await transaction('meta','readwrite'),end=settled(tx);tx.objectStore('meta').put({key:'lastBackup',value:new Date().toISOString()});await end;}
export async function lastBackupDate():Promise<string|null>{const v=await request<{key:string;value:string}|undefined>((await transaction('meta','readonly')).objectStore('meta').get('lastBackup'));return v?.value||null;}
const riyadhDay=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'});
/** Calendar day (YYYY-MM-DD) in Asia/Riyadh. */
export const riyadhDayOf=(d:Date|string)=>riyadhDay.format(typeof d==='string'?new Date(d):d);
export type Summary={
  /** Active (non-archived) cards. */
  inLibrary:number;
  /** Active cards with dueAt <= now. */
  dueNow:number;
  /** Active cards with now < dueAt <= now + 7 days: upcoming, not reviewed or completed. */
  scheduledNext7Days:number;
  /** Distinct cards with at least one review event today (Asia/Riyadh). */
  cardsReviewedToday:number;
  /** All review events today (Asia/Riyadh); the same card can count several times, e.g. after "again". */
  reviewAttemptsToday:number;
};
/** #10: honest counters. Read-only; FSRS scheduling is not involved. */
export function summary(words:Word[],reviews:Review[],now=new Date()):Summary{
  const t=now.getTime(),week=t+7*86_400_000,day=riyadhDayOf(now);
  const active=words.filter(w=>!w.archived),due=(w:Word)=>Date.parse(w.dueAt);
  const today=reviews.filter(r=>riyadhDayOf(r.reviewedAt)===day);
  return {
    inLibrary:active.length,
    dueNow:active.filter(w=>due(w)<=t).length,
    scheduledNext7Days:active.filter(w=>due(w)>t&&due(w)<=week).length,
    cardsReviewedToday:new Set(today.map(r=>r.wordId)).size,
    reviewAttemptsToday:today.length,
  };
}
