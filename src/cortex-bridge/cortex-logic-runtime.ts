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
const globalUmdRoot: any = (globalThis as any)?.['com.agnes.ara:cortex'];
const root: any =
  moduleAny?.com
    ? moduleAny
    : maybeDefault?.com
      ? maybeDefault
      : globalUmdRoot?.com
        ? globalUmdRoot
        : moduleAny;
const engine: Record<string, unknown> = root?.com?.agnes?.ara?.core?.engine ?? {};
const domainServices: Record<string, unknown> = root?.com?.agnes?.ara?.core?.domain?.services ?? {};

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

/** Safe variant — returns null when the KMP build doesn't yet include the export. */
function tryLoad(name: string): (new (...args: unknown[]) => unknown) | null {
  try { return requireEngineExport(name); } catch { return null; }
}

export const AccountAggregationJs = requireEngineExport('AccountAggregationJs');
export const AliveEntityUtilsJs = requireEngineExport('AliveEntityUtilsJs');
export const EmbeddingUtilsJs = requireEngineExport('EmbeddingUtilsJs');
export const MedicalClearanceEvaluatorJs = requireEngineExport('MedicalClearanceEvaluatorJs');
export const AgnesGravityEngineJs = requireEngineExport('AgnesGravityEngineJs');
export const BeliefGraphServiceJs = requireEngineExport('BeliefGraphServiceJs');
export const AtlasBlueprintServiceJs = requireEngineExport('AtlasBlueprintServiceJs');
export const AtlasPlanningEngineJs = requireEngineExport('AtlasPlanningEngineJs');
export const AtlasPredictiveEngineJs = requireEngineExport('AtlasPredictiveEngineJs');
export const DocumentFieldExtractorJs = requireEngineExport('DocumentFieldExtractorJs');
// ActionHubJs is resolved lazily — the KMP build must include ActionHubJs.kt before this is non-null.
export const ActionHubJs = tryLoad('ActionHubJs');
export const ActionCapabilityResolverJs = requireEngineExport('ActionCapabilityResolverJs');
export const AgentRegistryJs = requireEngineExport('AgentRegistryJs');
export const AtlasComputeUtilsJs = requireEngineExport('AtlasComputeUtilsJs');
export const AutopilotActionPolicyServiceJs = requireEngineExport('AutopilotActionPolicyServiceJs');
export const BlueprintEngineJs = requireEngineExport('BlueprintEngineJs');
export const BudgetAggregationJs = requireEngineExport('BudgetAggregationJs');
export const CalendarAggregationJs = requireEngineExport('CalendarAggregationJs');
// CancellableTask is only present after the cortex-logic KMP build includes CancellableTask.kt.
export const CancellableTask = tryLoad('CancellableTask');
export const CognitiveEngineJs = requireEngineExport('CognitiveEngineJs');
export const CredentialStoreJs = requireEngineExport('CredentialStoreJs');
export const CommandIntelligenceServiceJs = requireEngineExport('CommandIntelligenceServiceJs');
export const ContextBudgeterJs = requireEngineExport('ContextBudgeterJs');
export const CreditAggregationJs = requireEngineExport('CreditAggregationJs');
export const CrossVerificationServiceJs = requireEngineExport('CrossVerificationServiceJs');
export const DashboardAggregationJs = requireEngineExport('DashboardAggregationJs');
// DelegationTrackingServiceJs — use safe lazy pattern so the app boots if the KMP build is behind.
export const DelegationTrackingServiceJs = tryLoad('DelegationTrackingServiceJs');
// ThreadParticipantServiceJs — use safe lazy pattern so the app boots if the KMP build is behind.
export const ThreadParticipantServiceJs = tryLoad('ThreadParticipantServiceJs');
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
export const LlmSanitizerJs = requireEngineExport('LlmSanitizerJs');
export const NetWorthAggregationJs = requireEngineExport('NetWorthAggregationJs');
export const OnboardingValidationJs = requireEngineExport('OnboardingValidationJs');
export const NeuralStateVectorJs = requireEngineExport('NeuralStateVectorJs');
// Ara* services are added in the next cortex-logic KMP build — use safe lazy pattern until rebuilt.
export const AraActionDispatchServiceJs = tryLoad('AraActionDispatchServiceJs');
export const AraActionPlannerServiceJs = tryLoad('AraActionPlannerServiceJs');
export const AraDispatchExecutionServiceJs = tryLoad('AraDispatchExecutionServiceJs');
export const AraRoutingServiceJs = tryLoad('AraRoutingServiceJs');
export const AraSynthesisServiceJs = tryLoad('AraSynthesisServiceJs');
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
export const PersonaPromptCatalogJs = tryLoad('PersonaPromptCatalogJs');
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
export const TitanPromptBuilderJs = tryLoad('TitanPromptBuilderJs');
export const TransactionAggregationJs = requireEngineExport('TransactionAggregationJs');
// RagChunkingServiceJs may not be in the export map if the DFS doesn't reach the rag namespace;
// use the safe lazy pattern so the app boots even if the export is missing at load time.
export const RagChunkingServiceJs = tryLoad('RagChunkingServiceJs');
// NotificationContentResolverJs may not be in the export map until the KMP JS library is rebuilt;
// use the safe lazy pattern so the app boots even if the export is missing at load time.
export const NotificationContentResolverJs = tryLoad('NotificationContentResolverJs');
export const UserIdentityJs = requireEngineExport('UserIdentityJs');
// AutomationServiceJs is added in cortex-logic 1.6.0 — use safe lazy pattern until the dep is bumped.
export const AutomationServiceJs = tryLoad('AutomationServiceJs');
// ScoutSessionContextAssemblerJs — added alongside the Scout RAG pipeline.
// Use safe lazy pattern; agnes/src/modules/scout/services/scout-session-context-assembler.ts
// provides the TypeScript fallback until the KMP bundle is rebuilt.
export const ScoutSessionContextAssemblerJs = tryLoad('ScoutSessionContextAssemblerJs');
