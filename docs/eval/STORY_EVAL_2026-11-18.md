# Story evaluation 2026-11-18 · @cf/google/gemma-4-26b-a4b-it · prompt story-v1

- Automatic gate: **20/20 PASS** (2 after one repair).
- Word coverage in passing stories: 111/115.
- Latency per case: median 14532 ms, max 30104 ms.
- **Neurons used ≈ 470** (budget 2060; all from the usage the model reported).
- The token was verified active with an expiry; only Workers AI was called. Nothing in Staging, Production, D1 or bindings was touched.

| # | lang | CEFR | type | result | calls | ms | neurons | tokens (in→out) | words used | missing | length (band) | issues |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | en-US | A1 | story | PASS | 1 | 6513 | 13 | 421→322 | 3/3 | — | 51 (60–130) | — |
| 2 | en-US | A1 | conversation | PASS | 1 | 12202 | 16 | 449→416 | 4/4 | — | 56 (60–130) | — |
| 3 | en-US | A2 | story | PASS | 1 | 9839 | 18 | 443→488 | 5/5 | — | 101 (90–170) | — |
| 4 | en-US | A2 | conversation | PASS | 1 | 12983 | 20 | 465→554 | 6/6 | — | 102 (90–170) | — |
| 5 | en-US | B1 | story | PASS | 1 | 16813 | 24 | 468→700 | 8/8 | — | 162 (130–230) | — |
| 6 | en-US | B1 | conversation | PASS | 2 | 30104 | 52 | 468→672 + 1189→661 | 6/6 | — | 148 (130–230) | — |
| 7 | en-US | B2 | story | PASS | 1 | 16990 | 26 | 501→782 | 10/10 | — | 175 (170–300) | — |
| 8 | en-US | C1 | story | PASS | 1 | 16446 | 31 | 527→940 | 12/12 | — | 213 (200–360) | — |
| 9 | en-US | A2 | story | PASS | 1 | 10884 | 17 | 404→477 | 1/1 | — | 96 (90–170) | — |
| 10 | en-US | B1 | story | PASS | 1 | 15047 | 24 | 440→698 | 3/4 | look forward to | 161 (130–230) | — |
| 11 | es-ES | A1 | story | PASS | 1 | 4231 | 14 | 421→349 | 3/3 | — | 61 (60–130) | — |
| 12 | es-ES | A1 | conversation | PASS | 2 | 22251 | 36 | 451→416 + 917→418 | 4/4 | — | 58 (60–130) | — |
| 13 | es-ES | A2 | story | PASS | 1 | 8511 | 16 | 443→436 | 4/5 | barato | 72 (90–170) | — |
| 14 | es-ES | A2 | conversation | PASS | 1 | 11811 | 17 | 464→522 | 5/5 | — | 87 (90–170) | — |
| 15 | es-ES | B1 | story | PASS | 1 | 6192 | 24 | 466→689 | 6/7 | prestar | 151 (130–230) | — |
| 16 | es-ES | B1 | conversation | PASS | 1 | 14532 | 23 | 470→671 | 6/6 | — | 135 (130–230) | — |
| 17 | es-ES | B2 | story | PASS | 1 | 17581 | 28 | 486→841 | 8/8 | — | 181 (170–300) | — |
| 18 | es-ES | C1 | story | PASS | 1 | 19642 | 30 | 481→921 | 8/8 | — | 220 (200–360) | — |
| 19 | es-ES | A2 | story | PASS | 1 | 7378 | 17 | 453→459 | 6/6 | — | 87 (90–170) | — |
| 20 | es-ES | B1 | story | PASS | 1 | 15339 | 24 | 441→710 | 3/4 | tener ganas de | 150 (130–230) | — |

## Stories

### #1 · en-US A1 story — The Small Cat

Tom is at home. He has a small cat. The cat is white and very cute. The cat is hungry now. Tom gives the cat some milk in a blue bowl. The cat drinks the milk. Now, the cat is happy. It sleeps on the soft sofa. Tom is happy too.

