import { ActionIcon, Badge, Box, Button, Group, Loader, Modal, Select, Switch, Table, Text, TextInput, Tooltip } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notify } from '../../utils/notify';
import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';

type Clinician = {
  id: number;
  name: string;
  role: 'consultant' | 'registrar';
  grade?: 'junior' | 'senior' | null;
  email?: string | null;
  active: boolean;
  notifyEmail: boolean;
  notifyWhatsapp: boolean;
};

const fetchClinicians = async () => {
  const res = await api.get<Clinician[]>('/api/clinicians');
  return res.data;
};

export const CliniciansPage: React.FC = () => {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<Clinician>>({ role: 'consultant', active: true });

  const listQuery = useQuery({ queryKey: ['clinicians'], queryFn: fetchClinicians });

  const createMutation = useMutation({
    mutationFn: async (payload: Partial<Clinician>) => api.post('/api/clinicians', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clinicians'] });
      notify.show({
        title: 'Success',
        message: 'Clinician created successfully',
        color: 'green',
      });
    },
    onError: (error: any) => {
      notify.show({
        title: 'Error',
        message: error?.response?.data?.message || error?.message || 'Failed to create clinician',
        color: 'red',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: Partial<Clinician> }) =>
      api.patch(`/api/clinicians/${id}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clinicians'] });
      notify.show({
        title: 'Success',
        message: 'Clinician updated successfully',
        color: 'green',
      });
    },
    onError: (error: any) => {
      notify.show({
        title: 'Error',
        message: error?.response?.data?.message || error?.message || 'Failed to update clinician',
        color: 'red',
      });
    },
  });

  const toggleActive = useMutation({
    mutationFn: async (c: Clinician) => api.patch(`/api/clinicians/${c.id}`, { active: !c.active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinicians'] }),
    onError: (error: any) => {
      notify.show({
        title: 'Error',
        message: error?.response?.data?.message || error?.message || 'Failed to update status',
        color: 'red',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => api.delete(`/api/clinicians/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clinicians'] });
      notify.show({
        title: 'Success',
        message: 'Clinician deleted successfully',
        color: 'green',
      });
    },
    onError: (error: any) => {
      notify.show({
        title: 'Error',
        message: error?.response?.data?.message || error?.message || 'Failed to delete clinician',
        color: 'red',
      });
    },
  });

  const confirmDelete = (c: Clinician) => {
    modals.openConfirmModal({
      title: 'Delete Clinician',
      children: (
        <Text size="sm">
          Are you sure you want to delete <strong>{c.name}</strong>? This action cannot be undone.
        </Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => deleteMutation.mutate(c.id),
    });
  };

  const openAddModal = () => {
    setEditingId(null);
    setForm({ role: 'consultant', active: true });
    setModalOpen(true);
  };

  const openEditModal = (c: Clinician) => {
    setEditingId(c.id);
    setForm({
      name: c.name,
      role: c.role,
      grade: c.grade,
      email: c.email || '',
      active: c.active,
      notifyEmail: c.notifyEmail,
      notifyWhatsapp: c.notifyWhatsapp,
    });
    setModalOpen(true);
  };

  const onSave = async () => {
    try {
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, payload: form });
      } else {
        await createMutation.mutateAsync(form);
      }
      setModalOpen(false);
      setForm({ role: 'consultant', active: true });
      setEditingId(null);
    } catch (e) {
      // Error is handled by mutation onError
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;
  const canSave = form.name?.trim();

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
            Clinicians
          </Text>
          <Text style={{ fontSize: '1.0625rem', color: '#86868b' }}>
            Manage your team members and their roles
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
          Add Clinician
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
                <Table.Th>Name</Table.Th>
                <Table.Th>Role</Table.Th>
                <Table.Th>Email</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th style={{ width: 80 }}>Active</Table.Th>
                <Table.Th style={{ width: 80 }}>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {listQuery.data.map((c) => (
                <Table.Tr key={c.id}>
                  <Table.Td>
                    <Text fw={500} c="#1d1d1f">{c.name}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <Badge
                        variant="light"
                        color={c.role === 'consultant' ? 'blue' : 'grape'}
                        radius="md"
                        tt="capitalize"
                      >
                        {c.role}
                      </Badge>
                      {c.role === 'registrar' && c.grade && (
                        <Badge
                          variant="outline"
                          color="grape"
                          radius="md"
                          size="sm"
                          tt="capitalize"
                        >
                          {c.grade}
                        </Badge>
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Text c={c.email ? '#1d1d1f' : 'dimmed'}>{c.email || 'Not set'}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge
                      variant="light"
                      color={c.active ? 'green' : 'gray'}
                      radius="md"
                    >
                      {c.active ? 'Active' : 'Inactive'}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Switch
                      checked={c.active}
                      onChange={() => toggleActive.mutate(c)}
                      color="green"
                    />
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <Tooltip label="Edit clinician" withArrow>
                        <ActionIcon
                          variant="light"
                          color="blue"
                          onClick={() => openEditModal(c)}
                          radius="md"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Delete clinician" withArrow>
                        <ActionIcon
                          variant="light"
                          color="red"
                          onClick={() => confirmDelete(c)}
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

      {/* Add/Edit Modal */}
      <Modal
        opened={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingId(null);
        }}
        title={
          <Text fw={600} size="lg">{editingId ? 'Edit Clinician' : 'Add Clinician'}</Text>
        }
        size="md"
      >
        <Box>
          <Box mb={16}>
            <TextInput
              label="Name"
              placeholder="Dr. Jane Smith"
              value={form.name || ''}
              onChange={(e) => setForm((f) => ({ ...f, name: e.currentTarget.value }))}
              required
              styles={{
                label: { marginBottom: 8, fontWeight: 500 },
              }}
            />
          </Box>
          <Box mb={16}>
            <Select
              label="Role"
              value={form.role}
              onChange={(v) => setForm((f) => ({
                ...f,
                role: v as any,
                // Clear grade when switching to consultant
                grade: v === 'consultant' ? null : f.grade
              }))}
              data={[
                { value: 'consultant', label: 'Consultant' },
                { value: 'registrar', label: 'Registrar' }
              ]}
              styles={{
                label: { marginBottom: 8, fontWeight: 500 },
              }}
            />
          </Box>
          {form.role === 'registrar' && (
            <Box mb={16}>
              <Select
                label="Grade"
                value={form.grade || null}
                onChange={(v) => setForm((f) => ({ ...f, grade: v as any }))}
                data={[
                  { value: 'junior', label: 'Junior Registrar' },
                  { value: 'senior', label: 'Senior Registrar' }
                ]}
                placeholder="Select grade"
                clearable
                styles={{
                  label: { marginBottom: 8, fontWeight: 500 },
                }}
              />
            </Box>
          )}
          <Box mb={24}>
            <TextInput
              label="Email"
              placeholder="jane.smith@hospital.nhs.uk"
              value={form.email || ''}
              onChange={(e) => setForm((f) => ({ ...f, email: e.currentTarget.value }))}
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
              {editingId ? 'Save Changes' : 'Add Clinician'}
            </Button>
          </Group>
        </Box>
      </Modal>
    </Box>
  );
};
