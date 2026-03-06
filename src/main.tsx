
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { registerCoreActions } from './lib/actions/core-handlers'

// Initialize the central action registry for core NSV updates and orchestration
registerCoreActions();

// Suppress THREE.Clock deprecation warning as it's internal to @react-three/fiber
const oriWarn = console.warn;
console.warn = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('THREE.Clock') && args[0].includes('deprecated')) return;
  oriWarn(...args);
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
