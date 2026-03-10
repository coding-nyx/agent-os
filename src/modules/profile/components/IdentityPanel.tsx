import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { User, Mail, Edit3, Check, X, Calendar } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useDataLayer } from '@/lib/data-layer/provider';
import { CoreProfileService } from '@/lib/services/core-profile-service';
import { GlassCard } from '@/core/components/GlassCard';
import { NeuralInput } from '@/core/components/NeuralInput';
import { NeuralButton } from '@/core/components/NeuralButton';

const panelVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

export function IdentityPanel() {
  const { user, isGuest, profile, refreshProfile } = useAuth();
  const dataLayer = useDataLayer();

  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Sync displayName from profile when it loads or changes
  useEffect(() => {
    setDisplayName(profile?.preferredName ?? '');
  }, [profile?.preferredName]);

  const initials = (displayName || user?.email || '?')
    .trim()
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');

  const memberSince = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '—';

  const accountType = isGuest ? 'Guest' : 'Authenticated';

  const handleSave = async () => {
    if (!user?.uid) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      await CoreProfileService.updateProfile(
        user.uid,
        { preferredName: displayName.trim() },
        dataLayer,
      );
      await refreshProfile();
      setIsEditing(false);
    } catch (err) {
      console.error('[IdentityPanel] Failed to save display name:', err);
      setSaveError('Failed to save. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setDisplayName(profile?.preferredName ?? '');
    setSaveError(null);
    setIsEditing(false);
  };

  return (
    <motion.div
      variants={panelVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Avatar + Name */}
      <GlassCard className="p-6 md:p-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
          {/* Initials avatar */}
          <div
            className="shrink-0 w-20 h-20 rounded-3xl flex items-center justify-center text-2xl font-bold text-white uppercase tracking-tight select-none"
            style={{
              background:
                'linear-gradient(135deg, rgba(139,92,246,0.4) 0%, rgba(109,40,217,0.6) 100%)',
              boxShadow: '0 0 30px rgba(139,92,246,0.3), inset 0 1px 0 rgba(255,255,255,0.1)',
              border: '1px solid rgba(139,92,246,0.3)',
            }}
            aria-hidden="true"
          >
            {initials || <User className="w-8 h-8 text-violet-300" />}
          </div>

          <div className="flex-1 min-w-0 space-y-3">
            {/* Display name row */}
            {isEditing ? (
              <div className="space-y-2">
                <NeuralInput
                  label="Display Name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleSave();
                    if (e.key === 'Escape') handleCancel();
                  }}
                  placeholder="Enter your name…"
                  autoFocus
                  maxLength={60}
                  className="focus:border-violet-500/50 focus:ring-violet-500/20"
                />
                {saveError && (
                  <p className="text-[10px] text-rose-400 font-bold uppercase tracking-widest ml-4">
                    {saveError}
                  </p>
                )}
                <div className="flex items-center gap-2 ml-1">
                  <NeuralButton
                    size="sm"
                    onClick={() => void handleSave()}
                    loading={isSaving}
                    className="bg-violet-600 hover:bg-violet-500 border-violet-400/20 shadow-[0_0_15px_rgba(139,92,246,0.3)]"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Save
                  </NeuralButton>
                  <NeuralButton
                    size="sm"
                    variant="secondary"
                    onClick={handleCancel}
                    disabled={isSaving}
                  >
                    <X className="w-3.5 h-3.5" />
                    Cancel
                  </NeuralButton>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 group">
                <h2 className="text-2xl font-bold tracking-tight text-white truncate font-display">
                  {displayName || (
                    <span className="text-white/30">No name set</span>
                  )}
                </h2>
                {!isGuest && (
                  <button
                    onClick={() => setIsEditing(true)}
                    aria-label="Edit display name"
                    className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center hover:bg-violet-500/20 hover:border-violet-400/30 transition-all"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-white/60" />
                  </button>
                )}
              </div>
            )}

            {/* Account type badge */}
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-[0.12em] border ${
                  isGuest
                    ? 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                    : 'bg-violet-500/10 border-violet-500/20 text-violet-300'
                }`}
              >
                <div
                  className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                    isGuest ? 'bg-amber-400' : 'bg-violet-400'
                  }`}
                />
                {accountType}
              </span>
              {profile?.onboardingComplete && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-[0.12em] border bg-emerald-500/10 border-emerald-500/20 text-emerald-300">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Onboarded
                </span>
              )}
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Identity details */}
      <GlassCard className="p-6">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/40 mb-5">
          Account Details
        </h3>
        <div className="space-y-4">
          {/* Email */}
          <div className="flex items-start gap-4">
            <div className="mt-0.5 w-8 h-8 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
              <Mail className="w-4 h-4 text-violet-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-[0.12em] text-white/35 font-bold mb-0.5">
                Email
              </p>
              <p className="text-sm text-white/80 font-medium truncate">
                {user?.email ?? 'guest@local.session'}
              </p>
              <p className="text-[9px] text-white/25 mt-0.5 uppercase tracking-widest font-bold">
                Read-only
              </p>
            </div>
          </div>

          <div className="h-px bg-white/5" />

          {/* Member since */}
          <div className="flex items-start gap-4">
            <div className="mt-0.5 w-8 h-8 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
              <Calendar className="w-4 h-4 text-violet-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-[0.12em] text-white/35 font-bold mb-0.5">
                Member Since
              </p>
              <p className="text-sm text-white/80 font-medium">{memberSince}</p>
            </div>
          </div>
        </div>
      </GlassCard>
    </motion.div>
  );
}
