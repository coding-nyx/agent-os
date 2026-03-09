import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useScopedConversation } from '@/lib/hooks/use-scoped-conversation';
import { NexusChat } from '@/core/components/NexusChat';
import { X, Plus, Database, Wand2, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ModuleTheme } from '@/lib/module-manifest';

interface FieldCrudChatPanelProps {
  moduleId: string;
  themeColor: ModuleTheme;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * FieldCrudChatPanel
 * 
 * A specialized "Schema Editor" panel that uses AI to help the user create, 
 * modify, or delete custom fields (biomarkers, exercises, etc.).
 * 
 * Uses the 'field-crud' scope which is ephemeral and focused strictly on 
 * structural data definitions.
 */
export function FieldCrudChatPanel({ 
  moduleId, 
  themeColor = 'indigo',
  isOpen,
  onClose
}: FieldCrudChatPanelProps) {
  
  const systemPrompt = useMemo(() => `
You are a Schema Architect for the AGNES ${moduleId} module.
Your role is to help the user define new custom data fields (extensions).

CAPABILITIES:
1. suggest_field: Propose a field definition based on a user idea.
2. create_field: Formally add a validated field to the module schema.
3. delete_field: Remove an existing custom field.

GUIDELINES:
- For ${moduleId === 'trainer' || moduleId === 'titan' ? 'fitness' : 'health'} contexts, prioritize high-resolution data types (Number, Range 1-10).
- Ensure field IDs are kebab-case and unique.
- Always explain WHY a certain field type or validation rule is recommended.

You are in a FIELD-CRUD scope. Do not discuss personal wellness data unless it relates to the structure of the field being created.
`.trim(), [moduleId]);

  const {
    messages,
    sendMessage,
    isLoading,
    streamingText,
    error
  } = useScopedConversation({
    scope: 'field-crud',
    allowedActions: ['suggest_field', 'create_field', 'delete_field'],
    systemPrompt
  });

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.98 }}
        className="fixed inset-y-8 right-8 w-[450px] z-[60] flex flex-col"
      >
        <div className={cn(
          "flex-1 flex flex-col overflow-hidden rounded-[2.5rem] border backdrop-blur-3xl shadow-[0_0_50px_rgba(0,0,0,0.5)]",
          "bg-black/80 border-white/10"
        )}>
          {/* Neural Header */}
          <div className="p-8 border-b border-white/5 flex items-center justify-between relative overflow-hidden">
            <div className="relative z-10 flex items-center gap-4">
              <div className={cn(
                "w-12 h-12 rounded-2xl flex items-center justify-center border transition-all",
                "bg-white/5 border-white/10 text-white shadow-inner"
              )}>
                <Database size={22} className="text-white/80" />
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.4em] text-white/30 mb-1">
                  Schema_Architect_V2
                </div>
                <h3 className="text-xl font-black italic tracking-tight text-white uppercase">
                  Field <span className="text-white/40">Forge</span>
                </h3>
              </div>
            </div>

            <button 
              onClick={onClose}
              className="relative z-10 p-3 rounded-full hover:bg-white/10 text-white/20 hover:text-white transition-all"
            >
              <X size={24} />
            </button>

            {/* Decorative Neural Grid Background */}
            <div className="absolute inset-0 opacity-10 pointer-events-none">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.1)_1px,transparent_1px)] bg-[length:20px_20px]" />
            </div>
          </div>

          {/* Assistant Identity Strip */}
          <div className="px-8 py-3 bg-white/[0.03] border-b border-white/5 flex items-center gap-3">
            <div className="flex gap-1">
              {[1, 2, 3].map(i => (
                <motion.div 
                  key={i}
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 2, repeat: Infinity, delay: i * 0.4 }}
                  className="w-1 h-1 rounded-full bg-white/40" 
                />
              ))}
            </div>
            <span className="text-[9px] font-black uppercase tracking-[0.25em] text-white/40">
              AI-Augmented Data Definition Active
            </span>
          </div>

          {/* Chat Workspace */}
          <div className="flex-1 min-h-0 flex flex-col bg-transparent p-2">
            <div className="flex-1 rounded-[2rem] overflow-hidden border border-white/5 bg-white/[0.01]">
              <NexusChat
                ai={{
                  messages,
                  isProcessing: isLoading,
                  streamingText,
                  error,
                  quota: null,
                  handleSendMessage: sendMessage
                }}
                agentName="Architect"
                themeColor={themeColor}
                placeholder="Describe a field (e.g. 'Add a 1-10 scale for leg fatigue')"
                showInternalSignals={false}
                moduleId={moduleId}
              />
            </div>
          </div>

          {/* Capability Quick-Actions */}
          <div className="p-6 bg-white/[0.02] border-t border-white/5">
            <div className="flex gap-3">
              <div className="flex-1 p-3 rounded-2xl bg-white/5 border border-white/10 flex flex-col gap-1">
                <Wand2 size={14} className="text-white/40 mb-1" />
                <div className="text-[8px] font-black uppercase tracking-widest text-white/30">Auto_Suggest</div>
                <div className="text-[10px] text-white/60 font-medium">AI-driven mapping</div>
              </div>
              <div className="flex-1 p-3 rounded-2xl bg-white/5 border border-white/10 flex flex-col gap-1">
                <Plus size={14} className="text-white/40 mb-1" />
                <div className="text-[8px] font-black uppercase tracking-widest text-white/30">Manual_Override</div>
                <div className="text-[10px] text-white/60 font-medium">Full schema control</div>
              </div>
            </div>
          </div>
        </div>

        {/* Outer Orbital Glow */}
        <div className="absolute -inset-4 bg-white/[0.02] rounded-[3rem] blur-3xl -z-10" />
      </motion.div>
    </AnimatePresence>
  );
}
