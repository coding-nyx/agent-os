import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, Zap, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

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
                <h2 className="text-sm font-black uppercase tracking-widest text-lime-300">New Inquiry</h2>
                <p className="text-xs text-white/40 mt-1">Initialize a new research thread</p>
              </div>
              <button
                onClick={handleClose}
                className="p-2 rounded-xl hover:bg-white/10 text-white/40 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-white/60 uppercase tracking-widest">Research Topic</label>
                <input
                  type="text"
                  autoFocus
                  placeholder="e.g., Quantum Computing Trends"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-lime-500/50 transition-colors"
                />
              </div>

              <div className="space-y-3">
                <label className="text-xs font-bold text-white/60 uppercase tracking-widest">Entry Point</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setMode('standard')}
                    className={cn(
                      "flex flex-col items-center gap-2 p-4 rounded-xl border transition-all text-center",
                      mode === 'standard'
                        ? "bg-lime-500/10 border-lime-500/30 text-lime-300"
                        : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10 hover:text-white/80"
                    )}
                  >
                    <BookOpen size={24} />
                    <div className="space-y-1">
                      <div className="text-sm font-bold">Research Workbench</div>
                      <div className="text-[10px] leading-tight opacity-70">Initialize a collaborative research canvas</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMode('deep')}
                    className={cn(
                      "flex flex-col items-center gap-2 p-4 rounded-xl border transition-all text-center",
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
                  </button>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold text-white/40 hover:text-white hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!topic.trim()}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-lime-400 text-black hover:bg-lime-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Start Inquiry
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
