
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { registerCoreActions } from './lib/actions/core-handlers'
import { registerAnalysisActions } from './lib/actions/analysis-actions'
import { registerGlobalValidationActions } from './lib/actions/validation-actions'
import { registerFieldSuggestionActions } from './lib/actions/field-suggestion-actions'
import { initializeSchemas } from './lib/schemas/init'

// Module-specific action registrations — imported here so handlers are available
// immediately, regardless of which page the user visits first (or Nexus delegates to).
import { registerAgnesActions } from './modules/agnes/services/actions'
import { registerAtlasActions } from './modules/atlas/services/actions'
import { registerAtlasFieldActions } from './modules/atlas/actions/atlas-field-actions'
import { registerLedgerActions } from './modules/ledger/services/actions'
import { registerLedgerFieldActions } from './modules/ledger/actions/ledger-field-actions'
import { registerTitanActions } from './modules/titan/services/actions'
import { registerScoutActions } from './modules/scout/services/actions'
import { registerForgeActions } from './modules/forge/services/actions'
import { registerSomaFieldActions } from './modules/soma/actions/soma-field-actions'

// Initialize the central action registry for core NSV updates and orchestration
registerCoreActions();
registerAnalysisActions();
registerGlobalValidationActions();
registerFieldSuggestionActions();

// Register module-specific action handlers eagerly so Nexus cross-module delegation
// never falls through due to lazy page-level registration.
registerAgnesActions();
registerAtlasActions();
registerAtlasFieldActions();
registerLedgerActions();
registerLedgerFieldActions();
registerTitanActions();
registerScoutActions();
registerForgeActions();
registerSomaFieldActions();

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