- Used: cat, milk, happy · Missing: —
- Q1: What color is the cat? → **white** — quote «The cat is white and very cute.» (in story, answer in quote)
- Q2: What does Tom give the cat? → **some milk** — quote «Tom gives the cat some milk in a blue bowl.» (in story, answer in quote)
- Q3: Where does the cat sleep? → **on the soft sofa** — quote «It sleeps on the soft sofa.» (in story, answer in quote)

### #2 · en-US A1 conversation — A Morning Meeting

Tom: Hello, Sara!
Sara: Hello, Tom! How are you?
Tom: I am good. Do you want some coffee?
Sara: Yes, please. I love coffee.
Tom: Here is your coffee.
Sara: Thank you, Tom.
Tom: You are welcome. Do you have time tomorrow?
Sara: Yes, I am free tomorrow morning.
Tom: Great. Let's meet at the cafe.

- Used: hello, coffee, thank you, tomorrow · Missing: —
- Q1: What does Tom offer to Sara? → **some coffee** — quote «Do you want some coffee?» (in story, answer in quote)
- Q2: What does Sara say to Tom after he gives her the drink? → **Thank you, Tom.** — quote «Thank you, Tom.» (in story, answer in quote)
- Q3: When is Sara free? → **tomorrow morning** — quote «Yes, I am free tomorrow morning.» (in story, answer in quote)

### #3 · en-US A2 story — A Busy Morning

Yesterday, Leo wanted to have a good day. He tried to wake up at seven o'clock, but he felt very tired. He stayed in bed for ten minutes. Then, he ran to the kitchen to eat a quick breakfast. He did not have much time. He looked outside and saw dark clouds. He grabbed his blue umbrella because he thought it might rain. Suddenly, he looked at the clock and realized he was late. He ran to the street to catch the bus. Luckily, the bus arrived just in time. He sat down and felt happy that his day started well.

- Used: wake up, breakfast, bus, umbrella, late · Missing: —
- Q1: What time did Leo try to wake up? → **seven o'clock** — quote «He tried to wake up at seven o'clock, but he felt very tired.» (in story, answer in quote)
- Q2: What color was the umbrella? → **blue** — quote «He grabbed his blue umbrella because he thought it might rain.» (in story, answer in quote)
- Q3: Why did Leo run to the street? → **to catch the bus** — quote «He ran to the street to catch the bus.» (in story, answer in quote)

### #4 · en-US A2 conversation — A Bad Day

Anna: Hi, Tom. You look very tired today. Why are you sad?
Tom: I feel terrible, Anna. I have a bad headache and a high fever.
Anna: Oh no! Did you see a doctor yesterday?
Tom: Yes, I had an appointment at ten o'clock in the morning.
Anna: What did the doctor say?
Tom: He said I need to stay in bed and rest for two days.
Anna: Did he give you any medicine?
Tom: Yes, I took some medicine after breakfast, but I still feel sick.
Anna: You should sleep more. I hope you feel better soon.
Tom: Thank you, Anna.

- Used: doctor, headache, medicine, rest, appointment, fever · Missing: —
- Q1: What does Tom have? → **a bad headache and a high fever** — quote «I have a bad headache and a high fever.» (in story, answer in quote)
- Q2: When was his appointment? → **at ten o'clock in the morning** — quote «Yes, I had an appointment at ten o'clock in the morning.» (in story, answer in quote)
- Q3: How long does Tom need to rest? → **for two days** — quote «He said I need to stay in bed and rest for two days.» (in story, answer in quote)

### #5 · en-US B1 story — The Broken Fence

Last Saturday, Leo decided to repair the old wooden fence in his garden. He wanted it to look beautiful for the summer party. However, while he was working, he accidentally hit a heavy tool against the wood, creating a loud noise. His neighbour, Mrs. Miller, came outside to see what happened.

