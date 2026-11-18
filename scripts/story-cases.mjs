// #64 — the 20 evaluation cases (EN + ES, A1–C1, story + conversation, 1–12 words, multi-word terms, accents).
const W=(s)=>s.split('|').map(x=>{const [term,meaning]=x.split('=');return {term,meaning};});
/** 20 cases: EN + ES, A1–C1, story + conversation, 1–12 words, multi-word terms, accents, Arabic meanings. */
export const CASES=[
  ['en-US','A1','story','cat=قطة|milk=حليب|happy=سعيد'],
  ['en-US','A1','conversation','hello=مرحبا|coffee=قهوة|thank you=شكرًا|tomorrow=بكرة'],
  ['en-US','A2','story','wake up=يستيقظ|breakfast=فطور|bus=حافلة|umbrella=مظلة|late=متأخر'],
  ['en-US','A2','conversation','doctor=طبيب|headache=صداع|medicine=دواء|rest=يرتاح|appointment=موعد|fever=حرارة'],
  ['en-US','B1','story','neighbour=جار|borrow=يستعير|ladder=سلم|garden=حديقة|apologise=يعتذر|noise=إزعاج|fence=سور|repair=يصلح'],
  ['en-US','B1','conversation','interview=مقابلة|experience=خبرة|salary=راتب|nervous=متوتر|deadline=موعد نهائي|team=فريق'],
  ['en-US','B2','story','reluctant=متردد|negotiate=يفاوض|landlord=مالك العقار|lease=عقد إيجار|deposit=تأمين|leak=تسريب|compromise=حل وسط|tenant=مستأجر|inspect=يفحص|grateful=ممتن'],
  ['en-US','C1','story','meticulous=دقيق جدًا|ambiguous=غامض|scrutinise=يدقق|unprecedented=غير مسبوق|resilient=صامد|nuance=فرق دقيق|candid=صريح|undermine=يقوّض|elaborate=مفصّل|reconcile=يوفّق|whereas=بينما|thereby=وبذلك'],
  ['en-US','A2','story','supermarket=سوبرماركت'],
  ['en-US','B1','story','take off=يقلع|look forward to=يتطلع إلى|run out of=ينفد|get along with=يتفاهم مع'],
  ['es-ES','A1','story','gato=قطة|casa=بيت|agua=ماء'],
  ['es-ES','A1','conversation','hola=مرحبا|café=قهوة|gracias=شكرًا|mañana=بكرة'],
  ['es-ES','A2','story','mercado=سوق|manzana=تفاحة|barato=رخيص|abuela=جدة|comprar=يشتري'],
  ['es-ES','A2','conversation','médico=طبيب|dolor=ألم|cabeza=رأس|pastilla=حبة دواء|descansar=يرتاح'],
  ['es-ES','B1','story','vecino=جار|prestar=يعير|escalera=سلم|jardín=حديقة|ruido=إزعاج|arreglar=يصلح|pedir perdón=يعتذر'],
  ['es-ES','B1','conversation','entrevista=مقابلة|experiencia=خبرة|sueldo=راتب|nervioso=متوتر|equipo=فريق|plazo=مهلة'],
  ['es-ES','B2','story','alquiler=إيجار|fianza=تأمين|gotera=تسريب|inquilino=مستأجر|negociar=يفاوض|propietario=مالك|acuerdo=اتفاق|reacio=متردد'],
  ['es-ES','C1','story','minucioso=دقيق جدًا|ambiguo=غامض|sin precedentes=غير مسبوق|matiz=فرق دقيق|franco=صريح|socavar=يقوّض|conciliar=يوفّق|no obstante=مع ذلك'],
  ['es-ES','A2','story','año=سنة|niño=طفل|español=إسباني|corazón=قلب|también=أيضًا|está=يكون'],
  ['es-ES','B1','story','echar de menos=يشتاق|darse cuenta=ينتبه|ponerse de acuerdo=يتفقون|tener ganas de=يرغب في'],
].map(([contentLanguage,level,genre,words],i)=>({id:i+1,request:{v:1,contentLanguage,meaningLanguage:'ar-SA',level,genre,words:W(words)}}));

