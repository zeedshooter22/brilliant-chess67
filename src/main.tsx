import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('لم يُعثر على عنصر الجذر');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
