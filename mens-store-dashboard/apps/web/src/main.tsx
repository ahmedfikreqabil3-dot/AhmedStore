import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { StoreApp } from './StoreApp.js';
import './styles/store.css';
import './styles/live.css';
import './styles/readability.css';
import './styles/catalogue.css';
import './styles/operations.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreApp />
  </StrictMode>
);
