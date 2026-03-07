import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Zap, Lock, Mail, Key, ArrowRight, Loader2, X, UserPlus, Fingerprint, ShieldCheck } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { useVault } from '@/lib/vault-context';
import { NeuralButton } from './NeuralButton';
import { NeuralInput } from './NeuralInput';
import { cn } from '@/lib/utils';
import { MODULE_MANIFEST, ModuleId, ModuleTheme } from '@/lib/module-manifest';

export type AuthMode = 'global' | ModuleId;

interface UnifiedAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: AuthMode;
}

type ModalState = 'IDENTITY_CHOICE' | 'LOGIN' | 'REGISTER' | 'VERIFY' | 'VAULT_HANDSHAKE';

export function UnifiedAuthModal({ isOpen, onClose, mode }: UnifiedAuthModalProps) {
  const { login, register, enterGuestMode, user, reloadUser, sendVerification, logout, isGuest, refreshProfile } = useAuth();
  const { refreshGlobalSoul } = useGlobalSoul();
  const { unlockVault, isUnlocked, hasVault, lockVault } = useVault();
  const navigate = useNavigate();
  
  const [view, setView] = useState<ModalState>('IDENTITY_CHOICE');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [masterPassword, setMasterPassword] = useState('');
  const [confirmMaster, setConfirmMaster] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const themeClasses: Record<ModuleTheme, { color: string; bg: string; border: string }> = {
    indigo: { color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20' },
    orange: { color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
    cyan: { color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20' },
    emerald: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
    sky: { color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20' },
    lime: { color: 'text-lime-400', bg: 'bg-lime-500/10', border: 'border-lime-500/20' },
    rose: { color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20' },
    fuchsia: { color: 'text-fuchsia-400', bg: 'bg-fuchsia-500/10', border: 'border-fuchsia-500/20' },
    slate: { color: 'text-slate-400', bg: 'bg-slate-500/10', border: 'border-slate-500/20' },
    violet: { color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20' }
  };

  const globalTheme = { color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20', icon: Shield, title: 'Nexus Master Portal' };
  const moduleTheme = mode !== 'global' ? MODULE_MANIFEST[mode] : null;
  const moduleClasses = moduleTheme ? themeClasses[moduleTheme.themeColor] : null;
  const activeTheme = mode === 'global'
    ? globalTheme
    : {
        color: moduleClasses?.color || globalTheme.color,
        bg: moduleClasses?.bg || globalTheme.bg,
        border: moduleClasses?.border || globalTheme.border,
        icon: moduleTheme?.icon || Shield,
        title: moduleTheme ? `${moduleTheme.title} Secure Link` : globalTheme.title
      };

  // Auto-transition from identity to vault if logged in but locked
  useEffect(() => {
      if (user && !isUnlocked && view !== 'VAULT_HANDSHAKE') {
          setView('VAULT_HANDSHAKE');
      }
  }, [user, isUnlocked, view]);

  // Verification Polling
  useEffect(() => {
    if (view === 'VERIFY' && user && !user.emailVerified) {
        pollingRef.current = setInterval(async () => { await reloadUser(); }, 3000);
    }
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [view, user, reloadUser]);

  const reset = () => {
      setView('IDENTITY_CHOICE');
      setError('');
      setLoading(false);
      setMasterPassword('');
      setConfirmMaster('');
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal forceMount>
        <AnimatePresence>
          {isOpen && (
            <>
              <Dialog.Overlay asChild forceMount>
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md" />
              </Dialog.Overlay>

              <Dialog.Content asChild forceMount aria-describedby={undefined}>
                <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="fixed inset-0 z-[101] flex items-center justify-center p-4 pointer-events-none">
                  <div className="relative w-full max-w-md max-h-[90vh] overflow-hidden rounded-[40px] border border-white/10 bg-[#05050a] shadow-[0_0_50px_rgba(0,0,0,1)] flex flex-col pointer-events-auto">
                    <Dialog.Close asChild>
                      <button className="absolute top-6 right-6 text-white/40 hover:text-white transition-colors z-20"><X className="w-5 h-5" /></button>
                    </Dialog.Close>

                    <div className={`p-8 sm:p-10 border-b border-white/5 ${activeTheme.bg} shrink-0`}>
                      <div className="flex items-start gap-5">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border border-white/10 bg-black/40 shadow-2xl shrink-0`}>
                          <activeTheme.icon className={`w-7 h-7 ${activeTheme.color}`} />
                        </div>
                        <div className="flex-1">
                          <Dialog.Title className="text-2xl font-black italic tracking-wider text-white uppercase leading-tight">{activeTheme.title}</Dialog.Title>
                          <p className="text-white/50 text-[9px] uppercase font-black tracking-[0.3em] mt-1">
                              {view === 'VAULT_HANDSHAKE' ? (hasVault ? 'SECURE HANDSHAKE' : 'INITIALIZE VAULT') : view.replace('_', ' ')}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto no-scrollbar">
                      <div className="p-8 sm:p-10">
                      <AnimatePresence mode="wait">
                        {view === 'IDENTITY_CHOICE' && (
                          <motion.div key="choice" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
                            <NeuralButton size="lg" className="w-full justify-between group" onClick={() => { enterGuestMode(); onClose(); }}>
                              <div className="flex items-center gap-3">
                                <Zap className="w-4 h-4 text-amber-400" />
                                <span>Initialize Guest Link</span>
                              </div>
                              <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-all" />
                            </NeuralButton>
                            
                            <div className="relative py-4 flex items-center justify-center">
                                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/5" /></div>
                                <span className="relative px-4 bg-[#05050a] text-[8px] font-black text-white/40 uppercase tracking-[0.4em]">Handshake Required</span>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <button onClick={() => setView('LOGIN')} className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 hover:bg-white/5 transition-all text-center group">
                                    <Key className="w-5 h-5 text-white/40 mx-auto mb-2 group-hover:text-white transition-colors" />
                                    <span className="text-[10px] font-black uppercase tracking-widest text-white/40 group-hover:text-white">Recognize</span>
                                </button>
                                <button onClick={() => setView('REGISTER')} className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 hover:bg-white/5 transition-all text-center group">
                                    <UserPlus className="w-5 h-5 text-white/40 mx-auto mb-2 group-hover:text-white transition-colors" />
                                    <span className="text-[10px] font-black uppercase tracking-widest text-white/40 group-hover:text-white">Initialize</span>
                                </button>
                            </div>
                          </motion.div>
                        )}

                        {view === 'LOGIN' && (
                          <motion.form key="login" onSubmit={async (e) => { e.preventDefault(); setLoading(true); setError(''); try { if (await login(email, password)) { /* Effect handles next */ } else { setError('Auth Failed'); } } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Auth Failed'); } setLoading(false); }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                            <NeuralInput icon={<Mail className="w-4 h-4" />} type="email" placeholder="Identity Email" value={email} onChange={(e) => setEmail(e.target.value)} />
                            <NeuralInput icon={<Lock className="w-4 h-4" />} type="password" placeholder="Account Password" value={password} onChange={(e) => setPassword(e.target.value)} />
                            {error && <p className="text-red-400 text-[10px] text-center font-bold uppercase">{error}</p>}
                            <NeuralButton type="submit" loading={loading} className="w-full">Authenticate Identity</NeuralButton>
                            <button type="button" onClick={() => setView('IDENTITY_CHOICE')} className="w-full text-[9px] font-black text-white/40 hover:text-white uppercase tracking-widest transition-colors">Back to Portal</button>
                          </motion.form>
                        )}

                        {view === 'REGISTER' && (
                          <motion.form key="register" onSubmit={async (e) => { e.preventDefault(); setLoading(true); setError(''); try { if (await register(email, password)) { setView('VERIFY'); } } catch (e: unknown) { if (e instanceof Error && e.message?.toLowerCase().includes('configuration-not-found')) { setError('Firebase Auth not enabled. Enable Email/Password in Console.'); } else { setError(e instanceof Error ? e.message : 'Initialization Failed'); } } setLoading(false); }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                            <NeuralInput icon={<Mail className="w-4 h-4" />} type="email" placeholder="New Identity Email" value={email} onChange={(e) => setEmail(e.target.value)} />
                            <NeuralInput icon={<Lock className="w-4 h-4" />} type="password" placeholder="Account Password" value={password} onChange={(e) => setPassword(e.target.value)} />
                            {error && <p className="text-red-400 text-[10px] text-center font-bold uppercase">{error}</p>}
                            <NeuralButton type="submit" loading={loading} className="w-full text-indigo-400">Create Identity</NeuralButton>
                            <button type="button" onClick={() => setView('IDENTITY_CHOICE')} className="w-full text-[9px] font-black text-white/40 hover:text-white uppercase tracking-widest transition-colors">Back to Portal</button>
                          </motion.form>
                        )}

                        {view === 'VERIFY' && (
                            <motion.div key="verify" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center space-y-8">
                                <div className="w-20 h-20 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto shadow-2xl animate-pulse"><Mail className="w-8 h-8 text-blue-400" /></div>
                                <div className="space-y-3">
                                    <h3 className="text-xl font-black italic uppercase text-white">Handshake Pending</h3>
                                    <p className="text-xs text-white/40 leading-relaxed italic px-4">Identification verified link sent to <span className="text-white">{user?.email}</span>. Click the link to unlock E2EE vault setup.</p>
                                    <div className="pt-2">
                                        <p className="text-[9px] font-black text-amber-500/60 uppercase tracking-[0.2em] animate-pulse">! Check your spam/junk folder if signal is missing !</p>
                                    </div>
                                </div>
                                <div className="flex flex-col gap-4">
                                    <div className="flex items-center justify-center gap-3 text-blue-400/60 font-black text-[10px] uppercase tracking-[0.2em]"><Loader2 className="w-3 h-3 animate-spin" /> Waiting for signal...</div>
                                    <button onClick={() => sendVerification()} className="text-[9px] uppercase font-black text-white/40 hover:text-white tracking-widest">Resend Signal</button>
                                </div>
                            </motion.div>
                        )}

                        {view === 'VAULT_HANDSHAKE' && (
                            <motion.form 
                                key="vault" 
                                onSubmit={async (e) => { 
                                    e.preventDefault(); 
                                    if (!hasVault && masterPassword !== confirmMaster) {
                                        setError("Passwords do not match.");
                                        return;
                                    }
                                    setLoading(true); 
                                    setError('');
                                    try { 
                                        await unlockVault(masterPassword); 
                                        onClose(); 
                                        if (mode !== 'global') {
                                            const target = MODULE_MANIFEST[mode];
                                            if (target?.route) {
                                                navigate(target.route);
                                            }
                                        }
                                    } catch(e:any) { 
                                        setError(e.message); 
                                    } 
                                    setLoading(false); 
                                }} 
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} 
                                className="space-y-6"
                            >
                                <div className={cn("p-5 border rounded-3xl flex items-start gap-4 transition-colors", hasVault ? "bg-emerald-500/5 border-emerald-500/20" : "bg-cyan-500/5 border-cyan-500/20")}>
                                    {hasVault ? <Fingerprint className="w-6 h-6 text-emerald-400 shrink-0 mt-1" /> : <ShieldCheck className="w-6 h-6 text-cyan-400 shrink-0 mt-1" />}
                                    <div className="space-y-1">
                                        <p className="text-xs text-white font-black uppercase italic tracking-tighter">
                                            {hasVault ? 'NEURAL HANDSHAKE' : 'INITIALIZE MASTER VAULT'}
                                        </p>
                                        <p className="text-[10px] text-white/40 leading-relaxed italic">
                                            {hasVault 
                                                ? 'Identify verified. Provide your Master Password to decrypt your soul.' 
                                                : 'Define your Master Password to generate your permanent E2EE keys. Nexus cannot reset this.'}
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <NeuralInput icon={<Shield className={cn("w-4 h-4", hasVault ? "text-emerald-400" : "text-cyan-400")} />} type="password" placeholder={hasVault ? "Master Vault Password" : "Define Master Password"} value={masterPassword} onChange={(e) => setMasterPassword(e.target.value)} />
                                    
                                    {!hasVault && (
                                        <NeuralInput icon={<Lock className="w-4 h-4 text-cyan-400" />} type="password" placeholder="Confirm Master Password" value={confirmMaster} onChange={(e) => setConfirmMaster(e.target.value)} />
                                    )}
                                </div>

                                {error && <p className="text-red-400 text-[10px] text-center font-bold uppercase">{error}</p>}
                                
                                <NeuralButton type="submit" loading={loading} className={cn("w-full", hasVault ? "bg-emerald-600 hover:bg-emerald-500" : "bg-cyan-600 hover:bg-cyan-500 text-white")}>
                                    {hasVault ? 'DECRYPT & SYNC' : 'GENERATE NEURAL KEYS'}
                                </NeuralButton>

                                <div className="flex flex-col gap-2 pt-2 border-t border-white/5">
                                    <button type="button" onClick={() => setView('IDENTITY_CHOICE')} className="w-full text-[9px] font-black text-white/40 hover:text-white uppercase tracking-widest transition-colors">Back to Identity Portal</button>
                                    
                                    <button type="button" onClick={() => { logout(); reset(); }} className="w-full text-[9px] font-black text-red-400/40 hover:text-red-400 uppercase tracking-widest transition-colors italic">Terminate Identity Session</button>
                                </div>
                            </motion.form>
                        )}
                      </AnimatePresence>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </Dialog.Content>
            </>
          )}
        </AnimatePresence>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
