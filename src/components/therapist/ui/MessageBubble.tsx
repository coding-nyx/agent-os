
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion } from 'framer-motion';
import { Message } from '../../../lib/ai/types';
import { Brain, ChevronDown, ChevronRight } from 'lucide-react';

interface MessageBubbleProps {
  message: Message;
  isLast?: boolean;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const [showThought, setShowThought] = useState(false);

  if (isSystem) return null; // Generally hide system prompts

  // Parse for <thought> block
  let thoughtContent = '';
  let displayContent = message.content;

  const thoughtMatch = message.content.match(/<thought>([\s\S]*?)<\/thought>/);
  if (thoughtMatch) {
    thoughtContent = thoughtMatch[1].trim();
    displayContent = message.content.replace(thoughtMatch[0], '').trim();
  } else {
    // Handle streaming case (incomplete tag)
    const openMatch = message.content.match(/<thought>([\s\S]*)/);
    if (openMatch) {
       thoughtContent = openMatch[1].trim();
       displayContent = message.content.replace(openMatch[0], '').trim();
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} mb-6`}
    >
      <div
        className={`relative max-w-[85%] sm:max-w-[75%] px-5 py-4 text-[15px] leading-relaxed shadow-sm transition-all hover:shadow-md ${
          isUser
            ? 'bg-gradient-to-br from-indigo-600 to-violet-600 text-white rounded-2xl rounded-tr-sm shadow-indigo-500/20'
            : 'bg-white/95 dark:bg-slate-800/95 backdrop-blur-md text-slate-800 dark:text-slate-100 border border-slate-200/60 dark:border-slate-700/60 rounded-2xl rounded-tl-sm shadow-slate-200/50 dark:shadow-none'
        }`}
      >
        {/* Internal Monologue (Debug View) */}
        {!isUser && thoughtContent && (
            <div className="mb-4 border-b border-slate-200 dark:border-slate-700 pb-3">
                <button
                    onClick={() => setShowThought(!showThought)}
                    className="flex items-center gap-2 text-xs font-bold text-amber-600 dark:text-amber-500 uppercase tracking-widest hover:opacity-80 transition-opacity w-full text-left"
                >
                    <Brain className="w-3 h-3" />
                    Internal Monologue
                    {showThought ? <ChevronDown className="w-3 h-3 ml-auto" /> : <ChevronRight className="w-3 h-3 ml-auto" />}
                </button>

                {showThought && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        className="mt-2 text-xs font-mono text-slate-600 dark:text-slate-400 bg-amber-50 dark:bg-amber-900/10 p-3 rounded-lg border border-amber-100 dark:border-amber-900/30 whitespace-pre-wrap leading-relaxed"
                    >
                        {thoughtContent}
                    </motion.div>
                )}
            </div>
        )}

        <div className={`markdown-body ${isUser ? 'user-markdown' : 'therapist-markdown'}`}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                // Paragraphs: Add relaxed line height & spacing
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                p: ({ node, ...props }) => <p className="mb-3 last:mb-0 leading-7 font-normal" {...props} />,
                
                // Bold: Make it pop slightly
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                strong: ({ node, ...props }) => (
                  <strong className={`font-semibold ${isUser ? 'text-white' : 'text-indigo-900 dark:text-indigo-300'}`} {...props} />
                ),
                
                // Italic/Actions: Serif styling for therapist actions (*smiles*)
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                em: ({ node, ...props }) => (
                  <em className={`block my-1 text-sm font-serif opacity-90 ${isUser ? 'text-indigo-100' : 'text-slate-500 dark:text-slate-400'}`} {...props} />
                ),
                
                // Lists: Custom markers
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                ul: ({ node, ...props }) => <ul className="list-disc pl-5 mb-3 space-y-1 marker:text-current/60" {...props} />,
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                ol: ({ node, ...props }) => <ol className="list-decimal pl-5 mb-3 space-y-1 marker:text-current/60" {...props} />,
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                li: ({ node, ...props }) => <li className="pl-1" {...props} />,
                
                // Blockquotes (Insights): Card-like styling
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                blockquote: ({ node, ...props }) => (
                    <blockquote 
                        className={`border-l-4 pl-4 py-2 my-3 text-sm italic rounded-r-md ${
                            isUser 
                            ? 'border-white/40 bg-white/10 text-indigo-50' 
                            : 'border-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-200'
                        }`} 
                        {...props} 
                    />
                ),
                
                // Links: Underline & transition
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                a: ({ node, ...props }) => (
                    <a className="underline underline-offset-2 hover:opacity-80 transition-opacity decoration-current/50" target="_blank" rel="noopener noreferrer" {...props} />
                ),

                // Code/Pre: Inline code blocks
                // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
                code: ({ node, className, children, ...props }: any) => {
                    const match = /language-(\w+)/.exec(className || '')
                    return !match ? (
                        <code className={`px-1.5 py-0.5 rounded text-sm font-mono ${isUser ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-900 text-pink-600 dark:text-pink-400'}`} {...props}>
                            {children}
                        </code>
                    ) : (
                        <pre className="overflow-x-auto p-3 rounded-lg bg-slate-900 text-slate-100 text-sm my-2">
                             <code className={className} {...props}>
                                {children}
                            </code>
                        </pre>
                    )
                }
              }}
            >
              {displayContent || (isUser ? '' : (thoughtContent ? 'Thinking...' : ''))}
            </ReactMarkdown>
        </div>
      </div>
    </motion.div>
  );
}
