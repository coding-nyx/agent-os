import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Settings, LogOut, Shield, ChevronDown, Activity, Bell, Lock, Unlock, Clock, Trash2, AlertTriangle, Zap, Check } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useVault, VaultPersistenceMode } from '@/lib/vault-context';
import { GlassCard } from './GlassCard';
import { NeuralButton } from './NeuralButton';
import { deleteDoc, doc } from 'firebase/firestore';
import { getFirebase } from '@/lib/firebase';

export function SystemCommandCenter() {
  const { user, isGuest, logout } = useAuth();
  const { isUnlocked, lockVault, persistenceMode, setPersistenceMode } = useVault();
  const [isOpen, setIsOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [purgeStep, setPurgeStep] = useState<'IDLE' | 'CONFIRM' | 'FINAL_WARNING' | 'DELETING'>('IDLE');

  const identityLabel = isUnlocked ? 'SECURE_NODE' : isGuest ? 'GUEST_LINK' : 'PENDING_HANDSHAKE';

  const togglePersistence = () => {
      setPersistenceMode(persistenceMode === 'STRICT' ? 'SESSION' : 'STRICT');
  };

  const handlePurgeSoul = async () => {
    if (!user) return;
    setPurgeStep('DELETING');
    try {
        const { db } = getFirebase();
        if (db) {
            // Atomic Purge Logic (Wait for all deletions)
            const collections = ['users', 'global_souls', 'module_memory', 'vaults'];
            const modules = ['therapy', 'trainer', 'ledger'];
            
            const deletions = [
                deleteDoc(doc(db, 'users', user.uid)),
                deleteDoc(doc(db, 'global_souls', user.uid)),
                deleteDoc(doc(db, 'vaults', user.uid))
            ];

            modules.forEach(m => {
                deletions.push(deleteDoc(doc(db, 'module_memory', `${user.uid}_${m}`)));
                deletions.push(deleteDoc(doc(db, 'active_sessions', `${user.uid}_${m}`)));
            });

            await Promise.all(deletions);
        }
        await logout();
    } catch (e) {
        console.error("Purge Protocol Failed:", e);
        setPurgeStep('IDLE');
    }
  };

  return (
    <div className="relative pointer-events-auto">
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 bg-black/40 backdrop-blur-xl border border-white/10 px-4 py-2 rounded-2xl hover:bg-white/5 transition-all"
      >
        <div className="relative">
          <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
            <User className="w-4 h-4 text-white/60" />
          </div>
          <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#020205] ${isUnlocked ? 'bg-emerald-500' : isGuest ? 'bg-amber-500' : 'bg-red-500'}`} />
        </div>
        
        <div className="hidden md:flex flex-col items-start pr-2 text-left">
          <span className="text-[9px] font-black text-white uppercase tracking-widest leading-none mb-1">
            {user?.email ? user.email.split('@')[0] : 'Incognito'}
          </span>
          <span className="text-[7px] font-bold text-white/30 uppercase tracking-[0.2em]">
            {identityLabel}
          </span>
        </div>
        <ChevronDown className={`w-3 h-3 text-white/20 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-0" onClick={() => { setIsOpen(false); setShowSettings(false); setPurgeStep('IDLE'); }} />
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="absolute right-0 mt-3 w-80 z-10"
            >
              <GlassCard className="p-4 border-white/10 shadow-2xl overflow-hidden">
                <AnimatePresence mode="wait">
                  {purgeStep !== 'IDLE' ? (
                      <motion.div key="purge" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="space-y-6 py-4 text-center">
                          <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4 animate-pulse">
                              <AlertTriangle className="w-8 h-8 text-red-500" />
                          </div>
                          
                          {purgeStep === 'CONFIRM' && (
                              <div className="space-y-6">
                                  <div className="space-y-2">
                                      <h3 className="text-xl font-black italic uppercase tracking-tighter text-white">Purge Protocol</h3>
                                      <p className="text-[10px] text-white/40 font-medium italic leading-relaxed px-4">This will permanently destroy all neural synchronization data across all modules. There is no restoration process.</p>
                                  </div>
                                  <div className="space-y-2">
                                    <NeuralButton variant="ghost" size="sm" className="w-full text-red-500 hover:bg-red-500/10" onClick={() => setPurgeStep('FINAL_WARNING')}>Terminate All Data</NeuralButton>
                                    <button className="text-[9px] font-black uppercase text-white/20 tracking-widest hover:text-white transition-colors" onClick={() => setPurgeStep('IDLE')}>Abort Protocol</button>
                                  </div>
                              </div>
                          )}

                          {purgeStep === 'FINAL_WARNING' && (
                              <div className="space-y-6">
                                  <div className="space-y-2">
                                      <h3 className="text-xl font-black italic uppercase tracking-tighter text-red-500">Neural Overwrite</h3>
                                      <p className="text-[10px] text-white/40 font-medium italic leading-relaxed px-4">Type CONFIRM to initialize atomic wipe. Your soul will be permanently detached from the nexus.</p>
                                  </div>
                                  <div className="space-y-3">
                                      <NeuralButton size="sm" className="w-full bg-red-600 hover:bg-red-500 shadow-red-500/20" onClick={handlePurgeSoul}>Execute Wipe</NeuralButton>
                                      <button className="text-[9px] font-black uppercase text-white/20 tracking-widest hover:text-white transition-colors" onClick={() => setPurgeStep('IDLE')}>Cancel Detachment</button>
                                  </div>
                              </div>
                          )}

                          {purgeStep === 'DELETING' && (
                              <div className="space-y-4">
                                  <Zap className="w-8 h-8 text-white/60 mx-auto animate-spin" />
                                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white animate-pulse italic">Purging Nexus...</p>
                              </div>
                          )}
                      </motion.div>
                  ) : !showSettings ? (
                    <motion.div key="main" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="space-y-4">
                      {/* Identity Section */}
                      <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                        <div className="flex items-center gap-3 mb-2">
                          <Shield className="w-3 h-3 text-indigo-400" />
                          <span className="text-[9px] font-black text-white/60 uppercase tracking-widest">Neural Identity</span>
                        </div>
                        <p className="text-[10px] text-white/40 truncate italic">{user?.email || 'Temporary Session User'}</p>
                      </div>

                      {/* Actions */}
                      <div className="space-y-1">
                        <button 
                            onClick={() => setShowSettings(true)}
                            className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 text-white/60 hover:text-white transition-all group"
                        >
                          <Settings className="w-4 h-4 opacity-40 group-hover:opacity-100" />
                          <span className="text-[10px] font-bold uppercase tracking-widest italic">System Prefs</span>
                        </button>
                        <button className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 text-white/60 hover:text-white transition-all group">
                          <Activity className="w-4 h-4 opacity-40 group-hover:opacity-100" />
                          <span className="text-[10px] font-bold uppercase tracking-widest italic">Signal Logs</span>
                        </button>
                        {isUnlocked && (
                          <button 
                            onClick={() => { lockVault(); setIsOpen(false); }}
                            className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-amber-500/10 text-amber-500/60 hover:text-amber-500 transition-all group"
                          >
                            <Lock className="w-4 h-4 opacity-40 group-hover:opacity-100" />
                            <span className="text-[10px] font-bold uppercase tracking-widest italic">Purge Local Key</span>
                          </button>
                        )}
                      </div>

                      <div className="pt-2 border-t border-white/5">
                        <button 
                          onClick={() => logout()}
                          className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-red-500/10 text-red-400/60 hover:text-red-400 transition-all group"
                        >
                          <LogOut className="w-4 h-4 opacity-40 group-hover:opacity-100" />
                          <span className="text-[10px] font-black uppercase tracking-widest italic">Terminate Link</span>
                        </button>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div key="settings" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-6 p-2">
                        <div className="flex items-center gap-2 mb-4">
                            <button onClick={() => setShowSettings(false)} className="text-[10px] font-black uppercase tracking-widest text-white/20 hover:text-white transition-colors">← Back</button>
                        </div>
                        
                        <div className="space-y-4">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400 italic border-b border-indigo-500/20 pb-2">Vault Persistence</h3>
                            
                            <div className="space-y-3">
                                <div 
                                    onClick={togglePersistence}
                                    className={`p-4 rounded-2xl border transition-all cursor-pointer ${persistenceMode === 'STRICT' ? 'bg-indigo-500/10 border-indigo-500/40' : 'bg-white/[0.02] border-white/5 opacity-40 hover:opacity-100'}`}
                                >
                                    <div className="flex items-center gap-3 mb-2">
                                        <Shield className="w-4 h-4 text-indigo-400" />
                                        <span className="text-[10px] font-black uppercase tracking-widest">STRICT_MODE</span>
                                    </div>
                                    <p className="text-[9px] text-white/40 leading-relaxed">Vault reference is purged on browser refresh. Maximum security.</p>
                                </div>

                                <div 
                                    onClick={togglePersistence}
                                    className={`p-4 rounded-2xl border transition-all cursor-pointer ${persistenceMode === 'SESSION' ? 'bg-indigo-500/10 border-indigo-500/40' : 'bg-white/[0.02] border-white/5 opacity-40 hover:opacity-100'}`}
                                >
                                    <div className="flex items-center gap-3 mb-2">
                                        <Clock className="w-4 h-4 text-indigo-400" />
                                        <span className="text-[10px] font-black uppercase tracking-widest">SESSION_MODE</span>
                                    </div>
                                    <p className="text-[9px] text-white/40 leading-relaxed">Vault reference survives page refresh. Purged when tab is closed.</p>
                                </div>
                            </div>
                        </div>

                        <div className="pt-4 border-t border-white/5">
                            <button 
                                onClick={() => setPurgeStep('CONFIRM')}
                                className="w-full flex items-center justify-between p-4 rounded-2xl bg-red-500/5 border border-red-500/10 hover:bg-red-500/10 transition-all group"
                            >
                                <div className="flex items-center gap-3">
                                    <Trash2 className="w-4 h-4 text-red-500" />
                                    <span className="text-[10px] font-black uppercase tracking-widest text-red-500/60 group-hover:text-red-500">Destroy Neural Soul</span>
                                </div>
                                <ChevronDown className="w-3 h-3 text-red-500/20 -rotate-90" />
                            </button>
                        </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </GlassCard>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
