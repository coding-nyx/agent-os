import React, { ReactNode } from 'react';
import { ChatInterface } from './ChatInterface';
import { useAuth } from '@/lib/auth-context';
import { UnifiedAuthModal } from './UnifiedAuthModal';
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
    authMode?: 'global' | 'therapy' | 'trainer';
    showInternalSignals?: boolean;
}

export function NexusChat({ 
    ai, 
    agentName, 
    themeColor, 
    placeholder, 
    onActionParsed, 
    headerActions,
    authMode = 'global',
    showInternalSignals = true
}: NexusChatProps) {
    const { isGuest } = useAuth();
    const [showAuth, setShowAuth] = React.useState(false);
    const { messages, isProcessing, streamingText, error, quota, handleSendMessage } = ai;
    const streamAnalysis = stripInternalTags(streamingText || '');
    const visibleStreamingText = streamAnalysis.publicText.trim();
    const hasVisibleStream = visibleStreamingText.length > 0;
    const hasRawStream = (streamingText || '').trim().length > 0;

    const transientStreamMessage = (() => {
        if (!hasRawStream) return null;
        if (showInternalSignals) {
            return { role: 'assistant', content: streamingText };
        }
        if (hasVisibleStream) {
            return { role: 'assistant', content: visibleStreamingText };
        }
        return null;
    })();

    const renderedMessages = transientStreamMessage
        ? [...messages, transientStreamMessage]
        : messages;

    return (
        <div className="flex-1 h-full relative overflow-hidden">
            <ChatInterface 
                messages={renderedMessages}
                onSendMessage={(content) => handleSendMessage(content, onActionParsed)}
                isLoading={isProcessing}
                themeColor={themeColor}
                agentName={agentName}
                placeholder={placeholder}
                error={error}
                isGuestTrial={isGuest}
                quota={quota}
                onQuotaExhausted={() => setShowAuth(true)}
                showInternalSignals={showInternalSignals}
                onRetry={() => {
                    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
                    if (lastUserMsg) handleSendMessage(lastUserMsg.content, onActionParsed);
                }}
            />
            
            {headerActions && (
                <div className="absolute top-4 right-8 z-50 flex gap-3">
                    {headerActions}
                </div>
            )}

            <UnifiedAuthModal isOpen={showAuth} onClose={() => setShowAuth(false)} mode={authMode} />
        </div>
    );
}
