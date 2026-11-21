/**
 * #77 — the bundled phrase list behind the reader's green «suggested expression» highlights.
 *
 * This is a small, fixed, hand-written list that ships with the app: common connectors and everyday time/manner
 * expressions with one plain dictionary meaning each. It is the ONLY source of green highlights.
 *  - Nothing here is generated at runtime, and no AI or network is involved.
 *  - No CEFR level or difficulty is claimed for any entry.
 *  - Only expressions with a single, context-independent everyday meaning are listed. Words whose meaning depends on
 *    the sentence (since, while, as, still, yet, just, even, así, pues, ya, luego…) are deliberately left out.
 *  - A meaning is offered only in a language we wrote it in (Arabic; English for Spanish entries). Other meaning
 *    languages get no suggestions at all rather than a guessed translation.
 * To change the list: edit it here and keep tests/reader.test.mjs (READER-PB-*) green.
 */
export type PhraseEntry={term:string;ar:string;en?:string};

const EN:PhraseEntry[]=[
  {term:'although',ar:'مع أنّ'},{term:'even though',ar:'مع أنّ، رغم أنّ'},{term:'however',ar:'لكن، ومع ذلك'},
  {term:'therefore',ar:'لذلك'},{term:'consequently',ar:'نتيجةً لذلك'},{term:'as a result',ar:'نتيجةً لذلك'},
  {term:'moreover',ar:'علاوةً على ذلك'},{term:'furthermore',ar:'علاوةً على ذلك'},{term:'in addition',ar:'بالإضافة إلى ذلك'},
  {term:'nevertheless',ar:'ومع ذلك'},{term:'meanwhile',ar:'في هذه الأثناء'},{term:'otherwise',ar:'وإلّا'},
  {term:'instead of',ar:'بدلًا من'},{term:'in fact',ar:'في الواقع'},{term:'for example',ar:'مثلًا'},
  {term:'as soon as',ar:'حالما، أول ما'},{term:'in order to',ar:'لكي، من أجل أن'},{term:'on the other hand',ar:'من ناحية أخرى'},
  {term:'at least',ar:'على الأقل'},{term:'of course',ar:'بالطبع'},{term:'by the way',ar:'بالمناسبة'},
  {term:'in spite of',ar:'على الرغم من'},{term:'despite',ar:'على الرغم من'},{term:'unless',ar:'إلّا إذا'},
  {term:'whereas',ar:'في حين أنّ'},{term:'suddenly',ar:'فجأة'},{term:'eventually',ar:'في النهاية'},
  {term:'immediately',ar:'فورًا'},{term:'especially',ar:'خصوصًا'},{term:'usually',ar:'عادةً'},
  {term:'sometimes',ar:'أحيانًا'},{term:'perhaps',ar:'ربما'},{term:'together',ar:'معًا'},
  {term:'slowly',ar:'ببطء'},{term:'every day',ar:'كل يوم'},{term:'every morning',ar:'كل صباح'},
  {term:'in the morning',ar:'في الصباح'},{term:'in the evening',ar:'في المساء'},{term:'at night',ar:'في الليل'},
];

const ES:PhraseEntry[]=[
  {term:'sin embargo',ar:'ومع ذلك',en:'however'},{term:'aunque',ar:'مع أنّ',en:'although'},
  {term:'por eso',ar:'لذلك',en:'that is why'},{term:'por lo tanto',ar:'لذلك',en:'therefore'},
  {term:'además',ar:'بالإضافة إلى ذلك',en:'besides, in addition'},{term:'por ejemplo',ar:'مثلًا',en:'for example'},
  {term:'de repente',ar:'فجأة',en:'suddenly'},{term:'a veces',ar:'أحيانًا',en:'sometimes'},
  {term:'por fin',ar:'أخيرًا',en:'at last'},{term:'en cambio',ar:'في المقابل',en:'on the other hand'},
  {term:'es decir',ar:'أي، بمعنى آخر',en:'that is to say'},{term:'por supuesto',ar:'بالطبع',en:'of course'},
  {term:'al menos',ar:'على الأقل',en:'at least'},{term:'mientras tanto',ar:'في هذه الأثناء',en:'meanwhile'},
  {term:'a pesar de',ar:'على الرغم من',en:'in spite of'},{term:'de hecho',ar:'في الواقع',en:'in fact'},
  {term:'tal vez',ar:'ربما',en:'maybe'},{term:'quizás',ar:'ربما',en:'perhaps'},
  {term:'en seguida',ar:'حالًا',en:'right away'},{term:'sobre todo',ar:'خصوصًا',en:'above all'},
  {term:'a menudo',ar:'كثيرًا، في أحيان كثيرة',en:'often'},{term:'de nuevo',ar:'من جديد',en:'again'},
  {term:'otra vez',ar:'مرة أخرى',en:'again'},{term:'casi',ar:'تقريبًا',en:'almost'},
  {term:'despacio',ar:'ببطء',en:'slowly'},{term:'cada día',ar:'كل يوم',en:'every day'},
  {term:'cada mañana',ar:'كل صباح',en:'every morning'},{term:'por la mañana',ar:'في الصباح',en:'in the morning'},
  {term:'por la tarde',ar:'بعد الظهر، في المساء',en:'in the afternoon'},{term:'por la noche',ar:'في الليل',en:'at night'},
];

export const PHRASEBOOK:Record<string,readonly PhraseEntry[]>={en:EN,es:ES};
