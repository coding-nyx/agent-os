import { useEffect, useMemo, useState } from 'react';
import type { ProposalCard, SilentHistoryEntry } from '@/lib/contracts/orchestration';
import type { ModuleId } from '@/lib/module-manifest';
import { MODULE_MANIFEST } from '@/lib/module-manifest';
import type {
  MasterThreadProposalLifecycle,
  MasterThreadProposalSurface,
} from '@/lib/services/master-thread-service';

function fallbackProposalSurface(proposalCard: ProposalCard): MasterThreadProposalSurface {
  const lifecycle: MasterThreadProposalLifecycle =
    proposalCard.status === 'pending_approval'
      ? 'pending_approval'
      : proposalCard.status === 'deferred'
        ? 'deferred'
        : proposalCard.status === 'blocked'
          ? 'blocked'
          : proposalCard.status === 'draft'
            ? 'draft'
            : proposalCard.executionMode === 'ghost'
              ? 'ghost_executed'
              : proposalCard.executionMode === 'autonomous'
                ? 'auto_approved'
                : 'approved';

  return {
    id: proposalCard.id,
    proposalId: proposalCard.proposalId,
    title: proposalCard.title,
    summary: proposalCard.summary,
    source: proposalCard.source,
    status: proposalCard.status,
    lifecycle,
    approvalRequirement: proposalCard.approvalRequirement,
    executionMode: proposalCard.executionMode,
    historyMode: proposalCard.historyMode,
    dispatchStatus: 'transient',
    runtimeDisposition: 'transient',
    createdAt: '',
    mutable: false,
    origin: 'shell',
    kind: 'runtime_action',
    editableFields: [],
    controls: {
      approve: false,
      defer: false,
      dismiss: false,
      reroute: false,
      edit: false,
    },
  };
}

export interface MasterThreadProposalEditDraft {
  targetModuleId?: ModuleId;
  reason?: string;
}

export interface MasterThreadProposalActionHandlers {
  onApprove?: (proposal: MasterThreadProposalSurface) => void;
  onDismiss?: (proposal: MasterThreadProposalSurface) => void;
  onEdit?: (proposal: MasterThreadProposalSurface, draft: MasterThreadProposalEditDraft) => void;
}

interface UseMasterThreadProposalsParams {
  proposalCard: ProposalCard | null | undefined;
  proposalEntries: MasterThreadProposalSurface[] | undefined;
  onProposalLifecycleChange?: (
    proposalId: string,
    nextLifecycle: Extract<MasterThreadProposalLifecycle, 'draft' | 'deferred'>,
  ) => void;
  proposalActions?: MasterThreadProposalActionHandlers;
  silentHistoryEntries: SilentHistoryEntry[];
}

export interface MasterThreadProposalsState {
  proposals: MasterThreadProposalSurface[];
  selectedProposal: MasterThreadProposalSurface | null;
  selectedProposalId: string | null;
  setSelectedProposalId: (id: string | null) => void;
  canMutateSelectedProposal: boolean;
  canApproveSelectedProposal: boolean;
  canDismissSelectedProposal: boolean;
  canEditSelectedProposal: boolean;
  canRerouteSelectedProposal: boolean;
  isEditingSelectedProposal: boolean;
  setIsEditingSelectedProposal: (editing: boolean) => void;
  editTargetModuleId: ModuleId | '';
  setEditTargetModuleId: (moduleId: ModuleId | '') => void;
  editReason: string;
  setEditReason: (reason: string) => void;
  editableTargetModules: ModuleId[];
  selectedSilentHistoryEntry: SilentHistoryEntry | null;
  selectedSilentHistoryId: string | null;
  setSelectedSilentHistoryId: (id: string | null) => void;
  handleApprove: () => void;
  handleDismiss: () => void;
  handleLifecycleToggle: () => void;
  handleEditSave: () => void;
  handleEditCancel: () => void;
}

