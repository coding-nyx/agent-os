import React, { ReactNode, useState } from 'react';
import { ChatInterface } from './ChatInterface';
import { useAuth } from '@/lib/auth-context';
import type { ModuleTheme } from '@/lib/module-manifest';
import { UnifiedAuthModal, AuthMode } from './UnifiedAuthModal';
import { stripInternalTags } from '@/llm-engine/sanitize';
import type { Message, GuestQuota, MessageContent } from '@/lib/types';
import { Maximize2, Minimize2, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/lib/stores/ui-store';

interface NexusChatProps {
    ai: {
        messages: Message[];
        isProcessing: boolean;
        streamingText: string;
        error: string | null;
        quota: GuestQuota | null;
        handleSendMessage: (content: MessageContent, onActionParsed?: (type: string, payload: Record<string, unknown>) => void) => Promise<void>;
    };
    agentName: string;
    themeColor: ModuleTheme;
    placeholder?: string;
    onActionParsed?: (type: string, payload: Record<string, unknown>) => void;
    headerActions?: ReactNode;
    authMode?: AuthMode;
    showInternalSignals?: boolean;
    renderCustomActions?: () => ReactNode;
    renderMessageActions?: (message: Message, index: number) => ReactNode;
    moduleId?: string;
    onFocusModeChange?: (isFocus: boolean) => void;
}

export function NexusChat({ 
    ai, 
    agentName, 
    themeColor, 
    placeholder, 
    onActionParsed, 
    headerActions,
    authMode = 'global',
    showInternalSignals = true,
    renderCustomActions,
    renderMessageActions,
    moduleId,
    onFocusModeChange
}: NexusChatProps) {
    const { isGuest } = useAuth();
    const [showAuth, setShowAuth] = React.useState(false);
    const { isFocusMode, toggleFocusMode } = useUIStore();
    const { messages, isProcessing, streamingText, error, quota, handleSendMessage } = ai;

    const handleToggleFocus = () => {
        toggleFocusMode();
        onFocusModeChange?.(!isFocusMode);
    };
    
    // streamingText is now already cleaned by the Orchestrator delta logic
    const visibleStreamingText = streamingText.trim();
    const hasVisibleStream = visibleStreamingText.length > 0;

    const transientStreamMessage = (() => {
        if (!hasVisibleStream) return null;
        return { role: 'assistant' as const, content: visibleStreamingText };
    })();

    const renderedMessages = transientStreamMessage
        ? [...messages, transientStreamMessage]
        : messages;

    return (
        <div className={cn(
            "flex-1 flex flex-col h-full min-h-0 relative transition-all duration-700",
            isFocusMode ? "bg-black/40 backdrop-blur-3xl" : ""
        )}>
            <ChatInterface 
                messages={renderedMessages}
                onSendMessage={(content) => handleSendMessage(content, onActionParsed)}
                isLoading={isProcessing && !hasVisibleStream}
                isProcessing={isProcessing}
                themeColor={themeColor}
                agentName={agentName}
                placeholder={placeholder}
                error={error}
                isGuestTrial={isGuest}
                quota={quota ?? undefined}
                onQuotaExhausted={() => setShowAuth(true)}
                showInternalSignals={showInternalSignals && !isFocusMode}
                renderCustomActions={renderCustomActions}
                renderMessageActions={renderMessageActions}
                moduleId={moduleId}
                isFocusMode={isFocusMode}
                headerActions={
                  <div className="flex items-center gap-4">
                      <button
                        onClick={handleToggleFocus}
                        className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center transition-all border",
                          isFocusMode 
                            ? "bg-white/10 border-white/20 text-white shadow-[0_0_15px_rgba(255,255,255,0.1)]" 
                            : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10 hover:text-white"
                        )}
                        title={isFocusMode ? "Exit Focus" : "Enter Deep Focus"}
                      >
                        {isFocusMode ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                      <div className={cn("transition-all duration-500", isFocusMode ? "opacity-0 pointer-events-none scale-95" : "opacity-100")}>
                          {headerActions}
                      </div>
                  </div>
                }
                onRetry={() => {
                    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
                    if (lastUserMsg) {
                      const content = typeof lastUserMsg.content === 'string'
                        ? lastUserMsg.content
                        : lastUserMsg.content.filter(p => p.type === 'text').map(p => (p as any).text).join(' ');
                      handleSendMessage(content, onActionParsed);
                    }
                }}
            />

            <UnifiedAuthModal isOpen={showAuth} onClose={() => setShowAuth(false)} mode={authMode} />
        </div>
    );
}
