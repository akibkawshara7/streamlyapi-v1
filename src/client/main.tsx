import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import Player from './Player';

const isStreamRoute = window.location.pathname.startsWith('/stream');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isStreamRoute ? <Player /> : <App />}
  </StrictMode>
);
