import React, { ReactNode } from 'react';
import { ChatInterface } from './ChatInterface';
import { useAuth } from '@/lib/auth-context';
import { UnifiedAuthModal, AuthMode } from './UnifiedAuthModal';
import { stripInternalTags } from '@/llm-engine/sanitize';

interface NexusChatProps {
    ai: {
        messages: any[];
        isProcessing: boolean;
        streamingText: string;
        error: string | null;
        quota: any;
        handleSendMessage: (content: string, onActionParsed?: any) => Promise<void>;
    };
    agentName: string;
    themeColor: 'indigo' | 'orange' | 'cyan';
    placeholder?: string;
    onActionParsed?: (type: string, payload: any) => void;
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
        return { role: 'assistant', content: visibleStreamingText };
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
                quota={quota}
                onQuotaExhausted={() => setShowAuth(true)}
                showInternalSignals={showInternalSignals}
                renderCustomActions={renderCustomActions}
                moduleId={moduleId}
                headerActions={headerActions}
                onRetry={() => {
                    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
                    if (lastUserMsg) handleSendMessage(lastUserMsg.content, onActionParsed);
                }}
            />

            <UnifiedAuthModal isOpen={showAuth} onClose={() => setShowAuth(false)} mode={authMode} />
        </div>
    );
}
