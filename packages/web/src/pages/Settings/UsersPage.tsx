import { ActionIcon, Box, Button, Group, Loader, Modal, PasswordInput, Table, Text, TextInput, Tooltip } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';

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

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export const UsersPage: React.FC = () => {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<{ email: string; password: string }>({ email: '', password: '' });

  const listQuery = useQuery({ queryKey: ['users'], queryFn: fetchUsers });

  const createMutation = useMutation({
    mutationFn: async (payload: { email: string; password: string }) => api.post('/api/users', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      notifications.show({
        title: 'Success',
        message: 'User created successfully',
        color: 'green',
      });
    },
    onError: (error: any) => {
      notifications.show({
        title: 'Error',
        message: error?.response?.data?.message || error?.message || 'Failed to create user',
        color: 'red',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: { email?: string; password?: string } }) =>
      api.put(`/api/users/${id}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      notifications.show({
        title: 'Success',
        message: 'User updated successfully',
        color: 'green',
      });
    },
    onError: (error: any) => {
      notifications.show({
        title: 'Error',
        message: error?.response?.data?.message || error?.message || 'Failed to update user',
        color: 'red',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => api.delete(`/api/users/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      notifications.show({
        title: 'Success',
        message: 'User deleted successfully',
        color: 'green',
      });
    },
    onError: (error: any) => {
      notifications.show({
        title: 'Error',
        message: error?.response?.data?.message || error?.message || 'Failed to delete user',
        color: 'red',
      });
    },
  });

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

  const openAddModal = () => {
    setEditingId(null);
    setForm({ email: '', password: '' });
    setModalOpen(true);
  };

  const openEditModal = (user: User) => {
    setEditingId(user.id);
    setForm({ email: user.email, password: '' });
    setModalOpen(true);
  };

  const onSave = async () => {
    try {
      if (editingId) {
        const payload: { email?: string; password?: string } = {};
        if (form.email) payload.email = form.email;
        if (form.password) payload.password = form.password;
        await updateMutation.mutateAsync({ id: editingId, payload });
      } else {
        await createMutation.mutateAsync(form);
      }
      setModalOpen(false);
      setForm({ email: '', password: '' });
      setEditingId(null);
    } catch (e) {
      // Error is handled by mutation onError
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;
  const emailFilled = form.email && form.email.trim().length > 0;
  const passwordFilled = form.password && form.password.trim().length > 0;
  const canSave = editingId
    ? (emailFilled || passwordFilled) // For edit, at least one field should be filled
    : (emailFilled && passwordFilled); // For create, both are required

  return (
    <Box>
      {/* Page Header */}
      <Group justify="space-between" mb={32}>
        <Box>
          <Text
            style={{
              fontSize: '2rem',
              fontWeight: 700,
              color: '#1d1d1f',
              letterSpacing: '-0.025em',
              marginBottom: 8,
            }}
          >
            Users
          </Text>
          <Text style={{ fontSize: '1.0625rem', color: '#86868b' }}>
            Manage admin accounts that can log in and edit the rota
          </Text>
        </Box>
        <Button
          onClick={openAddModal}
          leftSection={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          }
        >
          Add User
        </Button>
      </Group>

      {/* Loading */}
      {listQuery.isLoading && (
        <Box ta="center" py={60}>
          <Loader size="lg" color="#0071e3" />
        </Box>
      )}

      {/* Table */}
      {listQuery.data && (
        <Box
          style={{
            backgroundColor: '#ffffff',
            borderRadius: 16,
            overflow: 'hidden',
            border: '1px solid rgba(0, 0, 0, 0.06)',
          }}
        >
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
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1976d2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                          <circle cx="12" cy="7" r="4"/>
                        </svg>
                      </Box>
                      <Text fw={500} c="#1d1d1f">{user.email}</Text>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Text c="dimmed" size="sm">{formatDate(user.createdAt)}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <Tooltip label="Edit user" withArrow>
                        <ActionIcon
                          variant="light"
                          color="blue"
                          onClick={() => openEditModal(user)}
                          radius="md"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Delete user" withArrow>
                        <ActionIcon
                          variant="light"
                          color="red"
                          onClick={() => confirmDelete(user)}
                          radius="md"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3,6 5,6 21,6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            <line x1="10" y1="11" x2="10" y2="17"/>
                            <line x1="14" y1="11" x2="14" y2="17"/>
                          </svg>
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Box>
      )}

      {/* Empty state */}
      {listQuery.data && listQuery.data.length === 0 && (
        <Box
          ta="center"
          py={60}
          style={{
            backgroundColor: '#ffffff',
            borderRadius: 16,
            border: '1px solid rgba(0, 0, 0, 0.06)',
          }}
        >
          <Box
            style={{
              width: 64,
              height: 64,
              backgroundColor: '#f5f5f7',
              borderRadius: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#86868b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
          </Box>
          <Text fw={500} c="#1d1d1f" mb={4}>No users</Text>
          <Text c="dimmed" size="sm" mb={16}>Add your first admin user</Text>
          <Button onClick={openAddModal}>Add User</Button>
        </Box>
      )}

      {/* Add/Edit Modal */}
      <Modal
        opened={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingId(null);
        }}
        title={
          <Text fw={600} size="lg">{editingId ? 'Edit User' : 'Add User'}</Text>
        }
        size="md"
      >
        <Box>
          <Box mb={16}>
            <TextInput
              label="Email"
              placeholder="admin@example.com"
              value={form.email || ''}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required={!editingId}
              styles={{
                label: { marginBottom: 8, fontWeight: 500 },
              }}
            />
          </Box>
          <Box mb={24}>
            <PasswordInput
              label={editingId ? 'New Password' : 'Password'}
              placeholder={editingId ? 'Leave blank to keep current' : 'Enter password'}
              value={form.password || ''}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required={!editingId}
              description={editingId ? 'Leave blank to keep the current password' : 'Minimum 6 characters'}
              styles={{
                label: { marginBottom: 8, fontWeight: 500 },
              }}
            />
          </Box>
          <Group justify="flex-end" gap="sm">
            <Button
              variant="subtle"
              color="gray"
              onClick={() => {
                setModalOpen(false);
                setEditingId(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={onSave} loading={isLoading} disabled={!canSave}>
              {editingId ? 'Save Changes' : 'Add User'}
            </Button>
          </Group>
        </Box>
      </Modal>
    </Box>
  );
};
