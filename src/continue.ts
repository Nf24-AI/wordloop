/**
 * #27 Continue Learning — «أكمل من حيث توقفت».
 *
 * A device-local pointer (localStorage, never IndexedDB, never sent anywhere) to the last deck or folder the learner
 * *meant* to work on: set only after a meaningful action (a card saved into a deck, a grade given in a deck/folder
 * review, a practice started on a deck's text) — never by merely opening a page.
 *
 * Home resolves the pointer against the current data every time, so a renamed or moved deck still resolves (only its
 * id is stored), and a deleted deck, an empty one or a finished review never shows a misleading «Continue»:
 * - something is due there now      → continue that scoped review (only cards still due; nothing reviewed twice);
 * - nothing due, cards remain       → open the deck/folder;
 * - no active cards left (archived) → add a card to it (decks) or nothing (folders);
 * - deck/folder gone                → nothing.
 * Resolving is read-only: it never writes IndexedDB, dueAt, fsrsState or the review log.
 */
import {dueInScope,inScope,type Deck,type Folder,type Word} from './data.ts';

export type ContinuePointer={kind:'deck'|'folder';id:string;at:string};
export type ContinueAction={action:'review'|'open'|'add';kind:'deck'|'folder';id:string;due:number;cards:number};

const KEY='wordloop-continue';

export function readContinue(storage:Pick<Storage,'getItem'>|null=safeStorage()):ContinuePointer|null{
  try{
    const v=JSON.parse(storage?.getItem(KEY)||'null');
    if(v&&(v.kind==='deck'||v.kind==='folder')&&typeof v.id==='string'&&v.id&&v.id.length<=80&&typeof v.at==='string')return {kind:v.kind,id:v.id,at:v.at};
  }catch{/* unreadable: no pointer */}
  return null;
}
/** Records a meaningful step. Best effort: private mode or a full storage simply means no «Continue» card. */
export function rememberContinue(kind:'deck'|'folder',id:string,storage:Pick<Storage,'setItem'>|null=safeStorage(),now=new Date()):void{
  try{storage?.setItem(KEY,JSON.stringify({kind,id,at:now.toISOString()} satisfies ContinuePointer));}catch{/* private mode */}
}
export function forgetContinue(storage:Pick<Storage,'removeItem'>|null=safeStorage()):void{try{storage?.removeItem(KEY);}catch{/* private mode */}}
function safeStorage():Storage|null{try{return typeof localStorage==='undefined'?null:localStorage;}catch{return null;}}

/** What Home should offer for this pointer right now, or null when there is nothing honest to offer. */
export function resolveContinue(p:ContinuePointer|null,lib:{folders:readonly Folder[];decks:readonly Deck[]},words:readonly Word[],now=Date.now()):ContinueAction|null{
  if(!p)return null;
  const exists=p.kind==='deck'?lib.decks.some(d=>d.id===p.id):lib.folders.some(f=>f.id===p.id);
  if(!exists)return null;
  const scope={kind:p.kind,id:p.id} as const;
  const cards=words.filter(w=>!w.archived&&inScope(w,scope,lib.decks)).length;
  const due=dueInScope(words,scope,lib.decks,now).length;
  if(due>0)return {action:'review',kind:p.kind,id:p.id,due,cards};
  if(cards>0)return {action:'open',kind:p.kind,id:p.id,due:0,cards};
  return p.kind==='deck'?{action:'add',kind:'deck',id:p.id,due:0,cards:0}:null;
}
