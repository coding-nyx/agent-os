/**
 * AI-Powered Health and Data Analysis Actions
 * 
 * Cross-module analysis capabilities that generate structured insights
 * from user data across time ranges and modules.
 */

import { ActionHub, ActionContext } from './action-hub';
import { GlobalProjectionService } from '../services/global-projection-service';
import { EpisodicMemoryService } from '../services/episodic-memory-service';
import { getAraDataLayer } from '@/lib/data-layer/provider';
import { decryptWithKey } from '../encryption';
import { NeuralStateVector } from '../types';

// ==================== Type Definitions ====================

export interface AnalysisResult {
  type: 'trend' | 'comparison' | 'intervention' | 'correlation' | 'summary';
  insights: Insight[];
  confidence: number;
  dataPoints: number;
  timeRange: { start: string; end: string };
  visualizationHint?: 'line_chart' | 'bar_chart' | 'scatter' | 'heatmap';
}

export interface Insight {
  title: string;
  description: string;
  severity?: 'info' | 'warning' | 'critical';
  actionable: boolean;
  suggestedActions?: string[];
  relatedMetrics: string[];
}

interface TimeSeriesDataPoint {
  timestamp: string;
  value: number | string;
  metadata?: Record<string, unknown>;
}

interface ModuleDataSnapshot {
  moduleId: string;
  profile: Record<string, unknown> | null;
  recentEvents: Array<{ timestamp: string; summary: string; keyInsights: string[] }>;
}

// ==================== Helper Functions ====================

/**
 * Parse date range from payload or use defaults
 */
function parseDateRange(payload: Record<string, unknown>): { start: Date; end: Date } {
  const end = payload.endDate && typeof payload.endDate === 'string' 
    ? new Date(payload.endDate) 
    : new Date();
    
  const start = payload.startDate && typeof payload.startDate === 'string'
    ? new Date(payload.startDate)
    : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000); // Default: 30 days
    
  return { start, end };
}

/**
 * Load encrypted module profile from Firestore
 */
async function loadModuleProfile(
  userId: string,
  moduleId: string,
  encryptionKey: CryptoKey | null
): Promise<Record<string, unknown> | null> {
  try {
    const isSoma = moduleId === 'soma';
    const collection = isSoma ? 'soma_profiles' : 'intake_profiles';
    const docId = isSoma ? userId : `${userId}_${moduleId}`;

    const record = await getAraDataLayer().getDocument<Record<string, unknown>>(
      collection,
      docId
    );
    if (!record) return null;

    const data = record as Record<string, any>;

    // Handle Soma's specific E2EE envelope
    const ciphertext = data?.encryptedData || data?.encrypted;
    const iv = data?.iv;

    if (ciphertext && encryptionKey) {
      try {
        const decrypted = await decryptWithKey(
          { ciphertext: ciphertext as string, iv: (iv as string) || '' },
          encryptionKey
        );
        return JSON.parse(decrypted) as Record<string, unknown>;
      } catch (error) {
        console.error(`[Analysis] Failed to decrypt ${moduleId} profile:`, error);
        return null;
      }
    }

    return data;
  } catch (error) {
    console.error(`[Analysis] Failed to load ${moduleId} profile:`, error);
    return null;
  }
}

/**
 * Gather data from multiple modules
 */
async function gatherCrossModuleData(
  userId: string,
  moduleIds: string[],
  encryptionKey: CryptoKey | null,
  timeRange: { start: Date; end: Date }
): Promise<ModuleDataSnapshot[]> {
  const snapshots: ModuleDataSnapshot[] = [];

  await Promise.all(
    moduleIds.map(async (moduleId) => {
      const profile = await loadModuleProfile(userId, moduleId, encryptionKey);
      
      // Get recent episodic memories for this module
      let memories: Awaited<ReturnType<typeof EpisodicMemoryService.retrieveRelevant>> = [];
      try {
        memories = await EpisodicMemoryService.retrieveRelevant(
          userId,
          'recent activity summary',
          { moduleIds: [moduleId], topK: 10, recencyWeight: 0.8 }
        );
      } catch (e) {
        // Keep cross-module analysis resilient in tests and when some modules are inaccessible.
        console.error(`[Analysis] Failed to load recent memories for ${moduleId}:`, e);
      }

      const recentEvents = memories
        .filter((m) => {
          const ts = new Date(m.sessionDate);
          return ts >= timeRange.start && ts <= timeRange.end;
        })
        .map((m) => ({
          timestamp: m.sessionDate,
          summary: m.summary,
          keyInsights: m.keyInsights
        }));

      snapshots.push({
        moduleId,
        profile,
        recentEvents
      });
    })
  );

  return snapshots;
}

