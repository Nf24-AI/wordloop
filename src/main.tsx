import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import './style.css';
import {startUpdates} from './update';
startUpdates(); // #41: registers /sw.js and watches for new versions
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
