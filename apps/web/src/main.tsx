import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { StandaloneApp } from './app/StandaloneApp';

const root = document.getElementById('root');
if (!root) throw new Error('No se encontró el elemento #root');

createRoot(root).render(
  <StrictMode>
    <StandaloneApp />
  </StrictMode>,
);
