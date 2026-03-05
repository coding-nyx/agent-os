import { sanitizeJsonPayload } from '@/llm-engine/sanitize';

type ToolCallShape = {
  name?: unknown;
  arguments?: unknown;
};

type ParsedToolCall = {
  type: string;
  payload: Record<string, unknown>;
};

function parseToolCallPayload(rawPayload: string): { type: string; payload: Record<string, unknown> } | null {
  try {
    const parsed = JSON.parse(sanitizeJsonPayload(rawPayload)) as ToolCallShape;
    if (typeof parsed?.name !== 'string' || !parsed.name.trim()) {
      return null;
    }

    let payload: unknown = parsed.arguments ?? {};
    if (typeof payload === 'string') {
      payload = JSON.parse(sanitizeJsonPayload(payload));
    }

    if (!payload || typeof payload !== 'object') {
      payload = {};
    }

    return {
      type: parsed.name,
      payload: payload as Record<string, unknown>
    };
  } catch (e) {
    console.error('Failed to parse <tool_call> payload:', e);
    return null;
  }
}

function parseDelimitedToolCallPayload(rawPayload: string): ParsedToolCall | null {
  const [rawType, ...rest] = rawPayload.split('<tool_sep>');
  const type = rawType?.trim();
  if (!type) return null;

  const rawArgs = rest.join('<tool_sep>').trim();
  if (!rawArgs) {
    return { type, payload: {} };
  }

  try {
    const parsedArgs = JSON.parse(sanitizeJsonPayload(rawArgs));
    if (!parsedArgs || typeof parsedArgs !== 'object') {
      return { type, payload: {} };
    }
    return {
      type,
      payload: parsedArgs as Record<string, unknown>
    };
  } catch (e) {
    console.error('Failed to parse <tool_call_begin> payload arguments:', e);
    return { type, payload: {} };
  }
}

function parseToolCallBlock(rawPayload: string): ParsedToolCall | null {
  const direct = parseToolCallPayload(rawPayload);
  if (direct) return direct;
  return parseDelimitedToolCallPayload(rawPayload);
}

function extractToolCalls(response: string): ParsedToolCall[] {
  const toolCalls: ParsedToolCall[] = [];

  const toolCallRegex = /<tool_call>([\s\S]*?)<\/tool_call>/gi;
  let toolCallMatch: RegExpExecArray | null;
  while ((toolCallMatch = toolCallRegex.exec(response)) !== null) {
    const parsed = parseToolCallBlock(toolCallMatch[1]);
    if (parsed) toolCalls.push(parsed);
  }

  const delimitedToolCallRegex = /<tool_call_begin>([\s\S]*?)<tool_call_end>/gi;
  let delimitedMatch: RegExpExecArray | null;
  while ((delimitedMatch = delimitedToolCallRegex.exec(response)) !== null) {
    const parsed = parseToolCallBlock(delimitedMatch[1]);
    if (parsed) toolCalls.push(parsed);
  }

  return toolCalls;
}

export function extractActionPayloads<TPayload extends object = Record<string, unknown>>(
  response: string,
  actionType: string
): TPayload[] {
  const payloads: TPayload[] = [];

  const actionRegex = new RegExp(`<action type="${actionType}">([\\s\\S]*?)<\\/action>`, 'gi');
  let actionMatch: RegExpExecArray | null;
  while ((actionMatch = actionRegex.exec(response)) !== null) {
    try {
      const parsed = JSON.parse(sanitizeJsonPayload(actionMatch[1])) as TPayload;
      payloads.push(parsed);
    } catch (e) {
      console.error(`Failed to parse action payload for ${actionType}:`, e);
    }
  }

  const toolCalls = extractToolCalls(response);
  for (const parsedToolCall of toolCalls) {
    if (!parsedToolCall || parsedToolCall.type !== actionType) {
      continue;
    }
    payloads.push(parsedToolCall.payload as TPayload);
  }

  return payloads;
}

export function hasActionSignal(response: string, actionType: string): boolean {
  const directAction = new RegExp(`<action type="${actionType}">`, 'i').test(response);
  if (directAction) return true;

  const toolCalls = extractToolCalls(response);
  for (const parsedToolCall of toolCalls) {
    if (parsedToolCall?.type === actionType) {
      return true;
    }
  }
  return false;
}
