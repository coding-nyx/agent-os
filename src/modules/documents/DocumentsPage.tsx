import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ModuleLayout } from '@/core/layout/ModuleLayout';
import { NexusChat } from '@/core/components/NexusChat';
import { useAuth } from '@/lib/auth-context';
import { useVault } from '@/lib/vault-context';
import { useModuleAI } from '@/lib/hooks/use-module-ai';
import { DOCUMENTS_PERSONA } from './personas';
import { ChatThreadService } from '@/lib/services/chat-thread-service';
import { createNotebookCell, subscribeNotebookCells } from '@/lib/services/notebook-service';
import { saveDocumentRecord, subscribeDocuments } from '@/lib/services/document-service';
import { buildDocumentAnalysisPrompt, parseDocument, validateDocumentFile } from '@/lib/services/doc-ingest-service';
import type { ChatThread, DocumentRecord, NotebookCell } from '@/lib/types';
import { FileUp, Plus, NotebookPen, Trash2, FolderOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NexusHandoffService } from '@/lib/services/nexus-handoff-service';

type DocumentsTab = 'chat' | 'notebook' | 'documents';

export default function DocumentsPage() {
  const { user, isGuest } = useAuth();
  const { isUnlocked, getModuleKey } = useVault();
  const [encryptionKey, setEncryptionKey] = useState<CryptoKey | null>(null);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DocumentsTab>('chat');
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [cells, setCells] = useState<NotebookCell[]>([]);
  const [noteDraft, setNoteDraft] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<'pdf' | 'image' | 'text' | 'other' | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const updatePreview = useCallback((file: File) => {
    setPreviewText(null);
    setPreviewName(file.name);
    const ext = file.name.toLowerCase();
    if (file.type === 'application/pdf' || ext.endsWith('.pdf')) {
      setPreviewType('pdf');
    } else if (file.type.startsWith('image/')) {
      setPreviewType('image');
    } else if (file.type.startsWith('text/') || ext.endsWith('.csv') || ext.endsWith('.md') || ext.endsWith('.markdown')) {
      setPreviewType('text');
    } else {
      setPreviewType('other');
    }
    const nextUrl = URL.createObjectURL(file);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return nextUrl;
    });
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      if (!user?.uid || !isUnlocked) {
        if (mounted) setEncryptionKey(null);
        return;
      }
      const key = await getModuleKey('documents');
      if (mounted) setEncryptionKey(key);
    };
    init();
    return () => { mounted = false; };
  }, [user?.uid, isUnlocked, getModuleKey]);

  useEffect(() => {
    if (!user?.uid || isGuest) return;
    const unsubscribe = ChatThreadService.subscribeThreads(user.uid, 'documents', (next) => {
      setThreads(next);
    });
    return () => unsubscribe();
  }, [user?.uid, isGuest]);

  useEffect(() => {
    if (!user?.uid || isGuest) return;
    if (threads.length === 0) {
      ChatThreadService.createThread(user.uid, 'documents', 'New document thread').then((thread) => {
        setActiveThreadId(thread.id);
      }).catch((error) => console.error('[Documents] Failed to create thread:', error));
      return;
    }
    if (!activeThreadId) {
      setActiveThreadId(threads[0].id);
    }
  }, [threads, activeThreadId, user?.uid, isGuest]);

  useEffect(() => {
    if (!user?.uid || !activeThreadId) return;
    return subscribeDocuments(user.uid, 'documents', activeThreadId, setDocuments);
  }, [user?.uid, activeThreadId]);

  useEffect(() => {
    if (!user?.uid || !activeThreadId || !encryptionKey) return;
    return subscribeNotebookCells(user.uid, 'documents', activeThreadId, encryptionKey, setCells);
  }, [user?.uid, activeThreadId, encryptionKey]);

  const {
    messages,
    isProcessing,
    streamingText,
    error,
    quota,
    handleSendMessage
  } = useModuleAI({
    moduleId: 'documents',
    systemPrompt: DOCUMENTS_PERSONA,
    encryptionKey,
    sessionId: activeThreadId ?? 'current',
    contextPolicy: 'base-context'
  });

  useEffect(() => {
    if (!activeThreadId) return;
    const handoff = NexusHandoffService.consume('documents');
    if (handoff?.content) {
      handleSendMessage(handoff.content);
    }
  }, [activeThreadId, handleSendMessage]);

  useEffect(() => {
    if (!user?.uid || !activeThreadId) return;
    if (messages.length === 0) return;
    ChatThreadService.touchThread(user.uid, 'documents', activeThreadId)
      .catch((err) => console.error('[Documents] Failed to touch thread:', err));
  }, [messages.length, user?.uid, activeThreadId]);

  const handleNewThread = useCallback(async () => {
    if (!user?.uid) return;
    const thread = await ChatThreadService.createThread(user.uid, 'documents', 'New document thread');
    setActiveThreadId(thread.id);
  }, [user?.uid]);

  const handleArchiveThread = useCallback(async (threadId: string) => {
    if (!user?.uid) return;
    await ChatThreadService.archiveThread(user.uid, 'documents', threadId);
    if (activeThreadId === threadId) {
      setActiveThreadId(null);
    }
  }, [user?.uid, activeThreadId]);

  const promptUpload = useCallback(() => {
    setParseError(null);
    fileInputRef.current?.click();
  }, []);

  const handleFileSelected = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!user?.uid || !activeThreadId || !encryptionKey) return;

    const validation = validateDocumentFile(file);
    if (!validation.valid) {
      setParseError(validation.error);
      return;
    }

    updatePreview(file);
    setIsParsing(true);
    setParseError(null);
    try {
      const parsed = await parseDocument(file);
      const record = await saveDocumentRecord({
        userId: user.uid,
        moduleId: 'documents',
        threadId: activeThreadId,
        filename: parsed.metadata.filename,
        fileType: parsed.metadata.fileType === 'image' ? 'image' : parsed.metadata.fileType,
        pageCount: parsed.metadata.pageCount,
        wordCount: parsed.metadata.wordCount,
        extractedTitle: parsed.metadata.extractedTitle,
        notes: parsed.notes,
        text: parsed.text,
        encryptionKey
      });

      await ChatThreadService.updateThread(user.uid, 'documents', activeThreadId, {
        docIds: Array.from(new Set([...(threads.find(t => t.id === activeThreadId)?.docIds ?? []), record.id]))
      });

      const prompt = buildDocumentAnalysisPrompt(parsed);
      await handleSendMessage(prompt);
      if (!previewText && parsed.text) {
        setPreviewText(parsed.text.slice(0, 2000));
      }
      setActiveTab('chat');
    } catch (error) {
      console.error('[Documents] Document parse failed:', error);
      setParseError(error instanceof Error ? error.message : 'Failed to parse document.');
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [user?.uid, activeThreadId, encryptionKey, handleSendMessage, threads, updatePreview, previewText]);

  const handleAddNote = useCallback(async () => {
    if (!user?.uid || !activeThreadId || !noteDraft.trim() || !encryptionKey) return;
    await createNotebookCell({
      userId: user.uid,
      moduleId: 'documents',
      threadId: activeThreadId,
      type: 'markdown',
      content: noteDraft.trim(),
      encryptionKey,
      citations: [],
      docIds: [],
      order: cells.length
    });
    setNoteDraft('');
    setActiveTab('notebook');
  }, [user?.uid, activeThreadId, noteDraft, cells.length, encryptionKey]);

  const lastAssistantMessage = useMemo(() => {
    const reversed = [...messages].reverse();
    return reversed.find((m) => m.role === 'assistant')?.content;
  }, [messages]);

  const handleSaveLastResponse = useCallback(async () => {
    if (!user?.uid || !activeThreadId || !lastAssistantMessage || !encryptionKey) return;
    const content = typeof lastAssistantMessage === 'string'
      ? lastAssistantMessage
      : lastAssistantMessage.filter(p => p.type === 'text').map(p => p.text).join(' ');
    if (!content.trim()) return;
    await createNotebookCell({
      userId: user.uid,
      moduleId: 'documents',
      threadId: activeThreadId,
      type: 'analysis',
      content: content.trim(),
      encryptionKey,
      citations: [],
      docIds: documents.map(d => d.id),
      order: cells.length
    });
    setActiveTab('notebook');
  }, [user?.uid, activeThreadId, lastAssistantMessage, documents, cells.length, encryptionKey]);

  const activeThread = threads.find((t) => t.id === activeThreadId);

  return (
    <ModuleLayout title="Documents" themeColor="slate" moduleId="documents">
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_320px] gap-4 p-4 md:p-6">
        <aside className="panel-card p-4 flex flex-col min-h-0">
          <div className="flex items-center justify-between">
            <h2 className="text-chip text-white/60">Threads</h2>
            <button
              onClick={handleNewThread}
              className="w-8 h-8 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 flex items-center justify-center"
              aria-label="New thread"
            >
              <Plus className="w-4 h-4 text-white/60" />
            </button>
          </div>
          <div className="mt-4 space-y-2 overflow-y-auto pr-1">
            {threads.map((thread) => {
              const isActive = thread.id === activeThreadId;
              return (
                <div key={thread.id} className={cn("group flex items-center gap-2 rounded-panel border px-3 py-2 text-xs", isActive ? "border-white/20 bg-white/10 text-white" : "border-white/5 text-white/60 hover:bg-white/5")}>
                  <button
                    onClick={() => setActiveThreadId(thread.id)}
                    className="flex-1 text-left truncate"
                    title={thread.title}
                  >
                    {thread.title}
                  </button>
                  <button
                    onClick={() => handleArchiveThread(thread.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Archive thread"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-white/40 hover:text-rose-300" />
                  </button>
                </div>
              );
            })}
          </div>
        </aside>

        <section className="panel-card flex flex-col min-h-0">
          <div className="border-b border-white/5 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-chip-soft text-white/60">
                <FolderOpen className="w-4 h-4" />
                {activeThread?.title ?? 'Document Thread'}
              </div>
            <div className="flex items-center gap-2">
              {(['chat', 'notebook', 'documents'] as DocumentsTab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    'px-3 py-1 rounded-full border text-chip-soft text-white/60 flex items-center justify-center',
                    activeTab === tab
                      ? 'border-white/20 text-white bg-white/10'
                      : 'border-white/5 hover:text-white/70'
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 min-h-0">
            {activeTab === 'chat' && (
              <NexusChat
                moduleId="documents"
                ai={{ messages, isProcessing, streamingText, error, quota, handleSendMessage }}
                agentName="Archive"
                themeColor="slate"
                placeholder="Ask for a summary, extract facts, or compare documents..."
                headerActions={
                  <button
                    onClick={promptUpload}
                    className="w-9 h-9 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 flex items-center justify-center"
                    aria-label="Upload document"
                    title="Upload document"
                  >
                    <FileUp className="w-4 h-4 text-white/60" />
                  </button>
                }
              />
            )}
            {activeTab === 'notebook' && (
              <div className="h-full overflow-y-auto p-5 space-y-4">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-white/50">
                    <NotebookPen className="w-4 h-4" />
                    Notebook
                  </div>
                  <div className="mt-3 flex flex-col gap-3">
                    <textarea
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      rows={3}
                      placeholder="Write a note or add a summary..."
                      className="w-full rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white/80 focus:outline-none focus:ring-2 focus:ring-white/10"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={handleAddNote}
                        className="px-4 py-2 rounded-xl border border-white/10 bg-white/10 text-xs font-black uppercase tracking-[0.2em] text-white/80 hover:bg-white/20"
                      >
                        Add Note
                      </button>
                      <button
                        onClick={handleSaveLastResponse}
                        className="px-4 py-2 rounded-xl border border-white/10 bg-white/5 text-xs font-black uppercase tracking-[0.2em] text-white/60 hover:text-white/80"
                      >
                        Save Last Response
                      </button>
                    </div>
                  </div>
                </div>

                {cells.length === 0 && (
                  <div className="text-sm text-white/40">No notebook entries yet.</div>
                )}
                {cells.map((cell) => (
                  <div key={cell.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-white/40">{cell.type}</div>
                    <div className="mt-2 text-sm text-white/80 whitespace-pre-wrap">{cell.content}</div>
                  </div>
                ))}
              </div>
            )}
            {activeTab === 'documents' && (
              <div className="h-full overflow-y-auto p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-xs uppercase tracking-[0.2em] text-white/50">Documents</div>
                  <button
                    onClick={promptUpload}
                    className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-[10px] font-black uppercase tracking-[0.2em] text-white/70"
                  >
                    Upload
                  </button>
                </div>
                {documents.length === 0 && (
                  <div className="text-sm text-white/40">No documents uploaded yet.</div>
                )}
                {documents.map((doc) => (
                  <div key={doc.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="text-sm text-white/80">{doc.extractedTitle || doc.filename}</div>
                    <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-white/40">
                      {doc.fileType.toUpperCase()} • {doc.wordCount.toLocaleString()} words
                    </div>
                    {doc.notes.length > 0 && (
                      <ul className="mt-2 text-xs text-white/50 list-disc list-inside">
                        {doc.notes.map((note, idx) => (
                          <li key={idx}>{note}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <aside className="rounded-[24px] border border-white/10 bg-white/[0.02] p-4 flex flex-col gap-4">
          <div className="text-xs uppercase tracking-[0.2em] text-white/50">Evidence Panel</div>
          <button
            onClick={promptUpload}
            className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 px-4 py-3 text-xs font-black uppercase tracking-[0.2em] text-white/70"
          >
            <FileUp className="w-4 h-4" />
            Upload Evidence
          </button>
          {isParsing && (
            <div className="text-xs text-white/60">Parsing document…</div>
          )}
          {parseError && (
            <div className="text-xs text-rose-300">{parseError}</div>
          )}
          {previewUrl && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
              <div className="text-[10px] uppercase tracking-[0.2em] text-white/40">
                Preview {previewName ? `• ${previewName}` : ''}
              </div>
              {previewType === 'image' && (
                <img
                  src={previewUrl}
                  alt={previewName ?? 'Uploaded preview'}
                  className="w-full rounded-xl border border-white/10 object-contain max-h-64"
                />
              )}
              {previewType === 'pdf' && (
                <iframe
                  title={previewName ?? 'PDF preview'}
                  src={previewUrl}
                  className="w-full h-64 rounded-xl border border-white/10 bg-black/30"
                />
              )}
              {previewType === 'text' && previewText && (
                <pre className="text-[11px] text-white/70 whitespace-pre-wrap max-h-48 overflow-y-auto">
                  {previewText}
                </pre>
              )}
              {previewType === 'text' && !previewText && (
                <div className="text-xs text-white/50">Text preview will appear after parsing.</div>
              )}
              {previewType === 'other' && (
                <div className="text-xs text-white/50">Preview not available for this file type.</div>
              )}
            </div>
          )}
          <div className="space-y-3 overflow-y-auto">
            {documents.slice(0, 4).map((doc) => (
              <div key={doc.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                <div className="text-xs text-white/80 truncate">{doc.extractedTitle || doc.filename}</div>
                <div className="mt-1 text-[10px] text-white/40 uppercase tracking-[0.2em]">
                  {doc.fileType.toUpperCase()}
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".pdf,.txt,.csv,.md,.markdown,.png,.jpg,.jpeg,.webp"
        onChange={handleFileSelected}
      />
    </ModuleLayout>
  );
}
