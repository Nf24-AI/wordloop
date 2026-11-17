/**
 * #28 Bulk Add — turns pasted lines into an editable preview. Pure and local: no AI, no network.
 *
 * Only predefined, unambiguous patterns are recognised, one card per line:
 *   term <TAB> meaning [<TAB> example]                 (copied from a spreadsheet)
 *   term — meaning   ·   term – meaning   ·   term - meaning   (a dash with spaces; em/en dash also without spaces)
 *   term = meaning
 *   term,meaning[,example]                             (CSV, quotes allowed — only when every line has a comma)
 * Several meanings of ONE card are separated by `;`, `؛` or `|` inside the meaning part: `bank — بنك; ضفة`.
 * A line that matches none of these is never guessed at: it is shown as «needs a fix» with the whole line in the term
 * box, for the learner to correct or leave out. Duplicates are flagged against the library (same rule as a single
 * add) and within the paste. Every row gets its card id here, so saving the same preview twice can never create
 * two copies (see `addWords`).
 */
import {inferContentType,MAX_MEANINGS,MEANING_LIMIT,normalizeTerm,TERM_LIMIT,type Word} from './data.ts';

export const BULK_MAX_LINES=500,BULK_EXAMPLE_LIMIT=500;
export type BulkProblem='noSplit'|'noTerm'|'noMeaning'|'tooLong'|'tooManyMeanings';
export type BulkStatus='ok'|'error'|'dupDeck'|'dupLibrary'|'dupPaste';
export type BulkRow={id:string;line:number;source:string;term:string;meanings:string[];example:string;include:boolean;status:BulkStatus;problem?:BulkProblem};
export type BulkParse={rows:BulkRow[];truncated:boolean;skippedHeader:boolean};

const HEADER_TERMS=new Set(['term','word','front','phrase','الكلمة','المحتوى','الكلمة أو العبارة']);
const HEADER_MEANINGS=new Set(['meaning','meanings','back','translation','definition','المعنى','المعاني','الترجمة']);
const MEANING_SPLIT=/\s*[;؛|]\s*/;

/** One CSV record (no line breaks inside): `a,"b, c",d` → [a, "b, c", d]. Doubled quotes are a literal quote. */
export function csvFields(line:string):string[]{
  const out:string[]=[];let cur='',quoted=false;
  for(let i=0;i<line.length;i++){
    const c=line[i];
    if(quoted){if(c==='"'&&line[i+1]==='"'){cur+='"';i++;}else if(c==='"')quoted=false;else cur+=c;}
    else if(c==='"'&&!cur.trim())quoted=true;
    else if(c===','){out.push(cur);cur='';}
    else cur+=c;
  }
  out.push(cur);return out.map(f=>f.trim());
}
/** The fields of one line, or null when it matches no known pattern. */
function splitLine(line:string,csv:boolean):string[]|null{
  if(line.includes('\t'))return line.split('\t').map(f=>f.trim());
  let m=/^(.+?)\s*[—–]\s*(.+)$/.exec(line);if(m)return [m[1],m[2]];
  m=/^(.+?)\s+-\s+(.+)$/.exec(line);if(m)return [m[1],m[2]];
  m=/^(.+?)\s+=\s+(.+)$/.exec(line);if(m)return [m[1],m[2]];
  if(csv&&line.includes(','))return csvFields(line);
  return null;
}
export function splitMeanings(text:string):string[]{
  const out:string[]=[];
  for(const m of text.split(MEANING_SPLIT)){const t=m.trim();if(t&&!out.some(x=>x.toLocaleLowerCase()===t.toLocaleLowerCase()))out.push(t);}
  return out;
}
const newId=()=>crypto.randomUUID();

/** Parses pasted text into preview rows (statuses still need `checkRows`). Empty lines are ignored. */
export function parseBulk(text:string):BulkParse{
  const lines=text.replace(/\r\n?/g,'\n').split('\n').map((l,i)=>({l:l.replace(/ /g,' ').trim(),i:i+1})).filter(x=>x.l);
  const truncated=lines.length>BULK_MAX_LINES,kept=lines.slice(0,BULK_MAX_LINES);
  // CSV only when the whole paste looks like CSV, so a sentence with a comma is never cut in two by accident.
  const csv=kept.length>0&&kept.every(x=>x.l.includes(',')||x.l.includes('\t'));
  let skippedHeader=false;
  const rows:BulkRow[]=[];
  kept.forEach(({l,i},k)=>{
    const f=splitLine(l,csv);
    if(k===0&&f&&f.length>=2&&HEADER_TERMS.has(f[0].toLocaleLowerCase())&&HEADER_MEANINGS.has(f[1].toLocaleLowerCase())){skippedHeader=true;return;}
    if(!f||f.length<2)rows.push({id:newId(),line:i,source:l,term:l.replace(/\s+/g,' '),meanings:[],example:'',include:true,status:'error',problem:'noSplit'});
    else rows.push({id:newId(),line:i,source:l,term:f[0].replace(/\s+/g,' '),meanings:splitMeanings(f[1]),example:(f[2]??'').trim(),include:true,status:'ok'});
  });
  return {rows,truncated,skippedHeader};
}

/** Problem of one row's own fields (no duplicate check), or undefined when it can be saved. */
export function rowProblem(r:Pick<BulkRow,'term'|'meanings'|'example'|'problem'>):BulkProblem|undefined{
  const term=r.term.trim();
  if(!term)return 'noTerm';
  if(!r.meanings.some(m=>m.trim()))return r.problem==='noSplit'?'noSplit':'noMeaning';
  if(r.meanings.filter(m=>m.trim()).length>MAX_MEANINGS)return 'tooManyMeanings';
  if(term.length>TERM_LIMIT[inferContentType(term)]||r.meanings.some(m=>m.trim().length>MEANING_LIMIT)||r.example.length>BULK_EXAMPLE_LIMIT)return 'tooLong';
  return undefined;
}
/**
 * Recomputes every row's status: field problems first, then duplicates against the library (active cards of the same
 * inferred kind, as `addWord` checks) and within the paste (the first included copy wins). Duplicates are left out by
 * default; the learner can fix the text to bring a row back.
 */
export function checkRows<T extends BulkRow>(rows:readonly T[],words:readonly Word[],deckId:string):T[]{
  const library=new Map<string,Word>();
  for(const w of words)if(!w.archived&&w.contentType!=='question_answer')library.set(w.contentType+'\u0000'+normalizeTerm(w.term),w);
  const seen=new Set<string>();
  return rows.map(r=>{
    const problem=rowProblem(r);
    if(problem)return {...r,status:'error' as const,problem};
    const key=inferContentType(r.term)+'\u0000'+normalizeTerm(r.term),hit=library.get(key);
    const base={...r,problem:undefined};
    if(hit)return {...base,status:hit.deckId===deckId?'dupDeck' as const:'dupLibrary' as const,include:false};
    if(r.include&&seen.has(key))return {...base,status:'dupPaste' as const,include:false};
    if(r.include)seen.add(key);
    return {...base,status:'ok' as const};
  });
}
export function bulkCounts(rows:readonly BulkRow[]){
  return {
    ready:rows.filter(r=>r.status==='ok'&&r.include).length,
    errors:rows.filter(r=>r.status==='error').length,
    duplicates:rows.filter(r=>r.status==='dupDeck'||r.status==='dupLibrary'||r.status==='dupPaste').length,
    left:rows.filter(r=>r.status==='ok'&&!r.include).length,
  };
}