export function useMasterThreadProposals({
  proposalCard,
  proposalEntries,
  onProposalLifecycleChange,
  proposalActions,
  silentHistoryEntries,
}: UseMasterThreadProposalsParams): MasterThreadProposalsState {
  const proposals = useMemo(() => {
    if (proposalEntries && proposalEntries.length > 0) return proposalEntries;
    return proposalCard ? [fallbackProposalSurface(proposalCard)] : [];
  }, [proposalCard, proposalEntries]);

  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(proposals[0]?.id ?? null);
  const [isEditingSelectedProposal, setIsEditingSelectedProposal] = useState(false);
  const [editTargetModuleId, setEditTargetModuleId] = useState<ModuleId | ''>('');
  const [editReason, setEditReason] = useState('');
  const [selectedSilentHistoryId, setSelectedSilentHistoryId] = useState<string | null>(null);

  useEffect(() => {
    if (proposals.length === 0) {
      if (selectedProposalId !== null) {
        setSelectedProposalId(null);
      }
      return;
    }

    if (!selectedProposalId || !proposals.some((proposal) => proposal.id === selectedProposalId)) {
      setSelectedProposalId(proposals[0].id);
    }
  }, [proposals, selectedProposalId]);

  const selectedProposal = proposals.find((proposal) => proposal.id === selectedProposalId) ?? proposals[0] ?? null;

  const canMutateSelectedProposal =
    Boolean(selectedProposal?.mutable) &&
    (selectedProposal?.lifecycle === 'draft' || selectedProposal?.lifecycle === 'deferred') &&
    Boolean(onProposalLifecycleChange);
  const canApproveSelectedProposal = Boolean(
    selectedProposal?.controls?.approve && proposalActions?.onApprove,
  );
  const canDismissSelectedProposal = Boolean(
    selectedProposal?.controls?.dismiss && proposalActions?.onDismiss,
  );
  const canEditSelectedProposal = Boolean(selectedProposal?.controls?.edit && proposalActions?.onEdit);
  const canRerouteSelectedProposal = Boolean(
    selectedProposal?.controls?.reroute && proposalActions?.onEdit,
  );

  useEffect(() => {
    if (!selectedProposal || !canEditSelectedProposal) {
      setIsEditingSelectedProposal(false);
      setEditTargetModuleId('');
      setEditReason('');
      return;
    }

    setEditTargetModuleId(selectedProposal.targetModuleId ?? '');
    setEditReason(selectedProposal.editReason ?? '');
  }, [canEditSelectedProposal, selectedProposal]);

  useEffect(() => {
    setIsEditingSelectedProposal(false);
  }, [selectedProposalId]);

  const editableTargetModules = useMemo(
    () =>
      Object.keys(MODULE_MANIFEST).filter(
        (moduleId): moduleId is ModuleId => moduleId !== 'ara',
      ),
    [],
  );

  const selectedSilentHistoryEntry = useMemo(
    () => silentHistoryEntries.find((entry) => entry.id === selectedSilentHistoryId) ?? null,
    [selectedSilentHistoryId, silentHistoryEntries],
  );

  useEffect(() => {
    if (selectedSilentHistoryId && !selectedSilentHistoryEntry) {
      setSelectedSilentHistoryId(null);
    }
  }, [selectedSilentHistoryEntry, selectedSilentHistoryId]);

  const handleApprove = () => {
    if (selectedProposal) {
      proposalActions?.onApprove?.(selectedProposal);
    }
  };

  const handleDismiss = () => {
    if (selectedProposal) {
      proposalActions?.onDismiss?.(selectedProposal);
    }
  };

  const handleLifecycleToggle = () => {
    if (selectedProposal) {
      onProposalLifecycleChange?.(
        selectedProposal.proposalId,
        selectedProposal.lifecycle === 'draft' ? 'deferred' : 'draft',
      );
    }
  };

  const handleEditSave = () => {
    if (selectedProposal) {
      proposalActions?.onEdit?.(selectedProposal, {
        targetModuleId: editTargetModuleId || undefined,
        reason: editReason.trim(),
      });
      setIsEditingSelectedProposal(false);
    }
  };

  const handleEditCancel = () => {
    setIsEditingSelectedProposal(false);
    if (selectedProposal) {
      setEditTargetModuleId(selectedProposal.targetModuleId ?? '');
      setEditReason(selectedProposal.editReason ?? '');
    }
  };

  return {
    proposals,
    selectedProposal,
    selectedProposalId,
    setSelectedProposalId,
    canMutateSelectedProposal,
    canApproveSelectedProposal,
    canDismissSelectedProposal,
    canEditSelectedProposal,
    canRerouteSelectedProposal,
    isEditingSelectedProposal,
    setIsEditingSelectedProposal,
    editTargetModuleId,
    setEditTargetModuleId,
    editReason,
    setEditReason,
    editableTargetModules,
    selectedSilentHistoryEntry,
    selectedSilentHistoryId,
    setSelectedSilentHistoryId,
    handleApprove,
    handleDismiss,
    handleLifecycleToggle,
    handleEditSave,
    handleEditCancel,
  };
}