Leo felt very embarrassed. He went to her and began to apologise for the sudden disturbance. He explained that he was trying to fix the garden boundary. Mrs. Miller was very kind and smiled at him. She told him not to worry about the sound.

Then, she offered to help him. She realized that Leo did not have a tall ladder to reach the top of the fence. She went into her garage and brought a sturdy one for him to borrow. Working together, they finished the job quickly. By the afternoon, the fence was strong again, and the garden looked perfect. Leo was happy to have such a helpful neighbour.

- Used: neighbour, borrow, ladder, garden, apologise, noise, fence, repair · Missing: —
- Q1: Why did Leo want to fix the fence? → **to look beautiful for the summer party** — quote «He wanted it to look beautiful for the summer party.» (in story, answer in quote)
- Q2: What did Leo do when he heard the loud noise? → **He went to her and began to apologise** — quote «He went to her and began to apologise for the sudden disturbance.» (in story, answer in quote)
- Q3: What did Mrs. Miller bring for Leo to use? → **a sturdy one** — quote «She went into her garage and brought a sturdy one for him to borrow.» (in story, answer in quote)

### #6 · en-US B1 conversation — The Big Job Interview

Sarah: Hi Mark, you look very pale today. Is everything okay?
Mark: Honestly, I am feeling quite nervous. I have a big job interview in one hour.
Sarah: Don't worry! You have plenty of experience in marketing, so you will do great.
Mark: I hope so. I really need this position because the deadline for my current project is approaching, and I want a fresh start.
Sarah: What kind of company is it?
Mark: It is a creative agency. They have a very talented team, and I want to work with them.
Sarah: That sounds wonderful. Did they mention anything about the salary?
Mark: They said they would discuss the salary during the second meeting. For now, I just need to focus on my presentation.
Sarah: You are ready. Just breathe deeply and be yourself.
Mark: Thanks, Sarah. I will call you as soon as it is finished.

- Used: interview, experience, salary, nervous, deadline, team · Missing: —
- Q1: How is Mark feeling? → **quite nervous** — quote «Honestly, I am feeling quite nervous.» (in story, answer in quote)
- Q2: What kind of people does the agency have? → **a very talented team** — quote «They have a very talented team, and I want to work with them.» (in story, answer in quote)
- Q3: When will the company discuss the salary? → **during the second meeting** — quote «They said they would discuss the salary during the second meeting.» (in story, answer in quote)

### #7 · en-US B2 story — The Apartment Dilemma

When Leo first saw the charming apartment downtown, he was ready to sign the lease immediately. However, he felt slightly reluctant when he noticed a small water stain on the ceiling. Before moving in, he decided to inspect the kitchen and bathroom more thoroughly. During his search, he discovered a hidden leak under the sink that could cause serious trouble later.

Leo called the landlord to discuss the issue. At first, the owner was hesitant to pay for repairs, but Leo knew he had to negotiate a fair solution. As a responsible tenant, Leo wanted everything to be perfect before he paid the large security deposit. They eventually reached a compromise: the landlord agreed to fix the plumbing immediately, and Leo promised to sign a longer contract.

After the repairs were finished, Leo felt much more comfortable. He was incredibly grateful that the owner took his concerns seriously. Moving into a new place can be stressful, but a little bit of communication goes a long way in ensuring a smooth start to a new chapter.

- Used: reluctant, negotiate, landlord, lease, deposit, leak, compromise, tenant, inspect, grateful · Missing: —
- Q1: Why did Leo feel hesitant about the apartment initially? → **he felt slightly reluctant when he noticed a small water stain on the ceiling** — quote «However, he felt slightly reluctant when he noticed a small water stain on the ceiling.» (in story, answer in quote)
- Q2: What did Leo find under the sink? → **a hidden leak** — quote «During his search, he discovered a hidden leak under the sink that could cause serious trouble later.» (in story, answer in quote)
- Q3: What was the final agreement between Leo and the owner? → **the landlord agreed to fix the plumbing immediately** — quote «the landlord agreed to fix the plumbing immediately, and Leo promised to sign a longer contract.» (in story, answer in quote)

