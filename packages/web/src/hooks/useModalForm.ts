import { useState, useCallback } from 'react';

interface UseModalFormOptions<T> {
  defaultValues: T;
}

/**
 * Reusable hook for modal state management with form data.
 *
 * @example
 * const { isOpen, editingId, form, setForm, openCreate, openEdit, close } = useModalForm({
 *   defaultValues: { name: '', email: '' }
 * });
 */
export function useModalForm<T extends Record<string, any>>(options: UseModalFormOptions<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<T>(options.defaultValues);

  const openCreate = useCallback(() => {
    setEditingId(null);
    setForm(options.defaultValues);
    setIsOpen(true);
  }, [options.defaultValues]);

  const openEdit = useCallback((item: T & { id: number }) => {
    setEditingId(item.id);
    // Copy item properties to form, excluding 'id'
    const { id, ...rest } = item;
    setForm(rest as T);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setEditingId(null);
    setForm(options.defaultValues);
  }, [options.defaultValues]);

  const updateField = useCallback(<K extends keyof T>(field: K, value: T[K]) => {
    setForm(prev => ({ ...prev, [field]: value }));
  }, []);

  const isEditing = editingId !== null;

  return {
    isOpen,
    editingId,
    isEditing,
    form,
    setForm,
    updateField,
    openCreate,
    openEdit,
    close,
  };
}
