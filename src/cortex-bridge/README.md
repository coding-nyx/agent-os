# LLM Engine (`src/llm-engine/`)

**Purpose:** AI orchestration and conversation engine (EXTERNAL BOUNDARY)  
**Last Updated:** 2026-03-10

---

## ⚠️ CRITICAL: External API Boundary

**This directory is treated as a black-box external runtime.**

### Rules for All Developers and AI Assistants:

1. **DO NOT** modify internal engine code unless explicitly requested
2. **DO NOT** import engine internals directly (e.g., `import { Agent } from '@/llm-engine/engine'`)
3. **DO** interact only through provided hooks and interfaces
4. **DO** treat this as you would a third-party npm package

---

## Architecture Overview

The LLM engine is a self-contained AI orchestration system with its own internal architecture:

```
llm-engine/
├── adapters/           # Storage and crypto adapters (dependency inversion)
├── engine/             # Core engine (Agent, Orchestrator, MemoryManager)
│   ├── Agent.ts        # LLM interaction and streaming
│   ├── Orchestrator.ts # Multi-model orchestration
│   ├── MemoryManager.ts# Conversation history management
│   └── ModelRegistry.ts# Model configuration
├── ai-context.tsx      # React provider for engine
├── persona-factory.ts  # Persona creation utilities
├── types.ts            # Engine type definitions
└── sanitize.ts         # Input sanitization
```

**Key Principle:** The engine has ZERO imports from `src/lib/` or `src/modules/`. It is fully decoupled.

---

## How to Interact with the Engine

### 1. Using the `useAI()` Hook

**Primary interface for AI interactions.**

```typescript
import { useAI } from '@/llm-engine/ai-context';

function MyComponent() {
  const { sendMessage, streamMessage, generateJSON, analyzeImage, isInitialized } = useAI();
  
  // 1. Conversational Chat
  const handleSend = async () => {
    const response = await sendMessage({
      userMessage: 'Hello',
      systemPrompt: 'You are a helpful assistant',
      history: previousMessages
    });
  };

  // 2. Structured Data Generation (JSON Mode)
  const handleSynthesis = async () => {
    const data = await generateJSON<{ claim: string }>('Analyze these results...', {
      systemPrompt: 'Respond with JSON only.'
    });
    console.log(data.claim);
  };

  // 3. Vision / Multi-modal Analysis
  const handleOCR = async (url: string) => {
    const text = await analyzeImage(url, 'Extract text from this image', {
      format: 'text'
    });
    console.log(text);
  };
}
```

### 2. Using the `useModuleAI()` Hook

**Recommended for module-level AI integration.** Wraps `useAI()` with module-specific logic.

```typescript
import { useModuleAI } from '@/lib/ai-adapters/module-ai-adapter';

function MyModulePage() {
  const {
    sendMessage,
    isProcessing,
    lastResponse,
    executeAction
  } = useModuleAI({
    moduleName: 'agnes',
    allowedActions: ['UPDATE_PROFILE', 'CREATE_NOTE'],
    onActionComplete: (action, result) => {
      console.log('Action completed:', action);
    }
  });
}
```

### 3. Conversation Context Type

Pass this structure to `sendMessage()` or `streamMessage()`:

```typescript
interface ConversationContext {
  userMessage: string;
  systemPrompt: string;
  history?: Message[];
  insights?: string[];     // From GlobalSoul
  summary?: SessionSummary;// Session context
  onToolCall?: (call: ToolCall) => Promise<any>;
  onChunk?: (chunk: string) => void; // For streaming
}
```

### 4. Message Type

```typescript
interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: {
    actionTags?: string[];
    modelUsed?: string;
    tokensUsed?: number;
  };
}
```

---

## Common Use Cases

### Use Case 1: Simple Question-Answer

```typescript
const { sendMessage } = useAI();

const response = await sendMessage({
  userMessage: 'What is the weather today?',
  systemPrompt: 'You are a helpful assistant.',
  history: []
});

console.log(response.content); // AI response
```

### Use Case 2: Streaming Response

```typescript
const { streamMessage } = useAI();

await streamMessage({
  userMessage: 'Tell me a story',
  systemPrompt: 'You are a storyteller.',
  history: [],
  onChunk: (chunk) => {
    // Update UI with each chunk
    setDisplayText(prev => prev + chunk);
  }
});
```

### Use Case 3: AI with Actions

```typescript
const { sendMessage } = useAI();

await sendMessage({
  userMessage: 'Update my profile name to John',
  systemPrompt: 'You can update user profiles.',
  history: [],
  onToolCall: async (toolCall) => {
    if (toolCall.action === 'UPDATE_PROFILE') {
      await profileService.update(toolCall.params);
      return { success: true, message: 'Profile updated' };
    }
  }
});
```

