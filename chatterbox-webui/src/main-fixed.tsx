import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Force the correct API URL
(window as any).VITE_API_URL = '/api';
console.log('[Main Fixed] Forcing API URL to /api');

// Override import.meta.env
const originalEnv = import.meta.env;
import.meta.env = new Proxy(originalEnv, {
  get(target, prop) {
    if (prop === 'VITE_API_URL') {
      return '/api';
    }
    return target[prop as keyof typeof target];
  }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)