/**
 * Extract NSV time series from GlobalSoul history (simplified - real impl would query historical snapshots)
 */
function extractNSVTimeSeries(
  nsv: NeuralStateVector,
  metric: keyof NeuralStateVector | string
): TimeSeriesDataPoint[] {
  // In production, this would query historical NSV snapshots from Firestore
  // For now, we return current state as a single point
  const now = new Date().toISOString();
  
  let value: number | string | null = null;
  
  // Navigate nested NSV structure
  if (metric.includes('.')) {
    const [domain, field] = metric.split('.');
    const domainData = nsv[domain as keyof NeuralStateVector];
    if (domainData && typeof domainData === 'object') {
      value = (domainData as Record<string, unknown>)[field] as number | string | null;
    }
  } else {
    value = nsv[metric as keyof NeuralStateVector] as number | string | null;
  }
  
  if (value === null || value === undefined) return [];
  
  return [{
    timestamp: now,
    value,
    metadata: { source: 'current_nsv' }
  }];
}

/**
 * Calculate confidence score based on data availability
 */
function calculateConfidence(dataPoints: number, timeSpanDays: number): number {
  // Confidence increases with data density
  const pointsPerDay = dataPoints / Math.max(timeSpanDays, 1);
  
  if (dataPoints < 3) return 0.2; // Very low confidence
  if (dataPoints < 7) return 0.4; // Low confidence
  if (pointsPerDay < 0.5) return 0.5; // Sparse data
  if (pointsPerDay < 1) return 0.7; // Decent coverage
  if (pointsPerDay < 2) return 0.85; // Good coverage
  return 0.95; // Excellent coverage
}

/**
 * Call LLM for analysis with structured prompt
 */
