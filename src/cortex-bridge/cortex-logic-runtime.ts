import './js-joda-global';

// Preload the transitive runtime graph before importing cortex.js.
import 'cortex-logic/build/dist/js/productionLibrary/kotlin-kotlin-stdlib.js';
import 'cortex-logic/build/dist/js/productionLibrary/kotlinx-serialization-kotlinx-serialization-core.js';
import 'cortex-logic/build/dist/js/productionLibrary/kotlinx-serialization-kotlinx-serialization-json.js';
import 'cortex-logic/build/dist/js/productionLibrary/kotlinx-atomicfu.js';
import 'cortex-logic/build/dist/js/productionLibrary/kotlinx-io-kotlinx-io-core.js';
import 'cortex-logic/build/dist/js/productionLibrary/kotlinx-coroutines-core.js';
import 'cortex-logic/build/dist/js/productionLibrary/ktor-ktor-utils.js';
import 'cortex-logic/build/dist/js/productionLibrary/ktor-ktor-io.js';
import 'cortex-logic/build/dist/js/productionLibrary/ktor-ktor-http.js';
import 'cortex-logic/build/dist/js/productionLibrary/ktor-ktor-shared-ktor-events.js';
import 'cortex-logic/build/dist/js/productionLibrary/ktor-ktor-shared-ktor-websockets.js';
import 'cortex-logic/build/dist/js/productionLibrary/Kotlin-DateTime-library-kotlinx-datetime.js';
import 'cortex-logic/build/dist/js/productionLibrary/ktor-ktor-client-ktor-client-core.js';
import * as cortexModule from 'cortex-logic/build/dist/js/productionLibrary/cortex.js';

const moduleAny: any = cortexModule as any;
const maybeDefault = moduleAny['de' + 'fault'];
const globalUmdRoot: any = (globalThis as any)?.['com.agnes.nexus:cortex'];
const root: any =
  moduleAny?.com
    ? moduleAny
    : maybeDefault?.com
      ? maybeDefault
      : globalUmdRoot?.com
        ? globalUmdRoot
        : moduleAny;
const engine: Record<string, unknown> = root?.com?.agnes?.nexus?.core?.engine ?? {};
const domainServices: Record<string, unknown> = root?.com?.agnes?.nexus?.core?.domain?.services ?? {};

// Build flat export map once on module load (single DFS instead of per-export BFS)
const _exportMap = new Map<string, unknown>();
function buildExportMap(node: any, depth = 0, visited = new Set()) {
  if (!node || typeof node !== 'object' || depth > 8 || visited.has(node)) return;
  visited.add(node);
  for (const key of Object.keys(node)) {
    if (!_exportMap.has(key)) _exportMap.set(key, node[key]);
    if (typeof node[key] === 'object') buildExportMap(node[key], depth + 1, visited);
  }
}
buildExportMap(root);
if (globalUmdRoot && globalUmdRoot !== root) buildExportMap(globalUmdRoot);

function requireEngineExport<T = any>(name: string): T {
  const value = engine[name] ?? domainServices[name] ?? _exportMap.get(name);
  if (!value) {
    throw new Error(`@cortex-logic runtime export missing: ${name}`);
  }
  return value as T;
}

