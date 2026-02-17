import { ActionIcon, Badge, Box, Button, Group, Loader, Modal, SimpleGrid, Switch, Table, Text, TextInput, Tooltip, UnstyledButton } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notify } from '../../utils/notify';
import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';

// Predefined color palette
const COLOR_SWATCHES = [
  { color: '#0071e3', name: 'Blue' },
  { color: '#34c759', name: 'Green' },
  { color: '#ff9500', name: 'Orange' },
  { color: '#ff3b30', name: 'Red' },
  { color: '#af52de', name: 'Purple' },
  { color: '#5856d6', name: 'Indigo' },
  { color: '#00c7be', name: 'Teal' },
  { color: '#ff2d55', name: 'Pink' },
  { color: '#64748b', name: 'Slate' },
  { color: '#f59e0b', name: 'Amber' },
  { color: '#10b981', name: 'Emerald' },
  { color: '#8b5cf6', name: 'Violet' },
];

type Duty = { id: number; name: string; color?: string | null; requiresRegistrar?: boolean };

const fetchDuties = async () => {
  const res = await api.get<Duty[]>('/api/duties');
  return res.data;
};

export const DutiesPage: React.FC = () => {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#0071e3');
  const [requiresRegistrar, setRequiresRegistrar] = useState(false);

  const listQuery = useQuery({ queryKey: ['duties'], queryFn: fetchDuties });

  const createMutation = useMutation({
    mutationFn: async () => api.post('/api/duties', { name, color, requiresRegistrar }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['duties'] });
      notify.show({
        title: 'Success',
        message: 'Duty created successfully',
        color: 'green',
      });
    },
    onError: (error: any) => {
      notify.show({
        title: 'Error',
        message: error?.response?.data?.message || error?.message || 'Failed to create duty',
        color: 'red',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: { name: string; color: string; requiresRegistrar: boolean } }) =>
      api.patch(`/api/duties/${id}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['duties'] });
      notify.show({
        title: 'Success',
        message: 'Duty updated successfully',
        color: 'green',
      });
    },
    onError: (error: any) => {
      notify.show({
        title: 'Error',
        message: error?.response?.data?.message || error?.message || 'Failed to update duty',
        color: 'red',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => api.delete(`/api/duties/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['duties'] });
      notify.show({
        title: 'Success',
        message: 'Duty deleted successfully',
        color: 'green',
      });
    },
    onError: (error: any) => {
      notify.show({
        title: 'Error',
        message: error?.response?.data?.message || error?.message || 'Failed to delete duty',
        color: 'red',
      });
    },
  });

  const confirmDelete = (d: Duty) => {
    modals.openConfirmModal({
      title: 'Delete Duty',
      children: (
        <Text size="sm">
          Are you sure you want to delete <strong>{d.name}</strong>? This action cannot be undone.
        </Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => deleteMutation.mutate(d.id),
    });
  };

  const openAddModal = () => {
    setEditingId(null);
    setName('');
    setColor('#0071e3');
    setRequiresRegistrar(false);
    setModalOpen(true);
  };

  const openEditModal = (d: Duty) => {
    setEditingId(d.id);
    setName(d.name);
    setColor(d.color || '#0071e3');
    setRequiresRegistrar(d.requiresRegistrar || false);
    setModalOpen(true);
  };

  const onSave = async () => {
    try {
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, payload: { name, color, requiresRegistrar } });
      } else {
        await createMutation.mutateAsync();
      }
      setName('');
      setColor('#0071e3');
      setRequiresRegistrar(false);
      setEditingId(null);
      setModalOpen(false);
    } catch (e) {
      // Error is handled by mutation onError
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

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
            Duties
          </Text>
          <Text style={{ fontSize: '1.0625rem', color: '#86868b' }}>
            Define the types of duties for your rota
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
          Add Duty
        </Button>
      </Group>

      {/* Loading */}
      {listQuery.isLoading && (
        <Box ta="center" py={60}>
          <Loader size="lg" color="#0071e3" />
        </Box>
      )}

      {/* Empty State */}
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
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14,2 14,8 20,8"/>
            </svg>
          </Box>
          <Text fw={500} c="#1d1d1f" mb={4}>No duties yet</Text>
          <Text c="dimmed" size="sm">Add your first duty to get started</Text>
        </Box>
      )}

      {/* Table */}
      {listQuery.data && listQuery.data.length > 0 && (
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
                <Table.Th>Duty Name</Table.Th>
                <Table.Th style={{ width: 140 }}>Registrar</Table.Th>
                <Table.Th style={{ width: 80 }}>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {listQuery.data.map((d) => (
                <Table.Tr key={d.id}>
                  <Table.Td>
                    <Group gap="sm">
                      <Box
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: '50%',
                          backgroundColor: d.color || '#0071e3',
                        }}
                      />
                      <Text fw={500} c="#1d1d1f">{d.name}</Text>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    {d.requiresRegistrar && (
                      <Badge variant="light" color="grape" radius="md" size="sm">
                        Required
                      </Badge>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <Tooltip label="Edit duty" withArrow>
                        <ActionIcon
                          variant="light"
                          color="blue"
                          onClick={() => openEditModal(d)}
                          radius="md"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Delete duty" withArrow>
                        <ActionIcon
                          variant="light"
                          color="red"
                          onClick={() => confirmDelete(d)}
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
          <Text fw={600} size="lg">{editingId ? 'Edit Duty' : 'Add Duty'}</Text>
        }
        size="sm"
      >
        <Box>
          <Box mb={16}>
            <TextInput
              label="Duty Name"
              placeholder="e.g., Theatre, Clinic, Ward Round"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              required
              styles={{
                label: { marginBottom: 8, fontWeight: 500 },
              }}
            />
          </Box>
          <Box mb={16}>
            <Text fw={500} mb={8} size="sm">Color</Text>
            <SimpleGrid cols={6} spacing="xs">
              {COLOR_SWATCHES.map((swatch) => (
                <Tooltip label={swatch.name} key={swatch.color} withArrow>
                  <UnstyledButton
                    onClick={() => setColor(swatch.color)}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      backgroundColor: swatch.color,
                      border: color === swatch.color ? '3px solid #1d1d1f' : '2px solid transparent',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {color === swatch.color && (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20,6 9,17 4,12"/>
                      </svg>
                    )}
                  </UnstyledButton>
                </Tooltip>
              ))}
            </SimpleGrid>
          </Box>
          <Box mb={24}>
            <Switch
              label="Requires Registrar"
              description="This activity needs registrar coverage when scheduled"
              checked={requiresRegistrar}
              onChange={(e) => setRequiresRegistrar(e.currentTarget.checked)}
              color="grape"
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
            <Button onClick={onSave} loading={isLoading} disabled={!name.trim()}>
              {editingId ? 'Save Changes' : 'Add Duty'}
            </Button>
          </Group>
        </Box>
      </Modal>
    </Box>
  );
};
