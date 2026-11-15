// Issues #19/#20 — the voice is chosen by the card/deck language from the device's own voices; never another language,
// never a network voice (local-first), never a novelty voice; stable choice; owner-rejected «Ximena» is a last resort.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pickVoice,rankVoices,RATE} from '../src/voice.ts';

const v=(name,lang,extra={})=>({name,lang,localService:true,default:false,voiceURI:name,...extra});
// Roughly what an iPhone + a desktop browser expose.
const DEVICE=[
  v('Samantha','en-US',{default:true}),v('Daniel','en-GB'),v('Ava (Premium)','en-US'),v('Zarvox','en-US'),v('Bad News','en-US'),
  v('Mónica','es-ES'),v('Paulina','es-MX'),v('Microsoft Ximena Online (Natural)','es-ES',{localService:false}),v('Ximena','es-ES'),
  v('Google español','es-ES',{localService:false}),v('Maged','ar-SA'),v('Thomas','fr-FR'),v('Kyoko','ja_JP'),
];

test('hola in an es-ES deck → a Spanish (Spain) voice; hello in an en-US deck → English; interface language is irrelevant',()=>{
  assert.equal(pickVoice(DEVICE,'es-ES').name,'Mónica');
  assert.equal(pickVoice(DEVICE,'en-US').name,'Ava (Premium)','quality hint wins among exact-region voices');
  assert.equal(pickVoice(DEVICE,'en-GB').name,'Daniel','exact region first');
  assert.equal(pickVoice(DEVICE,'ar-SA').name,'Maged');
  assert.equal(pickVoice(DEVICE,'ja-JP').name,'Kyoko','underscore tags from some engines match');
});

test('region fallback stays in the same language; no voice for the language → null (never another language)',()=>{
  assert.equal(pickVoice(DEVICE,'es-AR').lang.split('-')[0],'es');
  assert.equal(pickVoice(DEVICE,'fr-CA').name,'Thomas');
  assert.equal(pickVoice(DEVICE,'de-DE'),null);
  assert.equal(pickVoice([],'en-US'),null);
});

test('local-first: network voices are never used, even if they are the only ones for the language',()=>{
  assert.ok(rankVoices(DEVICE,'es-ES').every(x=>x.localService));
  assert.equal(pickVoice([v('Google Deutsch','de-DE',{localService:false})],'de-DE'),null);
});

test('novelty voices are never used; the rejected Ximena only when nothing else exists',()=>{
  assert.ok(!rankVoices(DEVICE,'en-US').some(x=>/Zarvox|Bad News/.test(x.name)));
  const es=rankVoices(DEVICE,'es-ES').map(x=>x.name);
  assert.equal(es.at(-1),'Ximena','last resort');
  assert.equal(pickVoice([v('Ximena','es-ES')],'es-ES').name,'Ximena');
});

test('the choice is stable whatever order the device lists voices in',()=>{
  const shuffled=[...DEVICE].reverse();
  for(const tag of ['en-US','es-ES','es-MX','en-GB'])assert.equal(pickVoice(shuffled,tag).voiceURI,pickVoice(DEVICE,tag).voiceURI,tag);
});

test('the slower replay is clearly slower but not a drawl',()=>{
  assert.ok(RATE.slow<RATE.normal&&RATE.slow>=.55&&RATE.normal<=1);
});