### #8 · en-US C1 story — The Architect's Dilemma

Elias was known for his meticulous approach to urban design, a trait that earned him respect but also a reputation for being difficult. His latest project, a sustainable housing complex, faced an unprecedented challenge: the site sat atop unstable, shifting soil. To succeed, he had to reconcile the aesthetic beauty of the structures with the harsh technical realities of the terrain.

During the planning phase, the city council provided ambiguous guidelines regarding the height restrictions. This lack of clarity threatened to undermine his entire vision. Elias spent weeks attempting to scrutinise every blueprint, searching for a single nuance in the regulations that might grant him more flexibility. He refused to accept anything less than an elaborate, foolproof plan.

In a candid meeting with the lead engineer, Elias expressed his frustrations. He argued that while some developers might settle for superficial solutions, his goal was to create something truly resilient. He explained that the building must adapt to the ground's movement, thereby ensuring its longevity for decades to come. The engineer noted that Elias’s passion was intense, whereas most architects preferred a more passive approach. Eventually, through rigorous testing and constant adjustment, the design evolved into a masterpiece of engineering, proving that even the most complex obstacles could be overcome with precision and persistence.

- Used: meticulous, ambiguous, scrutinise, unprecedented, resilient, nuance, candid, undermine, elaborate, reconcile, whereas, thereby · Missing: —
- Q1: What was the unprecedented challenge facing Elias's project? → **the site sat atop unstable, shifting soil** — quote «His latest project, a sustainable housing complex, faced an unprecedented challenge: the site sat atop unstable, shifting soil.» (in story, answer in quote)
- Q2: Why did the city council's guidelines cause trouble? → **ambiguous guidelines regarding the height restrictions** — quote «During the planning phase, the city council provided ambiguous guidelines regarding the height restrictions.» (in story, answer in quote)
- Q3: How did Elias intend to ensure the building's longevity? → **the building must adapt to the ground's movement** — quote «He explained that the building must adapt to the ground's movement, thereby ensuring its longevity for decades to come.» (in story, answer in quote)

### #9 · en-US A2 story — A Busy Morning

Yesterday, Sarah woke up early. She looked in her kitchen, but there was no milk and no bread. She decided to go to the supermarket to buy some food. The weather was sunny and warm. When she arrived at the supermarket, the building was very big. She walked through the aisles and put apples, eggs, and pasta into her basket. She saw her friend, Tom, near the fruit section. They talked for five minutes about their weekend plans. Finally, Sarah paid for her groceries and walked home. She felt happy because her kitchen was full again.

- Used: supermarket · Missing: —
- Q1: Why did Sarah go to the supermarket? → **to buy some food** — quote «She decided to go to the supermarket to buy some food.» (in story, answer in quote)
- Q2: Who did Sarah see near the fruit section? → **her friend, Tom** — quote «She saw her friend, Tom, near the fruit section.» (in story, answer in quote)
- Q3: How did Sarah feel at the end of the story? → **She felt happy** — quote «She felt happy because her kitchen was full again.» (in story, answer in quote)

### #10 · en-US B1 story — A New Beginning in London

Last month, Sarah moved to London for a new job. At first, she felt quite nervous about living in a big city alone. However, she quickly realized that she could get along with her new neighbors, who were very friendly and helpful. She also started a new hobby by joining a local photography club. She really looks forward to her weekly meetings with the other members because they share great ideas.

One afternoon, Sarah decided to visit a famous museum. She packed her camera and left her apartment early. While she was walking to the station, she realized she had run out of bus credit on her card. Luckily, she found a small cafe nearby to buy some change. Later that evening, she sat by her window and watched the planes take off from the nearby airport. As the lights of the city began to shine, she felt happy and realized that her new life was off to a wonderful start.

