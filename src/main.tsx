
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { registerCoreActions } from './lib/actions/core-handlers'
import { registerAnalysisActions } from './lib/actions/analysis-actions'
import { registerGlobalValidationActions } from './lib/actions/validation-actions'
import { registerFieldSuggestionActions } from './lib/actions/field-suggestion-actions'
import { initializeSchemas } from './lib/schemas/init'

// Initialize the central action registry for core NSV updates and orchestration
registerCoreActions();
registerAnalysisActions();
registerGlobalValidationActions();
registerFieldSuggestionActions();

// Initialize schema registry with all module schemas
initializeSchemas();

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
