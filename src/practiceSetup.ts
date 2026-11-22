/**
 * Practice 2.0 — the shared configuration used by every skill: which learning language, where the words come from
 * (automatic · the whole library · hand-picked) and the CEFR level. Local only.
 *
 * A story is written in ONE language, so «the whole library» means every deck of the chosen learning language
 * (owner decision, 2026-11-19). Nothing here reads or writes FSRS state or reviews; `dueAt` is only READ (via
 * `defaultSelection`) to pick a sensible automatic subset.
 */
import type {Deck,Word} from './data';
import {defaultSelection,eligibleWords,keepEligible} from './practicePlan.ts';
import type {Cefr} from './story.ts';

export const VOCAB_SOURCES=['auto','all','manual'] as const;
export type VocabSource=typeof VOCAB_SOURCES[number];
export const isVocabSource=(v:unknown):v is VocabSource=>(VOCAB_SOURCES as readonly unknown[]).includes(v);

/** Language tags compare case-insensitively (en-US = en-us); the deck's own spelling is kept for display. */
export const langKey=(tag:string)=>tag.trim().toLowerCase();
export const decksOf=(decks:readonly Deck[],lang:string)=>decks.filter(d=>langKey(d.contentLanguage)===langKey(lang));

/** Every practisable word of these decks (not archived, not Q&A, with a meaning), de-duplicated by term across decks: the first deck wins. */
export function poolFor(words:readonly Word[],decks:readonly Deck[]):Word[]{
  const seen=new Set<string>(),out:Word[]=[];
  for(const d of decks)for(const w of eligibleWords(words,d.id)){
    const k=w.term.trim().normalize('NFC').toLocaleLowerCase();
    if(seen.has(k))continue;
    seen.add(k);out.push(w);
  }
  return out;
}

export type LangGroup={lang:string;decks:Deck[];words:number};
/** Learning languages of the library, the one with the most practisable words first (ties keep library order). */
export function languageGroups(words:readonly Word[],decks:readonly Deck[]):LangGroup[]{
  const m=new Map<string,{lang:string;decks:Deck[]}>();
  for(const d of decks){const k=langKey(d.contentLanguage),g=m.get(k);if(g)g.decks.push(d);else m.set(k,{lang:d.contentLanguage,decks:[d]});}
  return [...m.values()].map(g=>({...g,words:poolFor(words,g.decks).length})).sort((a,b)=>b.words-a.words);
}

/** The language to practise: the stored choice if it still exists, else the deck's, else the largest group. */
export function chooseLanguage(groups:readonly LangGroup[],stored:string|null,deck?:Pick<Deck,'contentLanguage'>|null):string|null{
  if(deck)return groups.find(g=>langKey(g.lang)===langKey(deck.contentLanguage))?.lang??deck.contentLanguage;
  if(stored){const g=groups.find(x=>langKey(x.lang)===langKey(stored));if(g)return g.lang;}
  return groups[0]?.lang??null;
}

/**
 * The words a session will use. `auto`: the level's batch, soonest due first. `all`: every word — never truncated; the
 * story plan splits it into batches. `manual`: the learner's own picks that are still eligible (never chosen → the
 * automatic subset, so the picker opens with something sensible ticked).
 */
export function selectionFor(source:VocabSource,pool:readonly Word[],level:Cefr,manual:readonly string[]|null):string[]{
  if(source==='all')return pool.map(w=>w.id);
  if(source==='manual'&&manual)return keepEligible(manual,pool);
  return defaultSelection(pool,level);
}

/** Where a story is saved: the deck that holds most of the chosen words (ties → library order). */
export function homeDeck(ids:readonly string[],pool:readonly Word[],decks:readonly Deck[]):string|null{
  if(!decks.length)return null;
  const chosen=new Set(ids),n=new Map<string,number>();
  for(const w of pool)if(chosen.has(w.id))n.set(w.deckId,(n.get(w.deckId)??0)+1);
  let best=decks[0].id,max=-1;
  for(const d of decks){const c=n.get(d.id)??0;if(c>max){best=d.id;max=c;}}
  return best;
}

/** The manual selection is kept per learning language (it can span several decks). */
export const selectionKey=(lang:string)=>'lang:'+langKey(lang);