- Used: take off, run out of, get along with · Missing: look forward to
- Q1: How did Sarah feel about living alone at first? → **quite nervous** — quote «At first, she felt quite nervous about living in a big city alone.» (in story, answer in quote)
- Q2: What happened to Sarah's bus credit? → **she had run out of bus credit** — quote «While she was walking to the station, she realized she had run out of bus credit on her card.» (in story, answer in quote)
- Q3: What did Sarah watch from her window in the evening? → **the planes take off** — quote «Later that evening, she sat by her window and watched the planes take off from the nearby airport.» (in story, answer in quote)

### #11 · es-ES A1 story — El gato de Ana

Ana tiene una casa pequeña y bonita. En la casa vive un gato gris. El gato es muy inteligente y tranquilo. El gato tiene mucha hambre ahora. Ana busca comida en la cocina. El gato también necesita agua fresca. Ana pone agua en un plato azul. El gato bebe el agua y está feliz. Ahora el gato duerme en el sofá.

- Used: gato, casa, agua · Missing: —
- Q1: ¿Cómo es la casa de Ana? → **pequeña y bonita** — quote «Ana tiene una casa pequeña y bonita.» (in story, answer in quote)
- Q2: ¿De qué color es el gato? → **gris** — quote «En la casa vive un gato gris.» (in story, answer in quote)
- Q3: ¿Dónde duerme el gato? → **en el sofá** — quote «Ahora el gato duerme en el sofá.» (in story, answer in quote)

### #12 · es-ES A1 conversation — En la cafetería

Juan: Hola, María.
María: Hola, Juan. ¿Cómo estás?
Juan: Estoy bien, gracias. ¿Quieres un café?
María: Sí, por favor. Me gusta mucho el café.
Juan: Muy bien. Yo tengo una cita mañana.
María: ¿A qué hora es tu cita?
Juan: La cita es a las diez de la mañana.
María: ¡Qué bien! Nos vemos luego.
Juan: Adiós, María.

- Used: hola, café, gracias, mañana · Missing: —
- Q1: ¿Cómo está Juan? → **bien** — quote «Juan: Estoy bien, gracias.» (in story, answer in quote)
- Q2: ¿Qué le gusta a María? → **el café** — quote «María: Sí, por favor. Me gusta mucho el café.» (in story, answer in quote)
- Q3: ¿A qué hora es la cita? → **a las diez de la mañana** — quote «La cita es a las diez de la mañana.» (in story, answer in quote)

### #13 · es-ES A2 story — Un día en el mercado

El sábado pasado, Lucía fue al mercado con su abuela. El lugar era muy grande y tenía mucha gente. Primero, ellas decidieron comprar frutas frescas. Lucía vio una manzana roja y muy bonita en una mesa. La fruta era muy barata y de buena calidad. Su abuela prefirió comprar verduras para la cena. Después de la compra, las dos mujeres caminaron al parque. Lucía estaba muy feliz porque el día fue perfecto.

- Used: mercado, manzana, abuela, comprar · Missing: barato
- Q1: ¿Con quién fue Lucía al mercado? → **con su abuela** — quote «El sábado pasado, Lucía fue al mercado con su abuela.» (in story, answer in quote)
- Q2: ¿Cómo era la manzana? → **roja y muy bonita** — quote «Lucía vio una manzana roja y muy bonita en una mesa.» (in story, answer in quote)
- Q3: ¿Qué prefirió comprar la abuela? → **verduras para la cena** — quote «Su abuela prefirió comprar verduras para la cena.» (in story, answer in quote)

### #14 · es-ES A2 conversation — Un mal día para Lucas

Lucas: Hola, Elena. ¿Cómo estás? No me siento muy bien.
Elena: Hola, Lucas. Te ves muy pálido. ¿Qué pasa?
Lucas: Tengo un dolor fuerte en la cabeza. No pude dormir anoche.
Elena: Lo siento mucho. ¿Fuiste al médico ayer?
Lucas: No, no fui. Solo tomé una pastilla, pero no funcionó.
Elena: Tal vez necesitas descansar un poco más. El trabajo es muy difícil esta semana.
Lucas: Tienes razón. Mañana voy a pedir un día libre.
Elena: Es una buena idea. Bebe mucha agua y quédate en casa.

