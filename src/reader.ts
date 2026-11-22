/**
 * #77 Reading 2.0 — the book reader's logic. Pure: no DOM, no IndexedDB, no network.
 *
 * - `readerParagraphs` turns a matched story into paragraphs of plain runs and highlighted runs. Two kinds, and only two:
 *     saved     = a card that is really in the learner's library AND really occurs in the text (the story matcher,
 *                 inflected forms included, so highlights always agree with «your words in the story»);
 *     suggested = an expression from the bundled phrase list (see phrasebook.ts) that has a meaning in the deck's
 *                 meaning language. Exact wording only, first occurrence only, a small cap per story.
 *   Saved cards are placed first, so a suggestion can never hide or split a saved card. No level is ever implied.
 * - Reader preferences (font size/style, appearance, highlights, focus) and «finished reading» marks live in
 *   localStorage on this device. Nothing here reads or writes cards, FSRS state, due dates or reviews.
 */
import {baseLang,highlightParts} from './story.ts';
import {PHRASEBOOK,type PhraseEntry} from './phrasebook.ts';

/* ───────── highlights ───────── */
export type Suggestion={term:string;meaning:string};
export type Segment={text:string;kind?:'saved'|'suggested';term?:string};
export const MAX_SUGGESTIONS=6;
const key=(s:string)=>s.normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase();

/** Bundled expressions for a content language that have a meaning in `meaningLanguage`. Unknown pair → none. */
export function suggestionsFor(contentLanguage:string,meaningLanguage:string):Suggestion[]{
  const list:readonly PhraseEntry[]|undefined=PHRASEBOOK[baseLang(contentLanguage)],m=baseLang(meaningLanguage);
  if(!list||m===baseLang(contentLanguage))return [];
  return list.flatMap(e=>{const meaning=m==='ar'?e.ar:m==='en'?e.en:undefined;return meaning?[{term:e.term,meaning}]:[];});
}

/**
 * Paragraphs of segments. `parts` is the story already split by the story matcher into plain runs and runs that are
 * one of the learner's cards (`highlightParts`). Suggestions are layered onto the plain runs only. A suggestion is
 * skipped when the learner already has that term (`ownedTerms`), after its first occurrence, and beyond
 * `MAX_SUGGESTIONS`. Every visible character is kept; blank lines become paragraph breaks.
 */
export function readerParagraphs(parts:readonly {text:string;term?:string}[],suggestions:readonly Suggestion[]=[],ownedTerms:readonly string[]=[]):Segment[][]{
  const owned=new Set([...ownedTerms,...parts.flatMap(x=>x.term?[x.term]:[])].map(key));
  const offer=suggestions.map(s=>s.term).filter(t=>!owned.has(key(t)));
  const seen=new Set<string>(),out:Segment[][]=[[]];
  const plain=(text:string)=>{if(!text)return;const para=out[out.length-1],last=para[para.length-1];if(last&&!last.kind)last.text+=text;else para.push({text});};
  for(const part of parts){
    if(part.term){out[out.length-1].push({text:part.text,kind:'saved',term:part.term});continue;}
    part.text.replace(/\r\n?/g,'\n').split(/\n+/).forEach((line,i)=>{
      if(i>0)out.push([]);
      // Exact wording for suggestions (no inflection guessing): lang '' = match as written.
      for(const x of offer.length?highlightParts(line,offer,''):[{text:line} as {text:string;term?:string}]){
        const k=x.term?key(x.term):'';
        if(x.term&&!seen.has(k)&&seen.size<MAX_SUGGESTIONS){seen.add(k);out[out.length-1].push({text:x.text,kind:'suggested',term:x.term});}
        else plain(x.text);
      }
    });
  }
  // Trim the edges of each paragraph (the break itself carried the whitespace) and drop empty ones.
  return out.map(para=>{
    const p=para.map(x=>({...x}));
    if(p.length&&!p[0].kind)p[0].text=p[0].text.replace(/^\s+/,'');
    if(p.length&&!p[p.length-1].kind)p[p.length-1].text=p[p.length-1].text.replace(/\s+$/,'');
    return p.filter(x=>x.text);
  }).filter(para=>para.length);
}

