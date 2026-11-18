import {LogOut} from 'lucide-react';
import {storedLocale} from './i18n';
import {signOut} from './access';

/** #70: shown INSTEAD of the app when another tester's words are in this browser. Nothing is read, merged or deleted. */
const TEXT={
  ar:{title:'هذا المتصفح فيه كلمات مختبر آخر',body:'عشان ما تختلط البيانات، ما راح نفتح كلماته بحسابك ولا راح نحذفها. استخدم ملف تعريف متصفح منفصل أو جهازك الخاص، ثم سجّل الدخول برمزك من هناك.',out:'تسجيل الخروج'},
  en:{title:'This browser holds another tester’s words',body:'So data never mixes, we won’t open their words under your PIN, and we won’t delete them. Use a separate browser profile or your own device, then sign in there with your PIN.',out:'Sign out'},
} as const;
export default function AccessBlocked(){
  const l=storedLocale(),t=TEXT[l];
  return <main className="access-blocked" lang={l} dir={l==='ar'?'rtl':'ltr'}>
    <h1>{t.title}</h1><p>{t.body}</p>
    <button type="button" className="btn btn-ink btn-lg" onClick={()=>void signOut()}><LogOut size={18} aria-hidden="true"/>{t.out}</button>
  </main>;
}