- Used: médico, dolor, cabeza, pastilla, descansar · Missing: —
- Q1: ¿Qué tiene Lucas? → **un dolor fuerte en la cabeza** — quote «Tengo un dolor fuerte en la cabeza.» (in story, answer in quote)
- Q2: ¿Fue Lucas al médico ayer? → **No, no fui** — quote «No, no fui.» (in story, answer in quote)
- Q3: ¿Qué necesita Lucas según Elena? → **descansar un poco más** — quote «Tal vez necesitas descansar un poco más.» (in story, answer in quote)

### #15 · es-ES B1 story — Un pequeño problema con el vecino

El sábado por la mañana, Lucas quería descansar en su casa. Sin embargo, escuchó un ruido muy fuerte que venía del piso de arriba. Al principio, pensó que era la televisión, pero el sonido continuaba. Decidió subir la escalera para hablar con su vecino, el señor Martínez.

Cuando llegó a la puerta, vio que el señor Martínez intentaba arreglar una silla de madera en su jardín. El hombre parecía muy concentrado y no se daba cuenta del problema. Lucas llamó a la puerta con cuidado y explicó la situación con amabilidad. El señor Martínez se sintió muy mal por la molestia y decidió pedir perdón inmediatamente.

Para solucionar el malentendido, el señor Martínez le ofreció a Lucas un poco de té. Además, le dijo que podía prestarle su libro favorito si quería leer algo tranquilo. Al final, el problema se resolvió rápidamente y Lucas pudo disfrutar de su tarde en silencio.

- Used: vecino, escalera, jardín, ruido, arreglar, pedir perdón · Missing: prestar
- Q1: ¿Qué escuchó Lucas por la mañana? → **un ruido muy fuerte** — quote «Sin embargo, escuchó un ruido muy fuerte que venía del piso de arriba.» (in story, answer in quote)
- Q2: ¿Qué intentaba hacer el señor Martínez? → **arreglar una silla de madera** — quote «vio que el señor Martínez intentaba arreglar una silla de madera en su jardín.» (in story, answer in quote)
- Q3: ¿Qué le ofreció el señor Martínez a Lucas para solucionar el malentendido? → **un poco de té** — quote «Para solucionar el malentendido, el señor Martínez le ofreció a Lucas un poco de té.» (in story, answer in quote)

### #16 · es-ES B1 conversation — Una reunión importante

Laura: Hola, Diego. ¿Cómo estás? Te veo un poco nervioso hoy.
Diego: Hola, Laura. Sí, es que tengo una entrevista de trabajo en una hora.
Laura: ¡Qué buena noticia! ¿Es para la empresa de tecnología?
Diego: Exacto. El puesto requiere mucha experiencia en programación, pero creo que estoy preparado.
Laura: Estoy segura de que te irá bien. ¿Ya sabes cuánto será el sueldo?
Diego: No lo sé todavía, pero espero que sea justo. Lo más importante para mí es trabajar con un buen equipo.
Laura: Tienes razón. Trabajar con gente motivada ayuda mucho a crecer profesionalmente.
Diego: Además, me dijeron que el proyecto tiene un plazo muy corto para terminar, así que habrá mucho trabajo.
Laura: No te preocupes, tú puedes con todo. ¡Mucha suerte!
Diego: Gracias, Laura. Te llamaré cuando salga de la oficina.

