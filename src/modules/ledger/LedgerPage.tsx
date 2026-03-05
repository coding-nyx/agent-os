import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ModuleLayout } from '@/core/layout/ModuleLayout';
import { ChatInterface } from '@/core/components/ChatInterface';
import { LedgerDashboard } from './components/LedgerDashboard';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { LEDGER_PERSONA } from './personas';
import { useModuleAI } from '@/lib/hooks/use-module-ai';
import { useAuth } from '@/lib/auth-context';
import { UnifiedAuthModal } from '@/core/components/UnifiedAuthModal';
import { AlertTriangle, ShieldAlert } from 'lucide-react';

export default function LedgerPage() {
  const { globalSoul } = useGlobalSoul();
  const { isGuest } = useAuth();
  const [showAuth, setShowAuth] = useState(false);

  const agentAlias = globalSoul?.displayNames?.ledger || 'Dr. Ledger';

  const {
    messages,
    setMessages,
    isProcessing,
    streamingText,
    error,
    quota,
    handleSendMessage
  } = useModuleAI({
    moduleId: 'ledger',
    systemPrompt: LEDGER_PERSONA
  });

  // Hydrate initial greeting if empty
  useEffect(() => {
    if (messages.length === 0 && !isProcessing && !streamingText) {
        setMessages([
          { 
            role: 'assistant', 
            content: `Medical telemetry link active. I am ${agentAlias}, Chief Medical Officer. I am currently monitoring your biological and psychological homeostasis. How can I assist you with your health data today?` 
          }
        ]);
    }
  }, [messages.length, isProcessing, streamingText, setMessages, agentAlias]);

  return (
    <ModuleLayout title="The Ledger" themeColor="cyan">
      <div className="h-full flex flex-col relative overflow-hidden">
        {/* Emergency HUD Banner */}
        <motion.div 
            initial={{ y: -100 }}
            animate={{ y: 0 }}
            className="z-50 w-full bg-amber-500/10 border-b border-amber-500/20 backdrop-blur-xl px-6 py-3 flex items-center justify-between"
        >
            <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center animate-pulse">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                </div>
                <div>
                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-500 italic leading-none">Neural Integrity Protocol</h4>
                    <p className="text-[9px] text-amber-200/40 font-medium tracking-tight mt-1">AGNES Ledger is an AI synthesis tool. Not a substitute for professional medical diagnosis or emergency services.</p>
                </div>
            </div>
            <div className="flex items-center gap-2">
                <span className="text-[8px] font-black uppercase text-amber-500/60 tracking-widest animate-pulse">!! CALL 911 FOR EMERGENCIES !!</span>
                <ShieldAlert className="w-3 h-3 text-amber-500/40" />
            </div>
        </motion.div>

        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            {/* Left Side: Diagnostic Dashboard */}
            <div className="w-full md:w-1/2 lg:w-[40%] h-1/2 md:h-full border-b md:border-b-0 md:border-r border-white/5 overflow-y-auto no-scrollbar">
            <LedgerDashboard soul={globalSoul as any} />
            </div>
            
            {/* Right Side: Chat Interface */}
            <div className="flex-1 h-1/2 md:h-full overflow-hidden">
            <ChatInterface 
                messages={streamingText ? [...messages, { role: 'assistant', content: streamingText }] : messages}
                onSendMessage={handleSendMessage}
                isLoading={isProcessing && !streamingText}
                themeColor="cyan"
                agentName={agentAlias}
                placeholder="Input symptoms or request diagnostic analysis..."
                error={error}
                isGuestTrial={isGuest}
                quota={quota}
                onQuotaExhausted={() => setShowAuth(true)}
                onRetry={() => {
                    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
                    if (lastUserMsg) handleSendMessage(lastUserMsg.content);
                }}
            />
            </div>
        </div>
        
        <UnifiedAuthModal isOpen={showAuth} onClose={() => setShowAuth(false)} mode="global" />
      </div>
    </ModuleLayout>
  );
}
