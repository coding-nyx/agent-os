import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Settings, LogOut, Shield, ChevronDown, Activity, Lock, Unlock, Clock, Trash2, AlertTriangle, Zap, Check, Sparkles, Circle, Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import { useVault } from '@/lib/vault-context';
import { useGlobalSoulActions } from '@/lib/global-soul-context';
import { SoulTerminationService } from '@/lib/services/soul-termination-service';
import { GlassCard } from './GlassCard';
import { NeuralButton } from './NeuralButton';
import { VaultPopoverPanel } from './VaultPopoverPanel';
import { useNotifications } from '@/lib/notifications/NotificationContext';

export function SystemCommandCenter() {
  const { user, isGuest, profile, logout, refreshProfile } = useAuth();
  const { unreadCount } = useNotifications();
  const { refreshGlobalSoul } = useGlobalSoulActions();
  const { isUnlocked, lockVault, persistenceMode, setPersistenceMode } = useVault();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [purgeStep, setPurgeStep] = useState<'IDLE' | 'CONFIRM' | 'FINAL_WARNING' | 'DELETING'>('IDLE');

  const identityLabel = isUnlocked ? 'SECURE_NODE' : isGuest ? 'GUEST_LINK' : 'PENDING_HANDSHAKE';

  const selectPersistence = (mode: 'STRICT' | 'SESSION') => {
    setPersistenceMode(mode);
  };

  React.useEffect(() => {
    const handler = () => {
      setIsOpen(true);
      setShowSettings(true);
    };
    window.addEventListener('agnes:open-security-protocol', handler as EventListener);
    return () => window.removeEventListener('agnes:open-security-protocol', handler as EventListener);
  }, []);

  // Reset state when menu closes
  React.useEffect(() => {
    if (!isOpen) {
        setShowSettings(false);
        setPurgeStep('IDLE');
    }
  }, [isOpen]);


  const handlePurgeSoul = async () => {
    if (!user) return;
    setPurgeStep('DELETING');
    try {
        lockVault();
        await SoulTerminationService.terminateSoul(user.uid);
        await refreshProfile();
        await refreshGlobalSoul();
        setPurgeStep('IDLE');
        setShowSettings(false);
        setIsOpen(false);
        navigate('/nexus', { replace: true });
    } catch (e) {
        console.error("Purge Protocol Failed:", e);
        setPurgeStep('IDLE');
    }
  };

  return (
    <div className="relative pointer-events-auto z-[var(--z-header)]">
      <NeuralButton
        aria-label="User Menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 bg-slate-900/70 backdrop-blur-xl border border-white/[0.12] px-4 py-2 rounded-2xl hover:bg-white/[0.045] transition-all focus:outline-none focus:ring-2 focus:ring-white/50 h-auto"
        as="button"
        variant="ghost"
      >
        <div className="relative">
          <Circle className="w-6 h-6 text-white/60" />
          <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#020205] ${isUnlocked ? 'bg-emerald-500' : isGuest ? 'bg-amber-500' : 'bg-red-500'}`} />
          <AnimatePresence>
            {unreadCount > 0 && (
              <motion.span
                  key="badge"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 28 }}
                  className="absolute -top-1 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-indigo-500 border-2 border-[#010103] flex items-center justify-center"
              >
                  <span className="text-[11px] font-black text-white leading-none">
                      {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        
        <div className="hidden md:flex flex-col items-start pr-2 text-left">
          <span className="text-xs font-black text-white uppercase tracking-widest leading-none mb-1">
            {profile?.preferredName || (user?.email ? user.email.split('@')[0] : 'Incognito')}
          </span>
          <span className="text-[11px] font-bold text-white/60 uppercase tracking-[0.2em]">
            {identityLabel}
          </span>
        </div>
      </NeuralButton>

      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-0 bg-slate-900/50 md:bg-transparent" aria-hidden="true" onClick={() => { setIsOpen(false); setShowSettings(false); setPurgeStep('IDLE'); }} />
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="fixed top-14 md:top-16 right-4 w-[calc(100vw-32px)] sm:w-80 z-[var(--z-modal)] max-w-sm origin-top-right"
            >
              <GlassCard className="p-4 border-white/20 shadow-2xl overflow-hidden bg-[#020205]/90 backdrop-blur-2xl max-h-[85vh] overflow-y-auto scrollbar-ghost">
                <AnimatePresence mode="wait">
                  {purgeStep !== 'IDLE' ? (
                      <motion.div key="purge" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="space-y-6 py-4 text-center">
                          <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4 animate-pulse">
                              <AlertTriangle className="w-8 h-8 text-red-500" />
                          </div>
                          
                          {purgeStep === 'CONFIRM' && (
                              <div className="space-y-6">
                                  <div className="space-y-2">
                                      <h3 className="text-xl font-bold uppercase tracking-tighter text-white font-display">Purge Protocol</h3>
                                      <p className="text-xs text-white/60 font-medium italic leading-relaxed px-4">This will permanently destroy all neural synchronization data across all modules. There is no restoration process.</p>
                                  </div>
                                  <div className="space-y-2">
                                    <NeuralButton variant="ghost" size="sm" className="w-full text-red-500 hover:bg-red-500/10" onClick={() => setPurgeStep('FINAL_WARNING')}>Terminate All Data</NeuralButton>
                                    <NeuralButton variant="ghost" size="sm" className="w-full text-xs font-black uppercase text-white/40 tracking-widest hover:text-white transition-colors h-auto py-1" onClick={() => setPurgeStep('IDLE')}>Abort Protocol</NeuralButton>
                                  </div>
                              </div>
                          )}

                          {purgeStep === 'FINAL_WARNING' && (
                              <div className="space-y-6">
                                  <div className="space-y-2">
                                      <h3 className="text-xl font-bold uppercase tracking-tighter text-red-500 font-display">Neural Overwrite</h3>
                                      <p className="text-xs text-white/60 font-medium italic leading-relaxed px-4">Type CONFIRM to initialize atomic wipe. Your soul will be permanently detached from the nexus.</p>
                                  </div>
                                  <div className="space-y-3">
                                      <NeuralButton size="sm" variant="danger" className="w-full bg-red-600 hover:bg-red-500 shadow-red-500/20" onClick={handlePurgeSoul}>Execute Wipe</NeuralButton>
                                      <NeuralButton variant="ghost" size="sm" className="w-full text-xs font-black uppercase text-white/40 tracking-widest hover:text-white transition-colors h-auto py-1" onClick={() => setPurgeStep('IDLE')}>Cancel Detachment</NeuralButton>
                                  </div>
                              </div>
                          )}

                          {purgeStep === 'DELETING' && (
                              <div className="space-y-4">
                                  <Zap className="w-8 h-8 text-white/60 mx-auto animate-spin" />
                                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-white animate-pulse font-display">Purging Nexus...</p>
                              </div>
                          )}
                      </motion.div>
                  ) : !showSettings ? (
                    <motion.div key="main" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="space-y-4">
                      {/* Identity Section */}
                      <div className="p-3 bg-white/[0.045] rounded-xl border border-white/[0.12]">
                        <div className="flex items-center gap-3 mb-2">
                          <Shield className="w-4 h-4 text-indigo-400" />
                          <span className="text-[11px] font-black text-white/80 uppercase tracking-widest">Neural Identity</span>
                        </div>
                        <p className="text-xs text-white/60 truncate italic">{user?.email || 'Temporary Session User'}</p>
                      </div>

                      {/* Vault inline controls */}
                      <div className="border-t border-white/[0.09] my-1" />
                      <VaultPopoverPanel />

                      {/* Actions */}
                      <div className="space-y-1">
                        <NeuralButton
                          variant="ghost"
                          onClick={() => {
                            setIsOpen(false);
                            navigate('/notifications');
                          }}
                          aria-label="Notifications"
                          className="w-full flex items-center justify-start gap-3 p-3 rounded-xl hover:bg-white/10 text-white/80 hover:text-white transition-all group focus:outline-none focus:ring-2 focus:ring-white/30 h-auto"
                        >
                          <div className="relative">
                            <Bell className="w-5 h-5 opacity-60 group-hover:opacity-100" />
                            {unreadCount > 0 && (
                              <div className="absolute top-0 right-0 w-2 h-2 rounded-full bg-indigo-500 border-2 border-[#010103]" />
                            )}
                          </div>
                          <span className="text-xs font-bold uppercase tracking-widest italic">Notifications</span>
                        </NeuralButton>
                        <NeuralButton 
                            variant="ghost"
                            onClick={() => setShowSettings(true)}
                            aria-label="System Preferences"
                            className="w-full flex items-center justify-start gap-3 p-3 rounded-xl hover:bg-white/10 text-white/80 hover:text-white transition-all group focus:outline-none focus:ring-2 focus:ring-white/30 h-auto"
                        >
                          <Settings className="w-5 h-5 opacity-60 group-hover:opacity-100" />
                          <span className="text-xs font-bold uppercase tracking-widest italic">System Prefs</span>
                        </NeuralButton>
                        <NeuralButton
                          variant="ghost"
                          onClick={() => {
                            setIsOpen(false);
                            navigate('/profile');
                          }}
                          aria-label="Profile Surface"
                          className="w-full flex items-center justify-start gap-3 p-3 rounded-xl hover:bg-white/10 text-white/80 hover:text-white transition-all group focus:outline-none focus:ring-2 focus:ring-white/30 h-auto"
                        >
                          <User className="w-5 h-5 opacity-60 group-hover:opacity-100" />
                          <span className="text-xs font-bold uppercase tracking-widest italic">Profile Surface</span>
                        </NeuralButton>
                        {isUnlocked && (
                          <NeuralButton 
                            variant="ghost"
                            onClick={() => { lockVault(); setIsOpen(false); }}
                            aria-label="Lock Vault"
                            className="w-full flex items-center justify-start gap-3 p-3 rounded-xl hover:bg-amber-500/20 text-amber-500/80 hover:text-amber-400 transition-all group focus:outline-none focus:ring-2 focus:ring-amber-500/50 h-auto"
                          >
                            <Lock className="w-5 h-5 opacity-80 group-hover:opacity-100" />
                            <span className="text-xs font-bold uppercase tracking-widest italic">Purge Local Key</span>
                          </NeuralButton>
                        )}
                      </div>

                      <div className="pt-2 border-t border-white/[0.12]">
                        <NeuralButton 
                          variant="ghost"
                          onClick={() => logout()}
                          aria-label="Log Out"
                          className="w-full flex items-center justify-start gap-3 p-3 rounded-xl hover:bg-red-500/20 text-red-400/80 hover:text-red-400 transition-all group focus:outline-none focus:ring-2 focus:ring-red-500/50 h-auto"
                        >
                          <LogOut className="w-5 h-5 opacity-80 group-hover:opacity-100" />
                          <span className="text-xs font-black uppercase tracking-widest italic">Terminate Link</span>
                        </NeuralButton>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div key="settings" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-6 p-2">
                        <div className="flex items-center gap-2 mb-4">
                            <NeuralButton 
                                variant="ghost" 
                                aria-label="Back" 
                                onClick={() => setShowSettings(false)} 
                                className="text-xs font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-white/50 rounded px-2 py-1 h-auto"
                            >
                                ← Back
                            </NeuralButton>
                        </div>
                        
                        <div className="space-y-4">
                            <h3 className="text-xs font-black uppercase tracking-[0.3em] text-indigo-400 italic border-b border-indigo-500/20 pb-2">Vault Persistence</h3>
                            
                            <div className="space-y-3">
                                 <button
                                     type="button"
                                     onClick={() => selectPersistence('STRICT')}
                                     aria-pressed={persistenceMode === 'STRICT'}
                                     className={`w-full text-left p-4 rounded-2xl border transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${persistenceMode === 'STRICT' ? 'bg-indigo-500/20 border-indigo-500/60' : 'bg-white/[0.05] border-white/[0.12] hover:border-white/20'}`}
                                 >
                                    <div className="flex items-center gap-3 mb-2">
                                        <Shield className="w-5 h-5 text-indigo-400" />
                                        <span className="text-xs font-black uppercase tracking-widest text-white">STRICT_MODE</span>
                                    </div>
                                    <p className="text-[11px] text-white/60 leading-relaxed whitespace-normal">Vault reference is purged on browser refresh. Maximum security.</p>
                                </button>

                                 <button
                                     type="button"
                                     onClick={() => selectPersistence('SESSION')}
                                     aria-pressed={persistenceMode === 'SESSION'}
                                     className={`w-full text-left p-4 rounded-2xl border transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${persistenceMode === 'SESSION' ? 'bg-indigo-500/20 border-indigo-500/60' : 'bg-white/[0.05] border-white/[0.12] hover:border-white/20'}`}
                                 >
                                    <div className="flex items-center gap-3 mb-2">
                                        <Clock className="w-5 h-5 text-indigo-400" />
                                        <span className="text-xs font-black uppercase tracking-widest text-white">SESSION_MODE</span>
                                    </div>
                                    <p className="text-[11px] text-white/60 leading-relaxed whitespace-normal">Vault reference survives page refresh. Purged when tab is closed.</p>
                                </button>
                            </div>
                        </div>

                        <div className="pt-4 border-t border-white/[0.12]">
                            <NeuralButton 
                                variant="ghost"
                                onClick={() => setPurgeStep('CONFIRM')}
                                aria-label="Destroy Neural Soul"
                                className="w-full flex items-center justify-between p-4 rounded-2xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-all group focus:outline-none focus:ring-2 focus:ring-red-500/50 h-auto"
                            >
                                <div className="flex items-center gap-3">
                                    <Trash2 className="w-5 h-5 text-red-500" />
                                    <span className="text-xs font-black uppercase tracking-widest text-red-400 group-hover:text-red-300">Destroy Neural Soul</span>
                                </div>
                                <ChevronDown className="w-4 h-4 text-red-500/40 -rotate-90" />
                            </NeuralButton>
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