export const AccountAggregationJs = requireEngineExport('AccountAggregationJs');
export const AliveEntityUtilsJs = requireEngineExport('AliveEntityUtilsJs');
export const EmbeddingUtilsJs = requireEngineExport('EmbeddingUtilsJs');
export const MedicalClearanceEvaluatorJs = requireEngineExport('MedicalClearanceEvaluatorJs');
export const AgnesGravityEngineJs = requireEngineExport('AgnesGravityEngineJs');
export const AtlasBlueprintServiceJs = requireEngineExport('AtlasBlueprintServiceJs');
export const AtlasPlanningEngineJs = requireEngineExport('AtlasPlanningEngineJs');
export const AtlasPredictiveEngineJs = requireEngineExport('AtlasPredictiveEngineJs');
export const DocumentFieldExtractorJs = requireEngineExport('DocumentFieldExtractorJs');
// ActionHubJs is resolved lazily — the KMP build must include ActionHubJs.kt before this is non-null.
export const ActionHubJs: (new (...args: unknown[]) => unknown) | null = (() => {
  try { return requireEngineExport('ActionHubJs'); } catch { return null; }
})();
export const ActionCapabilityResolverJs = requireEngineExport('ActionCapabilityResolverJs');
export const AgentRegistryJs = requireEngineExport('AgentRegistryJs');
export const AtlasComputeUtilsJs = requireEngineExport('AtlasComputeUtilsJs');
export const AutopilotActionPolicyServiceJs = requireEngineExport('AutopilotActionPolicyServiceJs');
export const BlueprintEngineJs = requireEngineExport('BlueprintEngineJs');
export const BudgetAggregationJs = requireEngineExport('BudgetAggregationJs');
export const CalendarAggregationJs = requireEngineExport('CalendarAggregationJs');
// CancellableTask is only present after the cortex-logic KMP build includes CancellableTask.kt.
export const CancellableTask: (new (...args: unknown[]) => unknown) | null = (() => {
  try { return requireEngineExport('CancellableTask'); } catch { return null; }
})();
export const CognitiveEngineJs = requireEngineExport('CognitiveEngineJs');
export const CredentialStoreJs = requireEngineExport('CredentialStoreJs');
export const CommandIntelligenceServiceJs = requireEngineExport('CommandIntelligenceServiceJs');
export const ContextBudgeterJs = requireEngineExport('ContextBudgeterJs');
export const CreditAggregationJs = requireEngineExport('CreditAggregationJs');
export const CrossVerificationServiceJs = requireEngineExport('CrossVerificationServiceJs');
export const DashboardAggregationJs = requireEngineExport('DashboardAggregationJs');
export const E1rmServiceJs = requireEngineExport('E1rmServiceJs');
export const ExerciseLibraryJs = requireEngineExport('ExerciseLibraryJs');
export const ExtractedMutation = requireEngineExport('ExtractedMutation');
export const FlowContractsJs = requireEngineExport('FlowContractsJs');
export const ForecastAggregationJs = requireEngineExport('ForecastAggregationJs');
export const GlobalProjectionServiceJs = requireEngineExport('GlobalProjectionServiceJs');
export const GuestQuotaServiceJs = requireEngineExport('GuestQuotaServiceJs');
export const HabitEnergyMatcherJs = requireEngineExport('HabitEnergyMatcherJs');
export const InsuranceAggregationJs = requireEngineExport('InsuranceAggregationJs');
export const InteractionGateJs = requireEngineExport('InteractionGateJs');
export const LedgerAggregationUtilsJs = requireEngineExport('LedgerAggregationUtilsJs');
export const LedgerAutomationEngineJs = requireEngineExport('LedgerAutomationEngineJs');
export const LlmSanitizerJs = requireEngineExport('LlmSanitizerJs');
export const NetWorthAggregationJs = requireEngineExport('NetWorthAggregationJs');
export const OnboardingValidationJs = requireEngineExport('OnboardingValidationJs');
export const NeuralStateVectorJs = requireEngineExport('NeuralStateVectorJs');
export const NexusActionDispatchServiceJs = requireEngineExport('NexusActionDispatchServiceJs');
export const NexusActionPlannerServiceJs = requireEngineExport('NexusActionPlannerServiceJs');
export const NexusDispatchExecutionServiceJs = requireEngineExport('NexusDispatchExecutionServiceJs');
export const NexusRoutingServiceJs = requireEngineExport('NexusRoutingServiceJs');
export const NexusSynthesisServiceJs = requireEngineExport('NexusSynthesisServiceJs');
export const NsvOwnershipServiceJs = requireEngineExport('NsvOwnershipServiceJs');
export const NsvServiceJs = requireEngineExport('NsvServiceJs');
export const OrchestrationActionGateServiceJs = requireEngineExport('OrchestrationActionGateServiceJs');
export const OrchestrationCommandCenterServiceJs = requireEngineExport('OrchestrationCommandCenterServiceJs');
export const OrchestrationContractsJs = requireEngineExport('OrchestrationContractsJs');
export const OrchestrationExecutionUtilsJs = requireEngineExport('OrchestrationExecutionUtilsJs');
export const OrchestrationHistoryUtilsJs = requireEngineExport('OrchestrationHistoryUtilsJs');
export const OrchestrationOperatingModeServiceJs = requireEngineExport('OrchestrationOperatingModeServiceJs');
export const OrchestrationPerformanceServiceJs = requireEngineExport('OrchestrationPerformanceServiceJs');
export const OrchestrationPersistenceUtilsJs = requireEngineExport('OrchestrationPersistenceUtilsJs');
export const OrchestrationPolicyServiceJs = requireEngineExport('OrchestrationPolicyServiceJs');
export const OrchestrationRolloutServiceJs = requireEngineExport('OrchestrationRolloutServiceJs');
export const PersonaFactoryJs = requireEngineExport('PersonaFactoryJs');
export const PersonaPromptCatalogJs: (new (...args: unknown[]) => unknown) | null = (() => {
  try { return requireEngineExport('PersonaPromptCatalogJs'); } catch { return null; }
})();
export const PortfolioAggregationJs = requireEngineExport('PortfolioAggregationJs');
export const PrecedenceResolverJs = requireEngineExport('PrecedenceResolverJs');
export const ProgressiveOverloadEngineJs = requireEngineExport('ProgressiveOverloadEngineJs');
export const QuickLogParserJs = requireEngineExport('QuickLogParserJs');
export const RecurringBillEngineJs = requireEngineExport('RecurringBillEngineJs');
export const RecoveryTemplatesJs = requireEngineExport('RecoveryTemplatesJs');
export const RetirementCalculatorJs = requireEngineExport('RetirementCalculatorJs');
export const RuntimeSemanticsBuilderJs = requireEngineExport('RuntimeSemanticsBuilderJs');
export const SessionArcJs = requireEngineExport('SessionArcJs');
export const SomaFieldTemplatesJs = requireEngineExport('SomaFieldTemplatesJs');
export const SoulAuthorityServiceJs = requireEngineExport('SoulAuthorityServiceJs');
export const SpecVectorCalculatorJs = requireEngineExport('SpecVectorCalculatorJs');
export const SubscriptionAggregationJs = requireEngineExport('SubscriptionAggregationJs');
export const TaxAggregationJs = requireEngineExport('TaxAggregationJs');
export const TitanClearanceEngineJs = requireEngineExport('TitanClearanceEngineJs');
export const TitanNsvUpdaterJs = requireEngineExport('TitanNsvUpdaterJs');
// TitanPromptBuilderJs is only present after the cortex-logic KMP build includes TitanPromptBuilderJs.kt.
export const TitanPromptBuilderJs: (new (...args: unknown[]) => unknown) | null = (() => {
  try { return requireEngineExport('TitanPromptBuilderJs'); } catch { return null; }
})();
export const TransactionAggregationJs = requireEngineExport('TransactionAggregationJs');
export const UserIdentityJs = requireEngineExport('UserIdentityJs');
