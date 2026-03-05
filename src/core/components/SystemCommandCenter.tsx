import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Settings, LogOut, Shield, ChevronDown, Activity, Bell, Lock, Unlock, Clock } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useVault, VaultPersistenceMode } from '@/lib/vault-context';
import { GlassCard } from './GlassCard';

export function SystemCommandCenter() {
  const { user, isGuest, logout } = useAuth();
  const { isUnlocked, lockVault, persistenceMode, setPersistenceMode } = useVault();
  const [isOpen, setIsOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const identityLabel = isUnlocked ? 'SECURE_NODE' : isGuest ? 'GUEST_LINK' : 'PENDING_HANDSHAKE';

  const togglePersistence = () => {
      setPersistenceMode(persistenceMode === 'STRICT' ? 'SESSION' : 'STRICT');
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
            <div className="fixed inset-0 z-0" onClick={() => { setIsOpen(false); setShowSettings(false); }} />
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="absolute right-0 mt-3 w-72 z-10"
            >
              <GlassCard className="p-4 border-white/10 shadow-2xl overflow-hidden">
                <AnimatePresence mode="wait">
                  {!showSettings ? (
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
                            <span className="text-[10px] font-bold uppercase tracking-widest italic">Purge Memory</span>
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
