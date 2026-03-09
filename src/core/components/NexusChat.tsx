import React, { ReactNode, useState } from 'react';
import { ChatInterface } from './ChatInterface';
import { useAuth } from '@/lib/auth-context';
import type { ModuleTheme } from '@/lib/module-manifest';
import { UnifiedAuthModal, AuthMode } from './UnifiedAuthModal';
import { stripInternalTags } from '@/llm-engine/sanitize';
import type { Message, GuestQuota, MessageContent } from '@/lib/types';
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
}: NexusChatProps) {
    const { isGuest } = useAuth();
    const [showAuth, setShowAuth] = React.useState(false);
    const { isFocusMode } = useUIStore();
    const { messages, isProcessing, streamingText, error, quota, handleSendMessage } = ai;

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
