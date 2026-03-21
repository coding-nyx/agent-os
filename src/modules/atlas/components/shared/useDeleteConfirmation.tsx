import React, { useState } from 'react';
import { ConfirmDialog } from '@/core/components/ConfirmDialog';

export function useDeleteConfirmation<T extends { id: string; title: string }>(
  onDelete: (id: string) => void
) {
  const [deleteTarget, setDeleteTarget] = useState<T | null>(null);

  const promptDelete = (target: T) => setDeleteTarget(target);

  const ConfirmationDialog = () => (
    <ConfirmDialog
      isOpen={!!deleteTarget}
      onClose={() => setDeleteTarget(null)}
      onConfirm={() => {
        if (deleteTarget) onDelete(deleteTarget.id);
        setDeleteTarget(null);
      }}
      title={`Delete "${deleteTarget?.title}"?`}
      description="This action cannot be undone."
      variant="danger"
      confirmLabel="Delete"
    />
  );

  return { deleteTarget, promptDelete, ConfirmationDialog };
}