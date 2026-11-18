// #64 hand-written FIXTURES for validator and UI tests. They are NOT model output and are never shown as AI content.
export const EN_WORDS=[{term:'wake up',meaning:'يستيقظ'},{term:'breakfast',meaning:'فطور'},{term:'bus',meaning:'حافلة'},{term:'umbrella',meaning:'مظلة'},{term:'late',meaning:'متأخر'}];
export const EN_STORY={
  title:'A Busy Morning',
  story:'I wake up early in the morning. The sky is grey and it is cold. I make breakfast for my sister and me. We eat bread with cheese and drink hot tea. Then I look at the clock. It is already eight! I take my bag and my umbrella and I run to the bus stop. The bus is full, but the driver smiles and waits for me. I sit next to an old man with a newspaper. When I arrive at work, my friend Sam says hello. I am not late today, and I feel happy.',
  translation:'أستيقظ مبكرًا في الصباح...',
  usedWords:['wake up','breakfast','bus','umbrella','late'],
  questions:[
    {question:'What do they eat?',answer:'bread with cheese',quote:'We eat bread with cheese and drink hot tea.'},
    {question:'What does the driver do?',answer:'waits for me',quote:'The bus is full, but the driver smiles and waits for me.'},
    {question:'Who says hello at work?',answer:'my friend Sam',quote:'When I arrive at work, my friend Sam says hello.'},
  ],
};
export const ES_WORDS=[{term:'mercado',meaning:'سوق'},{term:'manzana',meaning:'تفاحة'},{term:'barato',meaning:'رخيص'},{term:'abuela',meaning:'جدة'}];
export const ES_STORY={
  title:'El sábado en el mercado',
  story:'Cada sábado, Lucía va al mercado con su abuela. El mercado está cerca de la plaza y siempre hay mucha gente. Su abuela compra pan, queso y una manzana roja para Lucía. Lucía pregunta por las fresas, pero hoy no son baratas. Entonces compran naranjas, porque son más dulces y el precio es bueno. Después, las dos se sientan en un banco y hablan con una vecina. La abuela cuenta historias de cuando era niña. Lucía escucha y come su manzana. Es un día tranquilo y feliz para la familia.',
  translation:'',
  usedWords:['mercado','manzana','abuela'],
  questions:[
    {question:'¿Con quién va Lucía al mercado?',answer:'con su abuela',quote:'Cada sábado, Lucía va al mercado con su abuela.'},
    {question:'¿Por qué compran naranjas?',answer:'son más dulces',quote:'Entonces compran naranjas, porque son más dulces y el precio es bueno.'},
    {question:'¿Qué cuenta la abuela?',answer:'historias de cuando era niña',quote:'La abuela cuenta historias de cuando era niña.'},
  ],
};
export const EN_STORY_2={
  title:'A Day at the Castle',
  story:'On Saturday, Mia visits an old castle with her class. The castle is on a green hill near the river. Inside, a guide shows them a big painting of a tiger. The tiger looks strong and a little scary. Then the guide opens a small room. On the table there is an old violin. A man plays the violin for the children, and the music is soft and sad. Mia closes her eyes and listens. After the visit, they eat sandwiches in the garden and talk about the tiger and the music.',
  translation:'',
  usedWords:['castle','tiger','violin'],
  questions:[
    {question:'Where is the castle?',answer:'on a green hill near the river',quote:'The castle is on a green hill near the river.'},
    {question:'What is on the table?',answer:'an old violin',quote:'On the table there is an old violin.'},
    {question:'What do they eat after the visit?',answer:'sandwiches',quote:'After the visit, they eat sandwiches in the garden and talk about the tiger and the music.'},
  ],
};
