import { Box, Button, Group, Modal, Select, Switch, Table, Text, TextInput } from '@mantine/core';
import { modals } from '@mantine/modals';
import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import type { Clinician } from '../../types/entities';
import { useCRUDMutations } from '../../hooks/useCRUDMutations';
import { useModalForm } from '../../hooks/useModalForm';
import {
  PageHeader,
  TableCard,
  LoadingSpinner,
  ActionButtons,
  AddIcon,
  RoleBadge,
  GradeBadge,
  ActiveBadge,
} from '../../components';

const fetchClinicians = async () => {
  const res = await api.get<Clinician[]>('/api/clinicians');
  return res.data;
};

const defaultForm = {
  name: '',
  role: 'consultant' as const,
  grade: null as 'junior' | 'senior' | null,
  email: '',
  active: true,
  notifyEmail: false,
  notifyWhatsapp: false,
};

export const CliniciansPage: React.FC = () => {
  const qc = useQueryClient();
  const listQuery = useQuery({ queryKey: ['clinicians'], queryFn: fetchClinicians });

  const { createMutation, updateMutation, deleteMutation } = useCRUDMutations<Clinician>({
    endpoint: '/api/clinicians',
    queryKey: ['clinicians'],
    entityName: 'clinician',
  });

  const modal = useModalForm({ defaultValues: defaultForm });

  const toggleActive = async (c: Clinician) => {
    await api.patch(`/api/clinicians/${c.id}`, { active: !c.active });
    qc.invalidateQueries({ queryKey: ['clinicians'] });
  };

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

  const openEdit = (c: Clinician) => {
    modal.openEdit({
      id: c.id,
      name: c.name || '',
      role: c.role,
      grade: c.grade || null,
      email: c.email || '',
      active: c.active,
      notifyEmail: c.notifyEmail,
      notifyWhatsapp: c.notifyWhatsapp,
    });
  };

  const onSave = async () => {
    try {
      if (modal.editingId) {
        await updateMutation.mutateAsync({ id: modal.editingId, payload: modal.form });
      } else {
        await createMutation.mutateAsync(modal.form);
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
        title="Clinicians"
        subtitle="Manage your team members and their roles"
        actions={
          <Button onClick={modal.openCreate} leftSection={<AddIcon />}>
            Add Clinician
          </Button>
        }
      />

      {listQuery.isLoading && <LoadingSpinner />}

      {listQuery.data && (
        <TableCard>
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
                      <RoleBadge role={c.role} />
                      {c.role === 'registrar' && <GradeBadge grade={c.grade} />}
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Text c={c.email ? '#1d1d1f' : 'dimmed'}>{c.email || 'Not set'}</Text>
                  </Table.Td>
                  <Table.Td>
                    <ActiveBadge active={c.active ?? false} />
                  </Table.Td>
                  <Table.Td>
                    <Switch
                      checked={c.active}
                      onChange={() => toggleActive(c)}
                      color="green"
                    />
                  </Table.Td>
                  <Table.Td>
                    <ActionButtons
                      onEdit={() => openEdit(c)}
                      onDelete={() => confirmDelete(c)}
                      editLabel="Edit clinician"
                      deleteLabel="Delete clinician"
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
          <Text fw={600} size="lg">{modal.isEditing ? 'Edit Clinician' : 'Add Clinician'}</Text>
        }
        size="md"
      >
        <Box>
          <Box mb={16}>
            <TextInput
              label="Name"
              placeholder="Dr. Jane Smith"
              value={modal.form.name || ''}
              onChange={(e) => modal.updateField('name', e.currentTarget.value)}
              required
              styles={{ label: { marginBottom: 8, fontWeight: 500 } }}
            />
          </Box>
          <Box mb={16}>
            <Select
              label="Role"
              value={modal.form.role}
              onChange={(v) => {
                modal.updateField('role', v as 'consultant' | 'registrar');
                if (v === 'consultant') {
                  modal.updateField('grade', null);
                }
              }}
              data={[
                { value: 'consultant', label: 'Consultant' },
                { value: 'registrar', label: 'Registrar' }
              ]}
              styles={{ label: { marginBottom: 8, fontWeight: 500 } }}
            />
          </Box>
          {modal.form.role === 'registrar' && (
            <Box mb={16}>
              <Select
                label="Grade"
                value={modal.form.grade || null}
                onChange={(v) => modal.updateField('grade', v as 'junior' | 'senior' | null)}
                data={[
                  { value: 'junior', label: 'Junior Registrar' },
                  { value: 'senior', label: 'Senior Registrar' }
                ]}
                placeholder="Select grade"
                clearable
                styles={{ label: { marginBottom: 8, fontWeight: 500 } }}
              />
            </Box>
          )}
          <Box mb={24}>
            <TextInput
              label="Email"
              placeholder="jane.smith@hospital.nhs.uk"
              value={modal.form.email || ''}
              onChange={(e) => modal.updateField('email', e.currentTarget.value)}
              styles={{ label: { marginBottom: 8, fontWeight: 500 } }}
            />
          </Box>
          <Group justify="flex-end" gap="sm">
            <Button variant="subtle" color="gray" onClick={modal.close}>
              Cancel
            </Button>
            <Button onClick={onSave} loading={isLoading} disabled={!canSave}>
              {modal.isEditing ? 'Save Changes' : 'Add Clinician'}
            </Button>
          </Group>
        </Box>
      </Modal>
    </Box>
  );
};
