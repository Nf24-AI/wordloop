import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import AccessBlocked from './AccessBlocked';
import './style.css';
import {startUpdates} from './update';
import {checkAccess} from './access';
startUpdates(); // #41: registers /sw.js and watches for new versions
const root=createRoot(document.getElementById('root')!);
// #70: on a PIN-protected Staging the words in this browser must belong to the tester who is signed in.
void checkAccess().catch(()=>'ok' as const).then(result=>{
  if(result==='signin'){location.replace('/login?next='+encodeURIComponent(location.pathname+location.hash));return;}
  root.render(<React.StrictMode>{result==='mismatch'?<AccessBlocked/>:<App/>}</React.StrictMode>);
});