### Use Case 4: With GlobalSoul Context

```typescript
const { sendMessage } = useAI();
const { globalSoul } = useGlobalSoul();

const response = await sendMessage({
  userMessage: 'How am I doing overall?',
  systemPrompt: 'You are a wellness coach.',
  history: [],
  insights: [
    `Emotional resilience: ${globalSoul.nsv.emotionalResilience}`,
    `Physical readiness: ${globalSoul.nsv.physicalReadiness}`,
    globalSoul.recentInsights.join('\n')
  ]
});
```

---

## Engine Configuration

### Model Providers

The engine supports multiple LLM providers:
- **OpenRouter** (primary: DeepSeek-V3, Grok-Beta, Gemini-Flash)
- **Direct Grok API** (optional fallback)

**Configuration:** API keys from `.env.local` or `localStorage`:
```
VITE_OPENROUTER_API_KEY=...
VITE_GROK_API_KEY=...
```

### Persona System

Personas define AI behavior. Each module has its own personas:

```typescript
// modules/agnes/personas.ts
export const agnesPersonas = {
  supportive: {
    name: 'Supportive Agnes',
    systemPrompt: 'You are a compassionate therapist...',
    modelPreference: 'deepseek'
  }
};

// Usage
import { createPersona } from '@/llm-engine/persona-factory';

const persona = createPersona(agnesPersonas.supportive);
```

---

## Performance Considerations

### Token Management
- Engine automatically manages token limits per model
- Long conversations are summarized to fit context windows
- Use `SessionSummary` to preserve context across sessions

### Streaming
- Always use `streamMessage()` for long-form responses
- Provides better UX (progressive loading)
- Reduces perceived latency

### Error Handling
```typescript
try {
  const response = await sendMessage(context);
} catch (error) {
  if (error.code === 'RATE_LIMIT') {
    // Handle rate limit
  } else if (error.code === 'NO_API_KEY') {
    // Handle missing configuration
  }
}
```

---

## Debugging

### Check Engine Initialization
```typescript
const { isInitialized, error } = useAI();

if (!isInitialized) {
  console.log('Engine not ready:', error);
}
```

### View Engine State (DevTools)
```
React DevTools → Components → AIProvider
```

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| "Engine not initialized" | Missing API keys | Check `.env.local` |
| Empty responses | Invalid system prompt | Verify prompt format |
| Actions not executing | `onToolCall` not provided | Add action handler |
| Rate limit errors | Too many requests | Implement retry logic |

---

## What NOT to Do

### ❌ Don't Import Engine Internals
```typescript
// WRONG
import { Agent } from '@/llm-engine/engine/Agent';
import { Orchestrator } from '@/llm-engine/engine/Orchestrator';

// RIGHT
import { useAI } from '@/llm-engine/ai-context';
```

### ❌ Don't Couple UI to Engine Logic
```typescript
// WRONG
function MyComponent() {
  const agent = new Agent(); // Direct instantiation
}

// RIGHT
function MyComponent() {
  const { sendMessage } = useAI(); // Use hook
}
```

### ❌ Don't Store Engine State in Modules
```typescript
// WRONG
const [agent, setAgent] = useState(new Agent());

// RIGHT
// Engine state managed by AIProvider internally
const { sendMessage } = useAI();
```

---

## When to Modify Engine Code

**Allowed modifications:**
1. **Persona definitions** (module-specific, outside engine)
2. **Action schemas** (app-layer, not engine)
3. **Adapter implementations** (e.g., custom storage adapter)

**Requires explicit approval:**
1. **Internal orchestration logic**
2. **Model registry changes**
3. **Core Agent/Orchestrator refactors**
4. **Memory management algorithms**

---

## Testing Engine Integration

```typescript
// Test basic message flow
describe('AI Integration', () => {
  it('should send message and receive response', async () => {
    const { sendMessage } = useAI();
    
    const response = await sendMessage({
      userMessage: 'Test',
      systemPrompt: 'Echo the user message',
      history: []
    });
    
    expect(response.content).toBeDefined();
  });
});
```

---

## Documentation Maintenance

**Update this README when:**
- New hooks are added to engine interface
- New model providers are supported
- Engine API changes (breaking or non-breaking)
- New error codes are introduced

**Do NOT update for:**
- Internal engine refactors (unless interface changes)
- Performance optimizations
- Bug fixes (unless they change behavior)

---

## See Also

- [CODE_DOCUMENTATION.md](../../CODE_DOCUMENTATION.md) - Overall architecture
- [AGENTS.md](../../AGENTS.md) - Agent protocol
- `src/lib/ai-adapters/` - App-layer AI adapters
- `src/modules/*/personas.ts` - Module-specific AI personas