- Used: entrevista, experiencia, sueldo, nervioso, equipo, plazo · Missing: —
- Q1: ¿Cómo se siente Diego hoy? → **un poco nervioso** — quote «Te veo un poco nervioso hoy.» (in story, answer in quote)
- Q2: ¿Qué necesita el puesto para la empresa de tecnología? → **mucha experiencia en programación** — quote «El puesto requiere mucha experiencia en programación, pero creo que estoy preparado.» (in story, answer in quote)
- Q3: ¿Cómo es el plazo del proyecto? → **un plazo muy corto** — quote «Además, me dijeron que el proyecto tiene un plazo muy corto para terminar, así que habrá mucho trabajo.» (in story, answer in quote)

### #17 · es-ES B2 story — Un nuevo comienzo en la ciudad

Después de meses buscando, Lucas finalmente encontró un apartamento que parecía ideal. El precio del alquiler era razonable para la zona, pero el propietario se mostraba un poco reacio a mostrar el piso antes de la visita oficial. A pesar de su desconfianza inicial, Lucas decidió seguir adelante.

Durante la inspección, mientras revisaba las paredes, notó una pequeña gotera en el techo del baño. Esto le preocupó bastante, así que decidió que era el momento perfecto para negociar las condiciones del contrato. Lucas llamó al dueño para explicarle la situación y sugerir una pequeña rebaja mensual a cambio de asumir él mismo la reparación.

Al principio, el hombre no quería ceder, pero tras una conversación tranquila, ambos llegaron a un acuerdo satisfactorio. El propietario aceptó reducir la cuota mensual y, a cambio, Lucas aceptó pagar una fianza ligeramente menor de lo habitual. Como buen inquilino, Lucas se aseguró de que todos los detalles quedaran por escrito para evitar malentendidos futuros. Al final, con las llaves en la mano, sintió que su nueva vida en la ciudad finalmente comenzaba con buen pie.

- Used: alquiler, fianza, gotera, inquilino, negociar, propietario, acuerdo, reacio · Missing: —
- Q1: ¿Qué problema encontró Lucas en el baño? → **una pequeña gotera** — quote «Durante la inspección, mientras revisaba las paredes, notó una pequeña gotera en el techo del baño.» (in story, answer in quote)
- Q2: ¿Cómo era el propietario al principio de la historia? → **reacio a mostrar el piso** — quote «El precio del alquiler era razonable para la zona, pero el propietario se mostraba un poco reacio a mostrar el piso antes de la visita oficial.» (in story, answer in quote)
- Q3: ¿Qué decidió hacer Lucas para evitar malentendidos? → **se aseguró de que todos los detalles quedaran por escrito** — quote «Como buen inquilino, Lucas se aseguró de que todos los detalles quedaran por escrito para evitar malentendidos futuros.» (in story, answer in quote)

### #18 · es-ES C1 story — El dilema del restaurador

Julián era un restaurador de arte conocido por su carácter minucioso y su paciencia infinita. Su último encargo era una pintura del siglo XVIII que presentaba un daño sin precedentes debido a la humedad excesiva en la galería. El cuadro era una obra maestra, pero el estado de los pigmentos era sumamente ambiguo; no era fácil determinar si el color original era un azul profundo o un gris ceniza.

Durante semanas, Julián trabajó bajo la luz de una lámpara especial, buscando cada matiz necesario para devolverle la vida a la tela. Sin embargo, se enfrentaba a un dilema ético. El cliente quería que el cuadro luciera como nuevo, pero Julián sabía que una intervención demasiado agresiva podría socavar la autenticidad de la pieza histórica. Debía encontrar la manera de conciliar la estética de la obra con la integridad de su pasado.

En una reunión con los expertos del museo, Julián se mostró muy franco sobre los riesgos de la restauración. Explicó que cualquier error en la mezcla de los materiales podría alterar la esencia del autor. No obstante, su honestidad fue valorada por el comité, que decidió confiar en su criterio profesional. Al final, la obra no solo recuperó su esplendor, sino que conservó la huella del tiempo, demostrando que la verdadera maestría reside en el respeto por la historia.

