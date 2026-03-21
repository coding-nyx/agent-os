import { useState, useCallback } from 'react';

export interface CRUDModalConfig<T> {
  initialForm: Partial<T>;
  validate?: (form: Partial<T>) => boolean;
  onCreate?: (form: Partial<T>) => void;
  onUpdate?: (id: string, form: Partial<T>) => void;
}

export function useCRUDModal<T extends { id: string }>(config: CRUDModalConfig<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<T | null>(null);
  const [formData, setFormData] = useState<Partial<T>>(config.initialForm);

  const openCreate = useCallback((defaultValues?: Partial<T>) => {
    setEditingItem(null);
    setFormData({ ...config.initialForm, ...defaultValues });
    setIsOpen(true);
  }, [config.initialForm]);

  const openEdit = useCallback((item: T) => {
    setEditingItem(item);
    setFormData(item as Partial<T>);
    setIsOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setEditingItem(null);
    setFormData(config.initialForm);
  }, [config.initialForm]);

  const handleSave = useCallback(() => {
    if (config.validate && !config.validate(formData)) {
      return;
    }

    if (editingItem && config.onUpdate) {
      config.onUpdate(editingItem.id, formData);
    } else if (!editingItem && config.onCreate) {
      config.onCreate(formData);
    }

    handleClose();
  }, [formData, editingItem, config, handleClose]);

  const setField = useCallback(<K extends keyof T>(field: K, value: T[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  return {
    isOpen,
    setIsOpen,
    editingItem,
    formData,
    setFormData,
    setField,
    openCreate,
    openEdit,
    handleClose,
    handleSave,
  };
}
