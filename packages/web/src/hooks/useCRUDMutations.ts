import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { notify } from '../utils/notify';

interface UseCRUDMutationsOptions {
  endpoint: string;
  queryKey: string[];
  entityName: string;
}

/**
 * Reusable hook for CRUD mutations with consistent error handling and notifications.
 *
 * @example
 * const { createMutation, updateMutation, deleteMutation } = useCRUDMutations({
 *   endpoint: '/api/clinicians',
 *   queryKey: ['clinicians'],
 *   entityName: 'clinician'
 * });
 */
export function useCRUDMutations<T>({ endpoint, queryKey, entityName }: UseCRUDMutationsOptions) {
  const qc = useQueryClient();

  const handleError = (error: any, action: string) => {
    notify.show({
      title: 'Error',
      message: error?.response?.data?.message || error?.message || `Failed to ${action} ${entityName}`,
      color: 'red',
    });
  };

  const createMutation = useMutation({
    mutationFn: (payload: Partial<T>) => api.post(endpoint, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      notify.show({
        title: 'Success',
        message: `${capitalize(entityName)} created successfully`,
        color: 'green',
      });
    },
    onError: (error: any) => handleError(error, 'create'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<T> }) =>
      api.patch(`${endpoint}/${id}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      notify.show({
        title: 'Success',
        message: `${capitalize(entityName)} updated successfully`,
        color: 'green',
      });
    },
    onError: (error: any) => handleError(error, 'update'),
  });

  // Alternative for APIs that use PUT instead of PATCH
  const putMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<T> }) =>
      api.put(`${endpoint}/${id}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      notify.show({
        title: 'Success',
        message: `${capitalize(entityName)} updated successfully`,
        color: 'green',
      });
    },
    onError: (error: any) => handleError(error, 'update'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`${endpoint}/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      notify.show({
        title: 'Success',
        message: `${capitalize(entityName)} deleted successfully`,
        color: 'green',
      });
    },
    onError: (error: any) => handleError(error, 'delete'),
  });

  return { createMutation, updateMutation, putMutation, deleteMutation };
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