- Used: minucioso, ambiguo, sin precedentes, matiz, franco, socavar, conciliar, no obstante · Missing: —
- Q1: ¿Por qué el daño de la pintura era especial? → **debido a la humedad excesiva en la galería** — quote «Su último encargo era una pintura del siglo XVIII que presentaba un daño sin precedentes debido a la humedad excesiva en la galería.» (in story, answer in quote)
- Q2: ¿Qué temía Julián que ocurriera con la pieza histórica? → **podría socavar la autenticidad de la pieza histórica** — quote «Julián sabía que una intervención demasiado agresiva podría socavar la autenticidad de la pieza histórica.» (in story, answer in quote)
- Q3: ¿Cómo fue la actitud de Julián con los expertos? → **Julián se mostró muy franco sobre los riesgos de la restauración** — quote «En una reunión con los expertos del museo, Julián se mostró muy franco sobre los riesgos de la restauración.» (in story, answer in quote)

### #19 · es-ES A2 story — Un nuevo amigo

Lucas es un niño de diez años. Él vive en una ciudad muy grande. El año pasado, Lucas viajó a España para aprender un nuevo idioma. Ahora, él está en una escuela de idiomas. En su clase, hay un estudiante español llamado Mateo. Mateo es muy simpático y también es muy inteligente. Un día, Lucas y Mateo jugaron en el parque después de las clases. Lucas sintió mucha alegría en su corazón porque encontró un buen amigo. Ahora, ellos estudian juntos todos los días y practican mucho.

- Used: año, niño, español, corazón, también, está · Missing: —
- Q1: ¿Cuántos años tiene Lucas? → **diez años** — quote «Lucas es un niño de diez años.» (in story, answer in quote)
- Q2: ¿Cómo es Mateo? → **muy simpático y también es muy inteligente** — quote «Mateo es muy simpático y también es muy inteligente.» (in story, answer in quote)
- Q3: ¿Qué sintió Lucas en su corazón? → **mucha alegría** — quote «Lucas sintió mucha alegría en su corazón porque encontró un buen amigo.» (in story, answer in quote)

### #20 · es-ES B1 story — Un reencuentro inesperado

Lucas vivía en una ciudad muy grande y siempre estaba ocupado con su trabajo. Aunque tenía muchos amigos, a veces sentía que debía echar de menos su antiguo pueblo y la tranquilidad de la naturaleza. Un viernes por la tarde, después de una semana muy larga, decidió llamar a su mejor amigo, Mateo.

Primero, tuvieron que ponerse de acuerdo sobre la hora y el lugar para verse. Finalmente, decidieron ir a un pequeño café cerca del parque. Mientras caminaba hacia la cafetería, Lucas empezó a darse cuenta de lo mucho que necesitaba un descanso de la tecnología y el ruido constante.

Cuando llegó al café, vio a Mateo sonriendo desde una mesa al fondo. Lucas tenía muchas ganas de contarle todas sus aventuras y de hablar durante horas. Pasaron la tarde riendo y recordando viejos tiempos. Al final del día, Lucas se sintió mucho más feliz y relajado que antes.

- Used: echar de menos, darse cuenta, ponerse de acuerdo · Missing: tener ganas de
- Q1: ¿Qué sentía Lucas a veces? → **debía echar de menos su antiguo pueblo** — quote «Aunque tenía muchos amigos, a veces sentía que debía echar de menos su antiguo pueblo y la tranquilidad de la naturaleza.» (in story, answer in quote)
- Q2: ¿Qué decidió hacer Lucas mientras caminaba? → **empezó a darse cuenta de lo mucho que necesitaba un descanso** — quote «Mientras caminaba hacia la cafetería, Lucas empezó a darse cuenta de lo mucho que necesitaba un descanso de la tecnología y el ruido constante.» (in story, answer in quote)
- Q3: ¿Qué quería hacer Lucas al ver a Mateo? → **tenía muchas ganas de contarle todas sus aventuras** — quote «Lucas tenía muchas ganas de contarle todas sus aventuras y de hablar durante horas.» (in story, answer in quote)
