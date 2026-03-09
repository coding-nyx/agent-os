import React, { useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useComponentSelection } from '@/lib/stores/component-selection-store';
import { useScopedConversation } from '@/lib/hooks/use-scoped-conversation';
import { NexusChat } from '@/core/components/NexusChat';
import { X, Sparkles, Target, Zap, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ModuleTheme } from '@/lib/module-manifest';

interface ScopedChatPanelProps {
  moduleId: string;
  themeColor: ModuleTheme;
  allowedActions?: readonly string[];
}

/**
 * ScopedChatPanel
 * 
 * An "Eve-inspired" ephemeral chat overlay that appears when an entity (field, routine, metric)
 * is selected from a dashboard. It provides high-fidelity, focused conversation about
 * that specific entity without cluttering the main module chat.
 */
export function ScopedChatPanel({ 
  moduleId, 
  themeColor = 'indigo',
  allowedActions = ['update_field_value', 'suggest_routine_modification']
}: ScopedChatPanelProps) {
  const { selectedEntity, deselect } = useComponentSelection();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Derive system prompt from selected entity context
  const systemPrompt = useMemo(() => {
    if (!selectedEntity) return '';
    
    const entityJson = JSON.stringify(selectedEntity.data, null, 2);
    return `
You are a specialized assistant for the ${moduleId} module, operating in SCOPED CONTEXT.
The user has selected a specific ${selectedEntity.type}: "${selectedEntity.id}".

ENTITY DATA:
${entityJson}

YOUR GOAL:
1. Provide focused analysis of this specific ${selectedEntity.type}.
2. Help the user understand or modify its values.
3. If the user asks for changes, emit the appropriate action (e.g., update_field_value).

Maintain a professional, high-fidelity tone. Be concise.
`.trim();
  }, [selectedEntity, moduleId]);

  const {
    messages,
    sendMessage,
    clearMessages,
    isLoading,
    streamingText,
    error
  } = useScopedConversation({
    scope: 'scoped',
    allowedActions,
    systemPrompt
  });

  // Auto-clear messages when entity changes or deselects
  useEffect(() => {
    clearMessages();
  }, [selectedEntity?.id, clearMessages]);

  if (!selectedEntity) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, x: 100, scale: 0.95 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, x: 100, scale: 0.95 }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="absolute inset-y-4 right-4 w-96 z-50 flex flex-col"
      >
        <div className={cn(
          "flex-1 flex flex-col overflow-hidden rounded-[2rem] border backdrop-blur-3xl shadow-2xl",
          "bg-black/60 border-white/10"
        )}>
          {/* Futuristic Header */}
          <div className="p-6 border-b border-white/5 flex items-center justify-between bg-gradient-to-b from-white/[0.02] to-transparent">
            <div className="flex items-center gap-3">
              <div className={cn(
                "p-2 rounded-xl bg-white/5 border border-white/10",
                themeColor === 'indigo' ? "text-indigo-400" : "text-cyan-400"
              )}>
                {selectedEntity.type === 'routine' ? <Target size={18} /> : 
                 selectedEntity.type === 'field' ? <Zap size={18} /> : <Activity size={18} />}
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 leading-none mb-1">
                  Scoped Analysis
                </div>
                <h3 className="text-sm font-bold text-white truncate max-w-[180px]">
                  {selectedEntity.id}
                </h3>
              </div>
            </div>
            
            <button 
              onClick={deselect}
              className="p-2 rounded-full hover:bg-white/10 text-white/40 hover:text-white transition-all"
            >
              <X size={20} />
            </button>
          </div>

          {/* Context Banner */}
          <div className="px-6 py-3 bg-white/[0.02] border-b border-white/5 flex items-center gap-2">
            <Sparkles size={12} className="text-amber-400 animate-pulse" />
            <span className="text-[9px] font-black uppercase tracking-widest text-amber-400/80">
              Neural Link Scoped to {selectedEntity.type}
            </span>
          </div>

          {/* Chat Integration */}
          <div className="flex-1 min-h-0 flex flex-col bg-transparent">
            <NexusChat
              ai={{
                messages,
                isProcessing: isLoading,
                streamingText,
                error,
                quota: null, // Scoped chat is typically for authenticated users
                handleSendMessage: async (content) => {
                  await sendMessage(content);
                }
              }}
              agentName="Nexus Scope"
              themeColor={themeColor}
              placeholder={`Analyze ${selectedEntity.id}...`}
              showInternalSignals={false}
              moduleId={moduleId}
            />
          </div>
          
          {/* Futuristic Footer Decoration */}
          <div className="h-1 w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        </div>
        
        {/* Visual Glow Ornament */}
        <div className={cn(
          "absolute -inset-1 rounded-[2.1rem] blur-2xl -z-10 opacity-20",
          themeColor === 'indigo' ? "bg-indigo-500" : "bg-cyan-500"
        )} />
      </motion.div>
    </AnimatePresence>
  );
}
