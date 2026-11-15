/**
 * #19/#20 — WordLoop picks the voice, the learner just listens.
 * The language comes from the card/deck (never the interface locale). Among the device's voices we rank:
 *   1. same language, and the exact region first (es-ES before es-MX for an es-ES deck);
 *   2. quality hints in the voice name (Premium > Enhanced/Neural/Natural; Compact last);
 *   3. stable tie-break by name, so the same card always sounds the same.
 * Local-first: voices that are not on the device (`localService === false`, e.g. network voices that send the text to a
 * cloud service) are never used. Novelty/effect voices are never used. No voice for the language → we say so, we don't
 * read it in another language.
 */
export type VoiceLike={name:string;lang:string;localService:boolean;default:boolean;voiceURI:string};

/** macOS/iOS effect and character voices: fine for fun, wrong for learning pronunciation. */
const NOVELTY=/\b(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Deranged|Good News|Hysterical|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Fred|Junior|Kathy|Ralph|Grandma|Grandpa|Eddy|Flo|Reed|Rocko|Sandy|Shelley)\b/i;
/** Owner listening review, 14 Nov 2026: «Ximena» was rejected (fast, unbalanced). Kept usable only as a last resort. */
const REJECTED=/\bXimena\b/i;

export const normTag=(tag:string)=>tag.trim().replace(/_/g,'-').toLowerCase();
const baseOf=(tag:string)=>normTag(tag).split('-')[0];

export function voiceScore(v:VoiceLike,tag:string):number{
  let s=0;
  if(normTag(v.lang)===normTag(tag))s+=100;
  if(/premium/i.test(v.name))s+=30;else if(/enhanced|neural|natural/i.test(v.name))s+=20;
  if(/compact/i.test(v.name))s-=10;
  if(REJECTED.test(v.name))s-=200; // below every other voice of the language, even other regions
  if(v.default)s+=3;
  return s;
}

/** Usable voices for a language, best first. Empty = no suitable voice on this device. */
export function rankVoices<V extends VoiceLike>(voices:readonly V[],tag:string):V[]{
  const base=baseOf(tag);
  return voices
    .filter(v=>v.localService!==false&&baseOf(v.lang)===base&&!NOVELTY.test(v.name))
    .map(v=>({v,s:voiceScore(v,tag)}))
    .sort((a,b)=>b.s-a.s||a.v.name.localeCompare(b.v.name)||a.v.voiceURI.localeCompare(b.v.voiceURI))
    .map(x=>x.v);
}
export const pickVoice=<V extends VoiceLike>(voices:readonly V[],tag:string):V|null=>rankVoices(voices,tag)[0]??null;

/** Calm, unhurried normal speed and a clearly slower replay (#20). Speed alone is not the quality fix: the voice choice is. */
export const RATE={normal:.9,slow:.62} as const;