/** Words in the text (for the reading-time estimate). */
export const wordCount=(s:string)=>s.split(/\s+/).filter(w=>/[\p{L}\p{N}]/u.test(w)).length;
/** A calm learner pace (about 130 words a minute), never less than one minute. An estimate, shown as such. */
export const readingMinutes=(body:string)=>Math.max(1,Math.round(wordCount(body)/130));

/* ───────── storage (this device only) ───────── */
type Store=Pick<Storage,'getItem'|'setItem'>;
const local=():Store|null=>{try{return typeof localStorage==='undefined'?null:localStorage;}catch{return null;}};
const read=<T>(k:string,store:Store|null):T|null=>{try{return JSON.parse(store?.getItem(k)||'null') as T|null;}catch{return null;}};
const write=(k:string,v:unknown,store:Store|null)=>{try{store?.setItem(k,JSON.stringify(v));}catch{/* private mode: lasts for this visit */}};

/* ───────── preferences ───────── */
/** Five accessible steps; the scale multiplies the responsive base size. */
export const FONT_SCALES=[.88,1,1.14,1.3,1.5] as const;
export const DEFAULT_SIZE=1;
export const READER_FONTS=['serif','sans'] as const;
export const READER_THEMES=['auto','light','dark'] as const;
export type ReaderPrefs={size:number;font:typeof READER_FONTS[number];theme:typeof READER_THEMES[number];highlights:boolean;focus:boolean};
export const DEFAULT_PREFS:ReaderPrefs={size:DEFAULT_SIZE,font:'serif',theme:'auto',highlights:true,focus:false};
const PREFS='wordloop-reader-prefs';
/** Anything missing, unknown or out of range falls back to the default (an old or hand-edited value never breaks the page). */
export function cleanPrefs(raw:unknown):ReaderPrefs{
  const r=(typeof raw==='object'&&raw!==null?raw:{}) as Record<string,unknown>,d=DEFAULT_PREFS;
  return {
    size:Number.isInteger(r.size)&&(r.size as number)>=0&&(r.size as number)<FONT_SCALES.length?r.size as number:d.size,
    font:(READER_FONTS as readonly unknown[]).includes(r.font)?r.font as ReaderPrefs['font']:d.font,
    theme:(READER_THEMES as readonly unknown[]).includes(r.theme)?r.theme as ReaderPrefs['theme']:d.theme,
    highlights:typeof r.highlights==='boolean'?r.highlights:d.highlights,
    focus:typeof r.focus==='boolean'?r.focus:d.focus,
  };
}
export const readPrefs=(store:Store|null=local())=>cleanPrefs(read(PREFS,store));
export const writePrefs=(p:ReaderPrefs,store:Store|null=local())=>write(PREFS,cleanPrefs(p),store);

/* ───────── «finished reading» ───────── */
const DONE='wordloop-reading-done',DONE_MAX=500;
/** One entry per text: when it was first finished, and the last time. Finishing again never adds a second entry. */
export type ReadMark={first:string;last:string};
function marks(store:Store|null):Record<string,ReadMark>{
  const m=read<Record<string,ReadMark>>(DONE,store);
  if(typeof m!=='object'||m===null||Array.isArray(m))return {};
  return Object.fromEntries(Object.entries(m).filter(([,v])=>v&&typeof v.first==='string'&&typeof v.last==='string'));
}
export const isRead=(passageId:string,store:Store|null=local())=>passageId in marks(store);
/** Marks a text as read. Returns whether this was the first time. Independent of any quiz. */
export function markRead(passageId:string,now=new Date(),store:Store|null=local()):{first:boolean}{
  const m=marks(store),at=now.toISOString(),had=m[passageId];
  m[passageId]=had?{first:had.first,last:at}:{first:at,last:at};
  // Bounded: the oldest marks go first (a mark is a convenience, not learning data).
  const kept=Object.entries(m).sort((a,b)=>b[1].last.localeCompare(a[1].last)).slice(0,DONE_MAX);
  write(DONE,Object.fromEntries(kept),store);
  return {first:!had};
}
/** Unique texts finished on this device. */
export const readCount=(store:Store|null=local())=>Object.keys(marks(store)).length;
