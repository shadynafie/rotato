import { Badge, Box, Button, Group, Modal, SimpleGrid, Switch, Table, Text, TextInput, Tooltip, UnstyledButton } from '@mantine/core';
import { modals } from '@mantine/modals';
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/client';
import { useCRUDMutations } from '../../hooks/useCRUDMutations';
import { useModalForm } from '../../hooks/useModalForm';
import {
  PageHeader,
  TableCard,
  LoadingSpinner,
  EmptyState,
  ActionButtons,
  ColorDot,
  AddIcon,
  CheckIcon,
  FileIcon,
} from '../../components';

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

const defaultForm = {
  name: '',
  color: '#0071e3',
  requiresRegistrar: false,
};

export const DutiesPage: React.FC = () => {
  const [selectedColor, setSelectedColor] = useState('#0071e3');
  const listQuery = useQuery({ queryKey: ['duties'], queryFn: fetchDuties });

  const { createMutation, updateMutation, deleteMutation } = useCRUDMutations<Duty>({
    endpoint: '/api/duties',
    queryKey: ['duties'],
    entityName: 'duty',
  });

  const modal = useModalForm({ defaultValues: defaultForm });

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

  const openCreate = () => {
    setSelectedColor('#0071e3');
    modal.openCreate();
  };

  const openEdit = (d: Duty) => {
    setSelectedColor(d.color || '#0071e3');
    modal.openEdit({
      id: d.id,
      name: d.name,
      color: d.color || '#0071e3',
      requiresRegistrar: d.requiresRegistrar || false,
    });
  };

  const onSave = async () => {
    try {
      const payload = { ...modal.form, color: selectedColor };
      if (modal.editingId) {
        await updateMutation.mutateAsync({ id: modal.editingId, payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
      modal.close();
    } catch {
      // Error handled by mutation
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;
  const canSave = modal.form.name?.trim();

  return (
    <Box>
      <PageHeader
        title="Duties"
        subtitle="Define the types of duties for your rota"
        actions={
          <Button onClick={openCreate} leftSection={<AddIcon />}>
            Add Duty
          </Button>
        }
      />

      {listQuery.isLoading && <LoadingSpinner />}

      {listQuery.data && listQuery.data.length === 0 && (
        <EmptyState
          icon={<FileIcon size={28} color="#86868b" strokeWidth={1.5} />}
          title="No duties yet"
          message="Add your first duty to get started"
        />
      )}

      {listQuery.data && listQuery.data.length > 0 && (
        <TableCard>
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
                      <ColorDot color={d.color || '#0071e3'} />
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
                    <ActionButtons
                      onEdit={() => openEdit(d)}
                      onDelete={() => confirmDelete(d)}
                      editLabel="Edit duty"
                      deleteLabel="Delete duty"
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
          <Text fw={600} size="lg">{modal.isEditing ? 'Edit Duty' : 'Add Duty'}</Text>
        }
        size="sm"
      >
        <Box>
          <Box mb={16}>
            <TextInput
              label="Duty Name"
              placeholder="e.g., Theatre, Clinic, Ward Round"
              value={modal.form.name || ''}
              onChange={(e) => modal.updateField('name', e.currentTarget.value)}
              required
              styles={{ label: { marginBottom: 8, fontWeight: 500 } }}
            />
          </Box>
          <Box mb={16}>
            <Text fw={500} mb={8} size="sm">Color</Text>
            <SimpleGrid cols={6} spacing="xs">
              {COLOR_SWATCHES.map((swatch) => (
                <Tooltip label={swatch.name} key={swatch.color} withArrow>
                  <UnstyledButton
                    onClick={() => setSelectedColor(swatch.color)}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      backgroundColor: swatch.color,
                      border: selectedColor === swatch.color ? '3px solid #1d1d1f' : '2px solid transparent',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {selectedColor === swatch.color && (
                      <CheckIcon size={16} color="white" strokeWidth={3} />
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
              checked={modal.form.requiresRegistrar || false}
              onChange={(e) => modal.updateField('requiresRegistrar', e.currentTarget.checked)}
              color="grape"
            />
          </Box>
          <Group justify="flex-end" gap="sm">
            <Button variant="subtle" color="gray" onClick={modal.close}>
              Cancel
            </Button>
            <Button onClick={onSave} loading={isLoading} disabled={!canSave}>
              {modal.isEditing ? 'Save Changes' : 'Add Duty'}
            </Button>
          </Group>
        </Box>
      </Modal>
    </Box>
  );
};
