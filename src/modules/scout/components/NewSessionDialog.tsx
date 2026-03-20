import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, Zap, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralInput } from '@/core/components/NeuralInput';

export interface NewSessionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (topic: string, isDeepResearch: boolean) => void;
}

export function NewSessionDialog({ isOpen, onClose, onSubmit }: NewSessionDialogProps) {
  const [topic, setTopic] = useState('');
  const [mode, setMode] = useState<'standard' | 'deep'>('standard');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;
    onSubmit(topic.trim(), mode === 'deep');
    setTopic('');
    setMode('standard');
    onClose();
  };

  const handleClose = () => {
    setTopic('');
    setMode('standard');
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClose();
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="w-full max-w-lg bg-[#05050a] border border-white/10 rounded-3xl p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-sm font-black uppercase tracking-widest text-[var(--module-color-300)]">New Inquiry</h2>
                <p className="text-xs text-white/40 mt-1">Initialize a new research thread</p>
              </div>
              <NeuralButton
                variant="ghost"
                onClick={handleClose}
                className="p-2 rounded-xl h-auto w-auto min-h-0 min-w-0 border-none hover:bg-white/10 text-white/40"
              >
                <X size={18} />
              </NeuralButton>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <NeuralInput
                  label="Research Topic"
                  autoFocus
                  placeholder="e.g., Quantum Computing Trends"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="bg-white/5 border-white/10 focus:border-[var(--module-accent-ring)]"
                />
              </div>

              <div className="space-y-3">
                <label className="text-xs font-bold text-white/60 uppercase tracking-widest">Entry Point</label>
                <div className="grid grid-cols-2 gap-3">
                  <NeuralButton
                    type="button"
                    onClick={() => setMode('standard')}
                    variant={mode === 'standard' ? 'primary' : 'secondary'}
                    themeColor="lime"
                    className={cn(
                      "flex flex-col items-center gap-2 p-4 rounded-xl transition-all text-center h-auto",
                      mode === 'standard'
                        ? "bg-[var(--module-accent-muted)] border-[var(--module-accent-ring)] text-[var(--module-color-300)]"
                        : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10 hover:text-white/80"
                    )}
                  >
                    <BookOpen size={24} />
                    <div className="space-y-1">
                      <div className="text-sm font-bold">Research Workbench</div>
                      <div className="text-[10px] leading-tight opacity-70">Initialize a collaborative research canvas</div>
                    </div>
                  </NeuralButton>

                  <NeuralButton
                    type="button"
                    onClick={() => setMode('deep')}
                    variant={mode === 'deep' ? 'primary' : 'secondary'}
                    themeColor="indigo"
                    className={cn(
                      "flex flex-col items-center gap-2 p-4 rounded-xl transition-all text-center h-auto",
                      mode === 'deep'
                        ? "bg-violet-500/10 border-violet-500/30 text-violet-300"
                        : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10 hover:text-white/80"
                    )}
                  >
                    <Zap size={24} />
                    <div className="space-y-1">
                      <div className="text-sm font-bold">Deep Protocol</div>
                      <div className="text-[10px] leading-tight opacity-70">Multi-step autonomous search & synthesis</div>
                    </div>
                  </NeuralButton>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <NeuralButton
                  type="button"
                  onClick={handleClose}
                  variant="ghost"
                  className="px-5 py-2.5 rounded-xl text-xs font-bold text-white/40 hover:text-white hover:bg-white/5 transition-colors h-auto"
                >
                  Cancel
                </NeuralButton>
                <NeuralButton
                  type="submit"
                  disabled={!topic.trim()}
                  themeColor="lime"
                  className="px-5 py-2.5 rounded-xl text-xs font-bold text-[var(--module-accent-text)] hover:bg-[var(--module-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors h-auto"
                >
                  Start Inquiry
                </NeuralButton>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
