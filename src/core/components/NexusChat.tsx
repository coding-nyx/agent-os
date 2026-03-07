import React, { ReactNode } from 'react';
import { ChatInterface } from './ChatInterface';
import { useAuth } from '@/lib/auth-context';
import type { ModuleTheme } from '@/lib/module-manifest';
import { UnifiedAuthModal, AuthMode } from './UnifiedAuthModal';
import { stripInternalTags } from '@/llm-engine/sanitize';
import type { Message, GuestQuota } from '@/lib/types';

interface NexusChatProps {
    ai: {
        messages: Message[];
        isProcessing: boolean;
        streamingText: string;
        error: string | null;
        quota: GuestQuota | null;
        handleSendMessage: (content: string, onActionParsed?: (type: string, payload: Record<string, unknown>) => void) => Promise<void>;
    };
    agentName: string;
    themeColor: ModuleTheme;
    placeholder?: string;
    onActionParsed?: (type: string, payload: Record<string, unknown>) => void;
    headerActions?: ReactNode;
    authMode?: AuthMode;
    showInternalSignals?: boolean;
    renderCustomActions?: () => ReactNode;
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
    moduleId
}: NexusChatProps) {
    const { isGuest } = useAuth();
    const [showAuth, setShowAuth] = React.useState(false);
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
        <div className="flex-1 flex flex-col h-full min-h-0 relative">
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
                showInternalSignals={showInternalSignals}
                renderCustomActions={renderCustomActions}
                moduleId={moduleId}
                headerActions={headerActions}
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