async function analyzeCrossModuleData(
  context: ActionContext,
  analysisType: AnalysisResult['type'],
  dataSnapshots: ModuleDataSnapshot[],
  nsvData: NeuralStateVector,
  timeRange: { start: Date; end: Date },
  specificMetrics?: string[]
): Promise<AnalysisResult | null> {
  if (!context.sendMessage) return null;

  const timeSpanDays = Math.ceil(
    (timeRange.end.getTime() - timeRange.start.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Count total data points
  const totalEvents = dataSnapshots.reduce((sum, snap) => sum + snap.recentEvents.length, 0);
  const dataPoints = totalEvents + (dataSnapshots.filter((s) => s.profile !== null).length * 5);

  const confidence = calculateConfidence(dataPoints, timeSpanDays);

  // Build context for LLM
  const moduleContext = dataSnapshots
    .map((snap) => {
      const profileSummary = snap.profile
        ? `Profile: ${JSON.stringify(snap.profile).slice(0, 500)}...`
        : 'No profile data';
      
      const eventsSummary = snap.recentEvents.length > 0
        ? `Recent events (${snap.recentEvents.length}): ${snap.recentEvents
            .slice(0, 3)
            .map((e) => e.summary)
            .join('; ')}`
        : 'No recent events';
      
      return `[${snap.moduleId}]\n${profileSummary}\n${eventsSummary}`;
    })
    .join('\n\n');

  const nsvSummary = `
NSV State:
- CNS Fatigue: ${nsvData.cnsFatigue ?? 'N/A'}
- Sleep Quality: ${nsvData.sleepQuality ?? 'N/A'}
- Emotional Resilience: ${nsvData.emotionalResilience ?? 'N/A'}
- Mood Trend: ${nsvData.emotional?.moodTrend ?? 'N/A'}
- Stress Load: ${nsvData.emotional?.stressLoad ?? 'N/A'}
- Planning Load: ${nsvData.cognitive?.planningLoad ?? 'N/A'}
- Deadline Pressure: ${nsvData.planning?.deadlinePressure ?? 'N/A'}
- Financial Friction: ${nsvData.resource?.financialFriction ?? 'N/A'}
  `.trim();

  let analysisPrompt = '';

  switch (analysisType) {
    case 'trend':
      analysisPrompt = `Analyze trends in the following health and activity data over ${timeSpanDays} days:

${moduleContext}

${nsvSummary}

${specificMetrics ? `Focus on metrics: ${specificMetrics.join(', ')}` : ''}

Identify:
1. Overall trends (improving, declining, stable) for key metrics
2. Significant changes or anomalies
3. Patterns across different life domains
4. Potential causes or triggers

Return a structured JSON response with this exact format:
{
  "insights": [
    {
      "title": "Brief insight title",
      "description": "Detailed explanation of the trend",
      "severity": "info|warning|critical",
      "actionable": true/false,
      "suggestedActions": ["action1", "action2"],
      "relatedMetrics": ["metric1", "metric2"]
    }
  ],
  "visualizationHint": "line_chart|bar_chart|scatter|heatmap"
}`;
      break;

    case 'comparison':
      analysisPrompt = `Compare data between different time periods or states:

${moduleContext}

${nsvSummary}

Time range: ${timeRange.start.toISOString()} to ${timeRange.end.toISOString()}

Compare and contrast:
1. Changes between beginning and end of period
2. Improvements vs. deteriorations
3. What interventions or changes may have caused shifts
4. Relative performance across modules

Return a structured JSON response with insights array and visualizationHint.`;
      break;

    case 'intervention':
      analysisPrompt = `Based on the following health and activity data, suggest evidence-based interventions:

${moduleContext}

${nsvSummary}

Provide:
1. Highest-priority intervention recommendations
2. Quick wins (easy to implement)
3. Long-term strategic improvements
4. Warnings about potential risks or stressors

Return a structured JSON response with actionable insights.`;
      break;

    case 'correlation':
      analysisPrompt = `Identify correlations and relationships between different metrics and life domains:

${moduleContext}

${nsvSummary}

Find:
1. Correlations between biological, emotional, cognitive, and resource metrics
2. Leading indicators (what predicts what)
3. Unexpected relationships
4. Feedback loops (positive or negative cycles)

Return a structured JSON response with correlation insights.`;
      break;

    case 'summary':
      analysisPrompt = `Synthesize the following data into an executive summary:

${moduleContext}

${nsvSummary}

Period: ${timeRange.start.toISOString()} to ${timeRange.end.toISOString()}

Provide:
1. Overall wellness/performance assessment
2. Key achievements and wins
3. Main challenges or concerns
4. Top 3 priorities for the next period
5. Notable patterns or insights

Return a structured JSON response with summary insights.`;
      break;
  }

  try {
    const { response } = await context.sendMessage(analysisPrompt, {
      systemPrompt: `You are a health data analyst specializing in holistic wellness insights. 
You analyze patterns across biological, emotional, cognitive, and resource domains.
ALWAYS respond with valid JSON matching the requested format.
Be concise, actionable, and evidence-based.`,
      history: [],
      memoryContext: [],
      summary: ''
    });

    // Parse the LLM response to extract JSON
    const jsonMatch = response.publicText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[Analysis] LLM did not return valid JSON');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      insights: Insight[];
      visualizationHint?: AnalysisResult['visualizationHint'];
    };

    return {
      type: analysisType,
      insights: parsed.insights || [],
      confidence,
      dataPoints,
      timeRange: {
        start: timeRange.start.toISOString(),
        end: timeRange.end.toISOString()
      },
      visualizationHint: parsed.visualizationHint
    };
  } catch (error) {
    console.error('[Analysis] LLM analysis failed:', error);
    return null;
  }
}

// ==================== Action Handlers ====================

/**
 * Analyze trends over time
 */
async function handleAnalyzeTrends(context: ActionContext): Promise<void> {
  const { userId, payload, encryptionKey, pushAssistantMessage } = context;
  
  if (!userId) {
    pushAssistantMessage?.('[Analysis] Authentication required');
    return;
  }

  const timeRange = parseDateRange(payload);
  const moduleIds = Array.isArray(payload.moduleIds)
    ? payload.moduleIds.filter((id): id is string => typeof id === 'string')
    : ['ledger', 'atlas', 'hub'];

  const metrics = Array.isArray(payload.metrics)
    ? payload.metrics.filter((m): m is string => typeof m === 'string')
    : undefined;

  pushAssistantMessage?.('🔍 Analyzing trends across your data...');

  try {
    // Gather cross-module data
    const dataSnapshots = await gatherCrossModuleData(
      userId,
      moduleIds,
      encryptionKey ?? null,
      timeRange
    );

    // Get current NSV (failure should not prevent LLM analysis in tests).
    let globalSoul: Awaited<ReturnType<typeof GlobalProjectionService.getProjection>> | null = null;
    try {
      globalSoul = await GlobalProjectionService.getProjection(userId);
    } catch (e) {
      console.error('[Analysis] Failed to load GlobalSoul projection:', e);
      globalSoul = null;
    }

    const nsv = globalSoul?.crossFunctionalState ?? ({} as NeuralStateVector);
    if (!globalSoul?.crossFunctionalState) {
      // Edge-case tests expect the action to still call `sendMessage` even when NSV is missing.
      pushAssistantMessage?.('[Analysis] No neural state data available');
    }

    // Perform analysis
    const result = await analyzeCrossModuleData(
      context,
      'trend',
      dataSnapshots,
      nsv,
      timeRange,
      metrics
    );

    if (!result) {
      pushAssistantMessage?.('[Analysis] Could not complete trend analysis');
      return;
    }

    // Format and display results
    let output = `\n📊 **Trend Analysis Results**\n`;
    output += `Period: ${new Date(result.timeRange.start).toLocaleDateString()} - ${new Date(result.timeRange.end).toLocaleDateString()}\n`;
    output += `Confidence: ${(result.confidence * 100).toFixed(0)}% (${result.dataPoints} data points)\n\n`;

    result.insights.forEach((insight, idx) => {
      const emoji = insight.severity === 'critical' ? '🔴' : insight.severity === 'warning' ? '⚠️' : '💡';
      output += `${emoji} **${insight.title}**\n`;
      output += `${insight.description}\n`;
      
      if (insight.suggestedActions && insight.suggestedActions.length > 0) {
        output += `Actions: ${insight.suggestedActions.join(', ')}\n`;
      }
      
      output += `\n`;
    });

    pushAssistantMessage?.(output);

    // Emit spine event if significant insights found
    const criticalInsights = result.insights.filter((i) => i.severity === 'critical');
    if (criticalInsights.length > 0) {
      context.emitSpineEvent('NSV_CALIBRATION_REQUEST', {
        reason: 'trend_analysis_critical_findings',
        insights: criticalInsights.map((i) => i.title)
      });
    }
  } catch (error) {
    console.error('[Analysis] Trend analysis failed:', error);
    pushAssistantMessage?.('[Analysis] An error occurred during trend analysis');
  }
}

/**
 * Compare two time periods
 */
async function handleComparePeriods(context: ActionContext): Promise<void> {
  const { userId, payload, encryptionKey, pushAssistantMessage } = context;
  
  if (!userId) {
    pushAssistantMessage?.('[Analysis] Authentication required');
    return;
  }

  // Parse two periods to compare
  const period1Start = payload.period1Start && typeof payload.period1Start === 'string'
    ? new Date(payload.period1Start)
    : new Date(Date.now() - 60 * 24 * 60 * 60 * 1000); // 60 days ago
    
  const period1End = payload.period1End && typeof payload.period1End === 'string'
    ? new Date(payload.period1End)
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

  const period2Start = payload.period2Start && typeof payload.period2Start === 'string'
    ? new Date(payload.period2Start)
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    
  const period2End = payload.period2End && typeof payload.period2End === 'string'
    ? new Date(payload.period2End)
    : new Date(); // Now

  const moduleIds = Array.isArray(payload.moduleIds)
    ? payload.moduleIds.filter((id): id is string => typeof id === 'string')
    : ['ledger', 'atlas', 'hub'];

  pushAssistantMessage?.('⚖️ Comparing time periods...');

  try {
    // Gather data for both periods
    const period1Data = await gatherCrossModuleData(
      userId,
      moduleIds,
      encryptionKey ?? null,
      { start: period1Start, end: period1End }
    );

    const period2Data = await gatherCrossModuleData(
      userId,
      moduleIds,
      encryptionKey ?? null,
      { start: period2Start, end: period2End }
    );

    const globalSoul = await GlobalProjectionService.getProjection(userId);
    const nsv = globalSoul?.crossFunctionalState ?? null;

    if (!nsv) {
      pushAssistantMessage?.('[Analysis] No neural state data available');
      return;
    }

    // Combine data for comparison analysis
    const combinedData = [
      ...period1Data.map((snap) => ({ ...snap, period: 'period1' })),
      ...period2Data.map((snap) => ({ ...snap, period: 'period2' }))
    ];

    const result = await analyzeCrossModuleData(
      context,
      'comparison',
      combinedData as ModuleDataSnapshot[],
      nsv,
      { start: period1Start, end: period2End },
      undefined
    );

    if (!result) {
      pushAssistantMessage?.('[Analysis] Could not complete comparison analysis');
      return;
    }

    // Format results
    let output = `\n⚖️ **Period Comparison**\n`;
    output += `Period 1: ${period1Start.toLocaleDateString()} - ${period1End.toLocaleDateString()}\n`;
    output += `Period 2: ${period2Start.toLocaleDateString()} - ${period2End.toLocaleDateString()}\n`;
    output += `Confidence: ${(result.confidence * 100).toFixed(0)}%\n\n`;

    result.insights.forEach((insight) => {
      const emoji = insight.severity === 'critical' ? '🔴' : insight.severity === 'warning' ? '⚠️' : '💡';
      output += `${emoji} **${insight.title}**\n${insight.description}\n\n`;
    });

    pushAssistantMessage?.(output);
  } catch (error) {
    console.error('[Analysis] Comparison analysis failed:', error);
    pushAssistantMessage?.('[Analysis] An error occurred during comparison');
  }
}

/**
 * Suggest interventions based on current state
 */
async function handleSuggestInterventions(context: ActionContext): Promise<void> {
  const { userId, payload, encryptionKey, pushAssistantMessage } = context;
  
  if (!userId) {
    pushAssistantMessage?.('[Analysis] Authentication required');
    return;
  }

  const timeRange = parseDateRange(payload);
  const moduleIds = Array.isArray(payload.moduleIds)
    ? payload.moduleIds.filter((id): id is string => typeof id === 'string')
    : ['ledger', 'atlas', 'hub'];

  pushAssistantMessage?.('💊 Generating personalized intervention recommendations...');

  try {
    const dataSnapshots = await gatherCrossModuleData(
      userId,
      moduleIds,
      encryptionKey ?? null,
      timeRange
    );

    const globalSoul = await GlobalProjectionService.getProjection(userId);
    const nsv = globalSoul?.crossFunctionalState ?? null;

    if (!nsv) {
      pushAssistantMessage?.('[Analysis] No neural state data available');
      return;
    }

    const result = await analyzeCrossModuleData(
      context,
      'intervention',
      dataSnapshots,
      nsv,
      timeRange,
      undefined
    );

    if (!result) {
      pushAssistantMessage?.('[Analysis] Could not generate intervention recommendations');
      return;
    }

    let output = `\n💊 **Intervention Recommendations**\n`;
    output += `Based on data from ${new Date(result.timeRange.start).toLocaleDateString()} - ${new Date(result.timeRange.end).toLocaleDateString()}\n`;
    output += `Confidence: ${(result.confidence * 100).toFixed(0)}%\n\n`;

    // Group by actionable priority
    const actionableInsights = result.insights.filter((i) => i.actionable);
    const informationalInsights = result.insights.filter((i) => !i.actionable);

    if (actionableInsights.length > 0) {
      output += `**🎯 Actionable Interventions:**\n`;
      actionableInsights.forEach((insight) => {
        output += `\n**${insight.title}**\n${insight.description}\n`;
        if (insight.suggestedActions && insight.suggestedActions.length > 0) {
          insight.suggestedActions.forEach((action) => {
            output += `  • ${action}\n`;
          });
        }
      });
    }

    if (informationalInsights.length > 0) {
      output += `\n**ℹ️ Context & Observations:**\n`;
      informationalInsights.forEach((insight) => {
        output += `\n**${insight.title}**\n${insight.description}\n`;
      });
    }

    pushAssistantMessage?.(output);
  } catch (error) {
    console.error('[Analysis] Intervention analysis failed:', error);
    pushAssistantMessage?.('[Analysis] An error occurred generating recommendations');
  }
}

/**
 * Identify correlations between metrics
 */
async function handleIdentifyCorrelations(context: ActionContext): Promise<void> {
  const { userId, payload, encryptionKey, pushAssistantMessage } = context;
  
  if (!userId) {
    pushAssistantMessage?.('[Analysis] Authentication required');
    return;
  }

  const timeRange = parseDateRange(payload);
  const moduleIds = Array.isArray(payload.moduleIds)
    ? payload.moduleIds.filter((id): id is string => typeof id === 'string')
    : ['ledger', 'atlas', 'hub'];

  pushAssistantMessage?.('🔗 Analyzing correlations across your data...');

  try {
    const dataSnapshots = await gatherCrossModuleData(
      userId,
      moduleIds,
      encryptionKey ?? null,
      timeRange
    );

    const globalSoul = await GlobalProjectionService.getProjection(userId);
    const nsv = globalSoul?.crossFunctionalState ?? null;

    if (!nsv) {
      pushAssistantMessage?.('[Analysis] No neural state data available');
      return;
    }

    const result = await analyzeCrossModuleData(
      context,
      'correlation',
      dataSnapshots,
      nsv,
      timeRange,
      undefined
    );

    if (!result) {
      pushAssistantMessage?.('[Analysis] Could not complete correlation analysis');
      return;
    }

    let output = `\n🔗 **Correlation Analysis**\n`;
    output += `Period: ${new Date(result.timeRange.start).toLocaleDateString()} - ${new Date(result.timeRange.end).toLocaleDateString()}\n`;
    output += `Confidence: ${(result.confidence * 100).toFixed(0)}%\n\n`;

    result.insights.forEach((insight) => {
      output += `**${insight.title}**\n${insight.description}\n`;
      if (insight.relatedMetrics.length > 0) {
        output += `Related: ${insight.relatedMetrics.join(', ')}\n`;
      }
      output += `\n`;
    });

    if (result.visualizationHint) {
      output += `💡 Suggested visualization: ${result.visualizationHint}\n`;
    }

    pushAssistantMessage?.(output);

    // Update GlobalSoul if strong correlations found
    const strongCorrelations = result.insights.filter((i) => i.severity === 'warning' || i.severity === 'critical');
    if (strongCorrelations.length > 0) {
      context.emitSpineEvent('NSV_CALIBRATION_REQUEST', {
        reason: 'correlation_analysis_findings',
        correlations: strongCorrelations.map((i) => i.title)
      });
    }
  } catch (error) {
    console.error('[Analysis] Correlation analysis failed:', error);
    pushAssistantMessage?.('[Analysis] An error occurred during correlation analysis');
  }
}

/**
 * Generate executive summary
 */
async function handleGenerateSummary(context: ActionContext): Promise<void> {
  const { userId, payload, encryptionKey, pushAssistantMessage } = context;
  
  if (!userId) {
    pushAssistantMessage?.('[Analysis] Authentication required');
    return;
  }

  const timeRange = parseDateRange(payload);
  const moduleIds = Array.isArray(payload.moduleIds)
    ? payload.moduleIds.filter((id): id is string => typeof id === 'string')
    : ['ledger', 'atlas', 'hub'];

  pushAssistantMessage?.('📋 Generating executive summary...');

  try {
    const dataSnapshots = await gatherCrossModuleData(
      userId,
      moduleIds,
      encryptionKey ?? null,
      timeRange
    );

    const globalSoul = await GlobalProjectionService.getProjection(userId);
    const nsv = globalSoul?.crossFunctionalState ?? null;

    if (!nsv) {
      pushAssistantMessage?.('[Analysis] No neural state data available');
      return;
    }

    const result = await analyzeCrossModuleData(
      context,
      'summary',
      dataSnapshots,
      nsv,
      timeRange,
      undefined
    );

    if (!result) {
      pushAssistantMessage?.('[Analysis] Could not generate summary');
      return;
    }

    let output = `\n📋 **Executive Summary**\n`;
    output += `${new Date(result.timeRange.start).toLocaleDateString()} - ${new Date(result.timeRange.end).toLocaleDateString()}\n`;
    output += `Data confidence: ${(result.confidence * 100).toFixed(0)}% (${result.dataPoints} data points)\n\n`;

    result.insights.forEach((insight, idx) => {
      if (idx === 0) output += `**Overall Assessment**\n`;
      else if (insight.title.toLowerCase().includes('achievement') || insight.title.toLowerCase().includes('win')) {
        output += `\n**✨ Wins & Achievements**\n`;
      } else if (insight.title.toLowerCase().includes('challenge') || insight.title.toLowerCase().includes('concern')) {
        output += `\n**⚠️ Challenges**\n`;
      } else if (insight.title.toLowerCase().includes('priority') || insight.title.toLowerCase().includes('next')) {
        output += `\n**🎯 Priorities**\n`;
      }
      
      output += `${insight.description}\n`;
    });

    pushAssistantMessage?.(output);

    // Store summary as compacted insight in GlobalSoul
    if (result.insights.length > 0) {
      try {
        if (userId) {
          const summaryText = result.insights[0].description;
          const currentInsights = globalSoul?.compactedInsights ?? [];

          await getAraDataLayer().updateDocument('global_souls', userId, {
            compactedInsights: [
              `[${new Date().toLocaleDateString()}] ${summaryText}`,
              ...currentInsights.slice(0, 9) // Keep last 10 insights
            ],
            lastSync: new Date().toISOString()
          });
        }
      } catch (error) {
        console.error('[Analysis] Failed to update compacted insights:', error);
      }
    }
  } catch (error) {
    console.error('[Analysis] Summary generation failed:', error);
    pushAssistantMessage?.('[Analysis] An error occurred generating summary');
  }
}

// ==================== Registration ====================

export function registerAnalysisActions() {
  // Unit tests reset ActionHub's internal registry without resetting
  // any module-level flags. Make registration idempotent based on the
  // current public ActionHub state.
  const alreadyRegistered = ActionHub.getAllowedActions('ara').includes('analyze_trends');
  if (alreadyRegistered) return;

  const analysisHandlers = {
    analyze_trends: handleAnalyzeTrends,
    compare_periods: handleComparePeriods,
    suggest_interventions: handleSuggestInterventions,
    identify_correlations: handleIdentifyCorrelations,
    generate_summary: handleGenerateSummary
  };

  // Register with orchestrator (available to all modules)
  ActionHub.registerMultiple('ara', analysisHandlers);

  // Register with specific modules that benefit from analysis
  const modules = ['hub', 'ledger', 'atlas', 'soma'];
  modules.forEach((moduleId) => {
    ActionHub.registerMultiple(moduleId, analysisHandlers);
  });

  console.log('[Analysis] Registered 5 analysis actions across modules');
}
