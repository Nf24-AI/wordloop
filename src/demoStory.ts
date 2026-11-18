/**
 * #64 Demo Mode — a LOCAL, fixed-template practice text so the whole Practice journey (selection, batches, Reading,
 * Listening, questions, results, next story) can be tried while AI generation is off. No network, no consent needed,
 * no quota. It is NOT AI output and is never presented as such: the saved title starts with DEMO_PREFIX and the story
 * screen shows a «demo» banner. The text is deliberately plain: one fixed frame + one sentence per selected word.
 * It passes the same `validateStory` gate as a real story (grounded quotes, coverage, language).
 */
import {baseLang,validateStory,type Story,type StoryRequest} from './story.ts';

/** Saved-title markers (both UI languages), so a demo text stays recognisable after a reload, backup or restore. */
export const DEMO_PREFIX={ar:'قصة تجريبية: ',en:'Demo story: '} as const;
export const isDemoTitle=(title:string)=>Object.values(DEMO_PREFIX).some(p=>title.startsWith(p));

type Frame={title:string;intro:string[];line:(i:number,w:string)=>string;outro:string[];questions:{question:string;answer:string;quote:string}[];
  tr:{intro:string;line:(i:number,w:string,m:string)=>string;outro:string}};
const FRAMES:Record<'en'|'es',Frame>={
  en:{
    title:'Lina’s notebook',
    intro:['This is a short demo story.','Lina has a small blue notebook.','Every morning she opens the notebook and reads her new words.'],
    line:(i,w)=>`On page ${i}, she reads the word ${w} and says it slowly.`,
    outro:['In the evening, Lina reads all the words again with her friend Omar.','They drink tea in the kitchen and laugh.','It is a good day for learning.'],
    questions:[
      {question:'What does Lina have?',answer:'a small blue notebook',quote:'Lina has a small blue notebook.'},
      {question:'When does she open the notebook?',answer:'Every morning',quote:'Every morning she opens the notebook and reads her new words.'},
      {question:'Who reads the words with Lina in the evening?',answer:'her friend Omar',quote:'In the evening, Lina reads all the words again with her friend Omar.'},
    ],
    tr:{intro:'هذي قصة تجريبية قصيرة. عند لينا دفتر أزرق صغير. كل صباح تفتح الدفتر وتقرأ كلماتها الجديدة.',
      line:(i,w,m)=>`في الصفحة ${i} تقرأ كلمة ${w} (${m}) وتنطقها على مهل.`,outro:'في المساء تقرأ لينا كل الكلمات مرة ثانية مع صديقها عمر. يشربون شاي في المطبخ ويضحكون. يوم حلو للتعلّم.'},
  },
  es:{
    title:'El cuaderno de Lucía',
    intro:['Esta es una historia corta de prueba.','Lucía tiene un cuaderno azul pequeño.','Cada mañana abre el cuaderno y lee sus palabras nuevas.'],
    line:(i,w)=>`En la página ${i}, lee la palabra ${w} y la repite despacio.`,
    outro:['Por la tarde, Lucía lee todas las palabras otra vez con su amigo Omar.','Toman té en la cocina y se ríen.','Es un buen día para aprender.'],
    questions:[
      {question:'¿Qué tiene Lucía?',answer:'un cuaderno azul pequeño',quote:'Lucía tiene un cuaderno azul pequeño.'},
      {question:'¿Cuándo abre el cuaderno?',answer:'Cada mañana',quote:'Cada mañana abre el cuaderno y lee sus palabras nuevas.'},
      {question:'¿Con quién lee las palabras por la tarde?',answer:'con su amigo Omar',quote:'Por la tarde, Lucía lee todas las palabras otra vez con su amigo Omar.'},
    ],
    tr:{intro:'هذي قصة تجريبية قصيرة. عند لوسيا دفتر أزرق صغير. كل صباح تفتح الدفتر وتقرأ كلماتها الجديدة.',
      line:(i,w,m)=>`في الصفحة ${i} تقرأ كلمة ${w} (${m}) وتعيدها على مهل.`,outro:'في المساء تقرأ لوسيا كل الكلمات مرة ثانية مع صديقها عمر. يشربون شاي في المطبخ ويضحكون. يوم حلو للتعلّم.'},
  },
};

/** Builds the demo text for a validated request. Returns null if it would not pass the story gate (never shown then). */
export function buildDemoStory(req:StoryRequest,locale:'ar'|'en'):{story:Story;used:string[];missing:string[]}|null{
  const lang=baseLang(req.contentLanguage);
  if(lang!=='en'&&lang!=='es')return null;
  const f=FRAMES[lang];
  const story=[f.intro.join(' '),req.words.map((w,i)=>f.line(i+1,w.term)).join(' '),f.outro.join(' ')].join('\n\n');
  const translation=baseLang(req.meaningLanguage)==='ar'?[f.tr.intro,req.words.map((w,i)=>f.tr.line(i+1,w.term,w.meaning)).join(' '),f.tr.outro].join('\n\n'):'';
  // Validated with the A2 length band: the frame is fixed, so the learner's chosen level does not change it.
  const v=validateStory({title:DEMO_PREFIX[locale]+f.title,story,translation,usedWords:req.words.map(w=>w.term),questions:f.questions},{...req,level:'A2'});
  return v.ok?{story:v.story,used:v.used,missing:v.missing}:null;
}
