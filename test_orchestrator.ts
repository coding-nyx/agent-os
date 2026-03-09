import { Orchestrator } from './src/llm-engine/engine/Orchestrator';

const text = `<thought>
Evidence_Quality: No evidence yet — need to search.
Source_Reliability: N/A
Confidence_Calibration: 0.0 until sources found
Knowledge_Graph_Status: No existing nodes for "test"
Momentum_Check: No prior tracking data — this is a fresh query
Strategy: search_web
</thought>
<action type="search_web">{"query":"test"}</action>`;

const o = new Orchestrator({} as any);
const r = (o as any).finalizeResponse(text, false);
console.log(r);
