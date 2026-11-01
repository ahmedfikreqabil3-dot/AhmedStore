import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DesignPreview } from './DesignPreview.js';
import './preview.css';
import '../src/styles/readability.css';
import '../src/styles/operations.css';
import './planned.css';

createRoot(document.getElementById('root')!).render(<StrictMode><DesignPreview /></StrictMode>);
