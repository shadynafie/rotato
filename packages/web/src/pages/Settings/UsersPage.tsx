import { Box, Button, Group, Modal, PasswordInput, Table, Text, TextInput } from '@mantine/core';
import { modals } from '@mantine/modals';
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/client';
import { formatDateShort } from '../../utils/formatters';
import { useCRUDMutations } from '../../hooks/useCRUDMutations';
import { useModalForm } from '../../hooks/useModalForm';
import {
  PageHeader,
  TableCard,
  LoadingSpinner,
  EmptyState,
  ActionButtons,
  AddIcon,
  UserIcon,
} from '../../components';

type User = {
  id: number;
  email: string;
  role: string;
  createdAt: string;
};

const fetchUsers = async () => {
  const res = await api.get<User[]>('/api/users');
  return res.data;
};

const defaultForm = {
  email: '',
  password: '',
};

export const UsersPage: React.FC = () => {
  const listQuery = useQuery({ queryKey: ['users'], queryFn: fetchUsers });

  const { createMutation, putMutation, deleteMutation } = useCRUDMutations<User>({
    endpoint: '/api/users',
    queryKey: ['users'],
    entityName: 'user',
  });

  const modal = useModalForm({ defaultValues: defaultForm });

  const confirmDelete = (user: User) => {
    modals.openConfirmModal({
      title: 'Delete User',
      children: (
        <Text size="sm">
          Are you sure you want to delete <strong>{user.email}</strong>? This action cannot be undone.
        </Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => deleteMutation.mutate(user.id),
    });
  };

  const openEdit = (user: User) => {
    modal.openEdit({
      id: user.id,
      email: user.email,
      password: '',
    });
  };

  const onSave = async () => {
    try {
      if (modal.editingId) {
        const payload: { email?: string; password?: string } = {};
        if (modal.form.email) payload.email = modal.form.email;
        if (modal.form.password) payload.password = modal.form.password;
        await putMutation.mutateAsync({ id: modal.editingId, payload });
      } else {
        await createMutation.mutateAsync(modal.form);
      }
      modal.close();
    } catch {
      // Error handled by mutation
    }
  };

  const isLoading = createMutation.isPending || putMutation.isPending;
  const emailFilled = modal.form.email?.trim().length > 0;
  const passwordFilled = modal.form.password?.trim().length > 0;
  const canSave = modal.editingId
    ? (emailFilled || passwordFilled)
    : (emailFilled && passwordFilled);

  return (
    <Box>
      <PageHeader
        title="Users"
        subtitle="Manage admin accounts that can log in and edit the rota"
        actions={
          <Button onClick={modal.openCreate} leftSection={<AddIcon />}>
            Add User
          </Button>
        }
      />

      {listQuery.isLoading && <LoadingSpinner />}

      {listQuery.data && listQuery.data.length === 0 && (
        <EmptyState
          icon={<UserIcon size={28} color="#86868b" strokeWidth={1.5} />}
          title="No users"
          message="Add your first admin user"
          action={<Button onClick={modal.openCreate}>Add User</Button>}
        />
      )}

      {listQuery.data && listQuery.data.length > 0 && (
        <TableCard>
          <Table verticalSpacing="md" horizontalSpacing="lg">
            <Table.Thead>
              <Table.Tr style={{ backgroundColor: '#fafafa' }}>
                <Table.Th>Email</Table.Th>
                <Table.Th>Created</Table.Th>
                <Table.Th style={{ width: 120 }}>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {listQuery.data.map((user) => (
                <Table.Tr key={user.id}>
                  <Table.Td>
                    <Group gap="sm">
                      <Box
                        style={{
                          width: 36,
                          height: 36,
                          backgroundColor: '#e3f2fd',
                          borderRadius: 8,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <UserIcon size={18} color="#1976d2" />
                      </Box>
                      <Text fw={500} c="#1d1d1f">{user.email}</Text>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Text c="dimmed" size="sm">{formatDateShort(user.createdAt)}</Text>
                  </Table.Td>
                  <Table.Td>
                    <ActionButtons
                      onEdit={() => openEdit(user)}
                      onDelete={() => confirmDelete(user)}
                      editLabel="Edit user"
                      deleteLabel="Delete user"
                    />
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </TableCard>
      )}

      <Modal
        opened={modal.isOpen}
        onClose={modal.close}
        title={
          <Text fw={600} size="lg">{modal.isEditing ? 'Edit User' : 'Add User'}</Text>
        }
        size="md"
      >
        <Box>
          <Box mb={16}>
            <TextInput
              label="Email"
              placeholder="admin@example.com"
              value={modal.form.email || ''}
              onChange={(e) => modal.updateField('email', e.target.value)}
              required={!modal.editingId}
              styles={{ label: { marginBottom: 8, fontWeight: 500 } }}
            />
          </Box>
          <Box mb={24}>
            <PasswordInput
              label={modal.isEditing ? 'New Password' : 'Password'}
              placeholder={modal.isEditing ? 'Leave blank to keep current' : 'Enter password'}
              value={modal.form.password || ''}
              onChange={(e) => modal.updateField('password', e.target.value)}
              required={!modal.editingId}
              description={modal.isEditing ? 'Leave blank to keep the current password' : 'Minimum 6 characters'}
              styles={{ label: { marginBottom: 8, fontWeight: 500 } }}
            />
          </Box>
          <Group justify="flex-end" gap="sm">
            <Button variant="subtle" color="gray" onClick={modal.close}>
              Cancel
            </Button>
            <Button onClick={onSave} loading={isLoading} disabled={!canSave}>
              {modal.isEditing ? 'Save Changes' : 'Add User'}
            </Button>
          </Group>
        </Box>
      </Modal>
    </Box>
  );
};
