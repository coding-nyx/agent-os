
import React from 'react'
// Dev-only FCM diagnostics — call window.__diagnoseFCM() in the browser console
if (import.meta.env.DEV) {
  import('./lib/services/bridge-service').then(({ diagnoseFCM }) => {
    (window as unknown as Record<string, unknown>).__diagnoseFCM = diagnoseFCM;
    console.log('[Dev] FCM diagnostics available: call window.__diagnoseFCM()');
  });
}
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { NexusLogger } from './lib/nexus-logger'
import { registerCoreActions } from './lib/actions/core-handlers'
import { registerAnalysisActions } from './lib/actions/analysis-actions'
import { registerGlobalValidationActions } from './lib/actions/validation-actions'
import { registerFieldSuggestionActions } from './lib/actions/field-suggestion-actions'
import { initializeSchemas } from './lib/schemas/init'
import { getNexusDataLayer } from './lib/data-layer/provider'
import { Spine } from './lib/spine/spine-event-bus'

// Module-specific action registrations — imported here so handlers are available
// immediately, regardless of which page the user visits first (or Nexus delegates to).
import { registerAgnesActions } from './modules/agnes/services/actions'
import { registerAtlasActions } from './modules/atlas/services/actions'
import { registerAtlasFieldActions } from './modules/atlas/actions/atlas-field-actions'
import { registerLedgerActions } from './modules/ledger/services/actions'
import { registerLedgerFieldActions } from './modules/ledger/actions/ledger-field-actions'
import { registerLedgerTransactionActions } from './modules/ledger/actions/transaction-actions'
import { registerTitanActions } from './modules/titan/services/actions'
import { registerScoutActions } from './modules/scout/services/actions'
import { registerForgeActions } from './modules/forge/services/actions'
import { registerSomaFieldActions } from './modules/soma/actions/soma-field-actions'
import { registerOrchestratorActions } from './modules/nexus/services/actions'

// Boot NexusLogger before anything else — console override must be in place before
// any module code or React runs. Reads debug state from localStorage so it persists.
const _debugOnBoot = localStorage.getItem('nexus_debug_mode') === 'true';
NexusLogger.init(_debugOnBoot);

// Initialize the central action registry for core NSV updates and orchestration.
// Orchestrator supplementary handlers (navigate_to_module, create_module_handoff,
// and typed fallbacks for the 4 AI-facing handlers) are registered first so that
// registerCoreActions() can overwrite shared keys with its hardened implementations.
registerOrchestratorActions();
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
registerLedgerTransactionActions();
registerTitanActions();
registerScoutActions();
registerForgeActions();
registerSomaFieldActions();

// Initialize schema registry with all module schemas
initializeSchemas();

// Wire NexusDataLayer into SpineEventBus so spine_events persistence goes through
// the abstraction layer rather than hitting Firebase directly. This allows tests
// to inject InMemoryDataLayer via setNexusDataLayer() before the Spine emits.
Spine.setDataLayer(getNexusDataLayer());

// Filter out noisy THREE.Clock deprecation warnings from @react-three/fiber internals.
// We patch console.warn AFTER NexusLogger.init() so the original method is already
// snapshotted — this wrapper calls the (potentially overridden) console.warn.
const _origWarn = console.warn.bind(console);
console.warn = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].includes('THREE.Clock') && args[0].includes('deprecated')) return;
  _origWarn(...args);
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
