import { ActionIcon, Badge, Box, Button, Group, Modal, Select, Table, Text, Textarea, Tooltip } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { modals } from '@mantine/modals';
import { notify } from '../../utils/notify';
import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import { formatDateWithWeekday } from '../../utils/formatters';
import { LEAVE_TYPES, SESSIONS } from '../../utils/constants';
import {
  PageHeader,
  LoadingSpinner,
  EmptyState,
  SessionBadge,
  AddIcon,
  DeleteIcon,
  CalendarIcon,
} from '../../components';

interface Clinician {
  id: number;
  name: string;
  role: string;
}

interface Leave {
  id: number;
  clinicianId: number;
  date: string;
  session: string;
  type: string;
  note: string | null;
  clinician: Clinician;
}

const fetchLeaves = async () => {
  const res = await api.get<Leave[]>('/api/leaves');
  return res.data;
};

const fetchClinicians = async () => {
  const res = await api.get<Clinician[]>('/api/clinicians');
  return res.data;
};

function getLeaveTypeColor(type: string): string {
  switch (type) {
    case 'annual': return 'blue';
    case 'study': return 'grape';
    case 'sick': return 'red';
    case 'professional': return 'teal';
    default: return 'gray';
  }
}

// Calculate number of days between two dates (inclusive)
function getDayCount(from: Date | null, to: Date | null): number {
  if (!from || !to) return 0;
  const diffTime = Math.abs(to.getTime() - from.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
}

export const LeavesPage: React.FC = () => {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [clinicianId, setClinicianId] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([null, null]);
  const [session, setSession] = useState<string | null>('FULL');
  const [leaveType, setLeaveType] = useState<string | null>('annual');
  const [note, setNote] = useState('');

  const leavesQuery = useQuery({ queryKey: ['leaves'], queryFn: fetchLeaves });
  const cliniciansQuery = useQuery({ queryKey: ['clinicians'], queryFn: fetchClinicians });

  const createMutation = useMutation({
    mutationFn: async () => {
      const [fromDate, toDate] = dateRange;
      // If only one date selected, treat as single day
      const effectiveToDate = toDate || fromDate;

      return api.post('/api/leaves/bulk', {
        clinicianId: Number(clinicianId),
        fromDate: fromDate?.toISOString(),
        toDate: effectiveToDate?.toISOString(),
        session,
        type: leaveType,
        note: note || undefined,
      });
    },
    onSuccess: (response) => {
      qc.invalidateQueries({ queryKey: ['leaves'] });
      qc.invalidateQueries({ queryKey: ['schedule'] });
      qc.invalidateQueries({ queryKey: ['coverage'] });
      const count = response.data?.count || 1;
      notify.show({
        title: 'Success',
        message: `${count} day${count > 1 ? 's' : ''} of leave added successfully`,
        color: 'green',
      });
      closeModal();
    },
    onError: (error: any) => {
      notify.show({
        title: 'Error',
        message: error?.response?.data?.message || error?.message || 'Failed to add leave',
        color: 'red',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => api.delete(`/api/leaves/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leaves'] });
      qc.invalidateQueries({ queryKey: ['schedule'] });
      qc.invalidateQueries({ queryKey: ['coverage'] });
      notify.show({
        title: 'Success',
        message: 'Leave deleted successfully',
        color: 'green',
      });
    },
    onError: (error: any) => {
      notify.show({
        title: 'Error',
        message: error?.response?.data?.message || error?.message || 'Failed to delete leave',
        color: 'red',
      });
    },
  });

  const openAddModal = () => {
    setClinicianId(null);
    setDateRange([null, null]);
    setSession('FULL');
    setLeaveType('annual');
    setNote('');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
  };

  const confirmDelete = (leave: Leave) => {
    modals.openConfirmModal({
      title: 'Delete Leave',
      children: (
        <Text size="sm">
          Are you sure you want to delete the leave for <strong>{leave.clinician.name}</strong> on {formatDateWithWeekday(leave.date)}?
        </Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => deleteMutation.mutate(leave.id),
    });
  };

  const onSave = async () => {
    if (!clinicianId || !dateRange[0] || !session || !leaveType) return;
    await createMutation.mutateAsync();
  };

  const dayCount = getDayCount(dateRange[0], dateRange[1] || dateRange[0]);

  const isLoading = leavesQuery.isLoading || cliniciansQuery.isLoading;
  const isSaving = createMutation.isPending;

  // Group leaves by upcoming vs past
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcomingLeaves = (leavesQuery.data || []).filter((l) => new Date(l.date) >= today);
  const pastLeaves = (leavesQuery.data || []).filter((l) => new Date(l.date) < today);

  const renderLeaveTable = (leaves: Leave[], isPast: boolean = false) => (
    <Table verticalSpacing="md" horizontalSpacing="lg">
      <Table.Thead>
        <Table.Tr style={{ backgroundColor: '#fafafa' }}>
          <Table.Th>Date</Table.Th>
          <Table.Th>Clinician</Table.Th>
          <Table.Th>Session</Table.Th>
          <Table.Th>Type</Table.Th>
          <Table.Th>Note</Table.Th>
          <Table.Th style={{ width: 80 }}>Actions</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {leaves.map((leave) => (
          <Table.Tr key={leave.id} style={isPast ? { opacity: 0.6 } : undefined}>
            <Table.Td>
              <Text fw={500} c="#1d1d1f">{formatDateWithWeekday(leave.date)}</Text>
            </Table.Td>
            <Table.Td>
              <Text>{leave.clinician.name}</Text>
            </Table.Td>
            <Table.Td>
              <SessionBadge session={leave.session as 'FULL' | 'AM' | 'PM'} />
            </Table.Td>
            <Table.Td>
              <Badge variant="light" color={getLeaveTypeColor(leave.type)} size="sm">
                {LEAVE_TYPES.find((t) => t.value === leave.type)?.label || leave.type}
              </Badge>
            </Table.Td>
            <Table.Td>
              <Text c="dimmed" size="sm" lineClamp={1}>{leave.note || '—'}</Text>
            </Table.Td>
            <Table.Td>
              <Tooltip label="Delete leave" withArrow>
                <ActionIcon
                  variant="light"
                  color="red"
                  onClick={() => confirmDelete(leave)}
                  radius="md"
                >
                  <DeleteIcon />
                </ActionIcon>
              </Tooltip>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );

  return (
    <Box>
      <PageHeader
        title="Leave Management"
        subtitle="Record and manage staff leave"
        actions={
          <Button onClick={openAddModal} leftSection={<AddIcon />}>
            Add Leave
          </Button>
        }
      />

      {isLoading && <LoadingSpinner />}

      {!isLoading && leavesQuery.data && leavesQuery.data.length === 0 && (
        <EmptyState
          icon={<CalendarIcon size={28} color="#86868b" strokeWidth={1.5} />}
          title="No leave recorded"
          message="Add leave entries to track staff absences"
        />
      )}

      {/* Upcoming Leaves */}
      {!isLoading && upcomingLeaves.length > 0 && (
        <Box
          mb={24}
          style={{
            backgroundColor: '#ffffff',
            borderRadius: 16,
            overflow: 'hidden',
            border: '1px solid rgba(0, 0, 0, 0.06)',
          }}
        >
          <Box
            px={24}
            py={16}
            style={{
              backgroundColor: '#fafafa',
              borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
            }}
          >
            <Group gap="sm">
              <Badge variant="light" color="blue" size="lg" radius="md">
                Upcoming
              </Badge>
              <Text c="dimmed" size="sm">{upcomingLeaves.length} entries</Text>
            </Group>
          </Box>
          {renderLeaveTable(upcomingLeaves)}
        </Box>
      )}

      {/* Past Leaves */}
      {!isLoading && pastLeaves.length > 0 && (
        <Box
          style={{
            backgroundColor: '#ffffff',
            borderRadius: 16,
            overflow: 'hidden',
            border: '1px solid rgba(0, 0, 0, 0.06)',
          }}
        >
          <Box
            px={24}
            py={16}
            style={{
              backgroundColor: '#fafafa',
              borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
            }}
          >
            <Group gap="sm">
              <Badge variant="light" color="gray" size="lg" radius="md">
                Past
              </Badge>
              <Text c="dimmed" size="sm">{pastLeaves.length} entries</Text>
            </Group>
          </Box>
          {renderLeaveTable(pastLeaves, true)}
        </Box>
      )}

      {/* Add Leave Modal */}
      <Modal
        opened={modalOpen}
        onClose={closeModal}
        title={
          <Text fw={600} size="lg">Add Leave</Text>
        }
        size="md"
      >
        <Box>
          <Box mb={16}>
            <Select
              label="Clinician"
              placeholder="Select clinician"
              data={(cliniciansQuery.data || []).map((c) => ({
                value: String(c.id),
                label: `${c.name} (${c.role})`,
              }))}
              value={clinicianId}
              onChange={setClinicianId}
              required
              searchable
              styles={{ label: { marginBottom: 8, fontWeight: 500 } }}
            />
          </Box>
          <Box mb={16}>
            <DatePickerInput
              type="range"
              label="Date Range"
              placeholder="Select dates"
              value={dateRange}
              onChange={setDateRange}
              required
              allowSingleDateInRange
              styles={{ label: { marginBottom: 8, fontWeight: 500 } }}
            />
            {dayCount > 0 && (
              <Text size="sm" c="dimmed" mt={4}>
                {dayCount} day{dayCount > 1 ? 's' : ''} selected
              </Text>
            )}
          </Box>
          <Box mb={16}>
            <Select
              label="Session"
              data={SESSIONS}
              value={session}
              onChange={setSession}
              required
              styles={{ label: { marginBottom: 8, fontWeight: 500 } }}
            />
          </Box>
          <Box mb={16}>
            <Select
              label="Leave Type"
              data={LEAVE_TYPES}
              value={leaveType}
              onChange={setLeaveType}
              required
              styles={{ label: { marginBottom: 8, fontWeight: 500 } }}
            />
          </Box>
          <Box mb={24}>
            <Textarea
              label="Note (optional)"
              placeholder="Add any notes..."
              value={note}
              onChange={(e) => setNote(e.currentTarget.value)}
              styles={{ label: { marginBottom: 8, fontWeight: 500 } }}
            />
          </Box>
          <Group justify="flex-end" gap="sm">
            <Button variant="subtle" color="gray" onClick={closeModal}>
              Cancel
            </Button>
            <Button
              onClick={onSave}
              loading={isSaving}
              disabled={!clinicianId || !dateRange[0] || !session || !leaveType}
            >
              {dayCount > 1 ? `Add ${dayCount} Days` : 'Add Leave'}
            </Button>
          </Group>
        </Box>
      </Modal>
    </Box>
  );
};
