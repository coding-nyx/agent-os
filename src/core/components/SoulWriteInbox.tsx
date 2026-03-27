import React, { useEffect, useMemo, useState } from 'react';
import { Check, X, Inbox, Shield } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useDataLayer } from '@/lib/data-layer/provider';
import { Spine } from '@/lib/spine/spine-event-bus';
import { GlobalProjectionService } from '@/lib/services/global-projection-service';
import type { NexusRecord } from '@/lib/data-layer';
import type { SoulWriteRequest } from '@/lib/types';
import { cn } from '@/lib/utils';

type SoulWriteRecord = NexusRecord<SoulWriteRequest>;

export function SoulWriteInbox() {
  const { user, isGuest } = useAuth();
  const dataLayer = useDataLayer();
  const [requests, setRequests] = useState<SoulWriteRecord[]>([]);
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.uid || isGuest) return;
    const collection = `users/${user.uid}/pending_soul_writes`;
    const unsubscribe = dataLayer.subscribeToQuery<SoulWriteRequest>(
      {
        collection,
        where: [{ field: 'status', op: '==', value: 'pending' }],
      },
      (docs) => {
        const sorted = [...docs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setRequests(sorted);
        if (docs.length > 0) setOpen(true);
      },
    );
    return () => unsubscribe();
  }, [dataLayer, isGuest, user?.uid]);

  useEffect(() => {
    return Spine.on('SOUL_WRITE_REQUESTED', () => {
      setOpen(true);
    });
  }, []);

  const pendingCount = requests.length;

  const handleApprove = async (id: string) => {
    if (!user?.uid) return;
    setBusyId(id);
    try {
      await GlobalProjectionService.approveSoulWrite(id, user.uid, dataLayer);
    } catch (err) {
      console.error('[SoulWriteInbox] Approve failed:', err);
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (id: string) => {
    if (!user?.uid) return;
    setBusyId(id);
    try {
      await GlobalProjectionService.rejectSoulWrite(id, user.uid, dataLayer);
    } catch (err) {
      console.error('[SoulWriteInbox] Reject failed:', err);
    } finally {
      setBusyId(null);
    }
  };

  const headerLabel = useMemo(() => {
    if (pendingCount === 0) return 'Soul Writes';
    return `Soul Writes (${pendingCount})`;
  }, [pendingCount]);

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  if (!user?.uid || isGuest) return null;

  return (
    <div className={cn('fixed bottom-6 left-6 z-[var(--z-overlay)] max-w-[440px]')}>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-full border border-white/[0.12] bg-slate-900/85 backdrop-blur-xl text-[11px] uppercase tracking-[0.18em] text-emerald-200/80 shadow-lg"
          aria-label="Open Soul Write inbox"
        >
          <Shield className="w-3.5 h-3.5 text-emerald-300/80" />
          Soul Writes
          {pendingCount > 0 && (
            <span className="ml-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 px-1.5 py-0.5 text-[11px] font-bold text-emerald-200">
              {pendingCount}
            </span>
          )}
        </button>
      )}

      <div
        className={cn(
          'rounded-2xl border border-white/[0.12] bg-slate-900/90 backdrop-blur-xl shadow-2xl overflow-hidden',
          !open && 'hidden',
        )}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.09]">
          <div className="flex items-center gap-2 text-xs font-semibold text-white/70">
            <Shield className="w-3.5 h-3.5 text-emerald-300/80" />
            {headerLabel}
          </div>
          <button
            onClick={() => setOpen(false)}
            className="text-[11px] text-white/40 hover:text-white/70 transition"
          >
            Close
          </button>
        </div>

        <div className="max-h-[360px] overflow-y-auto no-scrollbar">
          {requests.length === 0 ? (
            <div className="px-4 py-6 text-[11px] text-white/40">No pending requests.</div>
          ) : (
            <ul className="divide-y divide-white/5">
              {requests.map((req) => (
                <li key={req.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[11px] font-semibold text-white/85 truncate">
                          {req.moduleId} — {req.field}
                        </p>
                        <span className="text-[11px] uppercase tracking-[0.18em] text-emerald-300/70 border border-emerald-500/30 px-1.5 py-0.5 rounded-full">
                          Pending
                        </span>
                      </div>
                      <p className="text-[11px] text-white/45 mt-1">
                        Requested by {req.requestedBy} · {timeAgo(req.createdAt)}
                      </p>
                      {req.reason && (
                        <p className="text-[11px] text-white/55 mt-1">{req.reason}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleReject(req.id)}
                        disabled={busyId === req.id}
                        className="w-8 h-8 rounded-lg border border-white/[0.12] bg-white/[0.045] hover:bg-white/10 text-white/60 flex items-center justify-center disabled:opacity-50"
                        aria-label="Reject soul write"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleApprove(req.id)}
                        disabled={busyId === req.id}
                        className="w-8 h-8 rounded-lg border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 flex items-center justify-center disabled:opacity-50"
                        aria-label="Approve soul write"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
