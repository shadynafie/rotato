import { ActionIcon, Badge, Box, Button, Group, Loader, Modal, Progress, Stack, Table, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';

type Clinician = {
  id: number;
  name: string;
  role: string;
  grade?: string | null;
};

type Duty = {
  id: number;
  name: string;
  color?: string | null;
};

type CoverageRequest = {
  id: number;
  date: string;
  session: 'AM' | 'PM';
  consultantId: number;
  consultant: Clinician;
  dutyId: number;
  duty: Duty;
  reason: 'leave' | 'oncall_conflict' | 'manual';
  status: 'pending' | 'assigned' | 'cancelled';
  assignedRegistrarId?: number | null;
  assignedRegistrar?: Clinician | null;
  assignedAt?: string | null;
  note?: string | null;
};

type SuggestedRegistrar = {
  clinicianId: number;
  clinicianName: string;
  grade: string | null;
  score: number;
  reasons: string[];
  workloadCount: number;
  lastAssignedDate: string | null;
};

const fetchCoverageRequests = async () => {
  const res = await api.get<CoverageRequest[]>('/api/coverage');
  return res.data;
};

const fetchSuggestions = async (requestId: number) => {
  const res = await api.get<{ suggestions: SuggestedRegistrar[] }>(`/api/coverage/${requestId}/suggestions`);
  return res.data.suggestions;
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

const reasonLabels: Record<string, string> = {
  leave: 'Leave',
  oncall_conflict: 'On-call Conflict',
  manual: 'Manual',
};

const statusColors: Record<string, string> = {
  pending: 'orange',
  assigned: 'green',
  cancelled: 'gray',
};

export const CoveragePage: React.FC = () => {
  const qc = useQueryClient();
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<CoverageRequest | null>(null);
  const [selectedRegistrarId, setSelectedRegistrarId] = useState<number | null>(null);

  const listQuery = useQuery({ queryKey: ['coverage'], queryFn: fetchCoverageRequests });

  const suggestionsQuery = useQuery({
    queryKey: ['coverage-suggestions', selectedRequest?.id],
    queryFn: () => selectedRequest ? fetchSuggestions(selectedRequest.id) : Promise.resolve([]),
    enabled: !!selectedRequest && assignModalOpen
  });

  const assignMutation = useMutation({
    mutationFn: async ({ id, registrarId }: { id: number; registrarId: number }) =>
      api.patch(`/api/coverage/${id}`, { assignedRegistrarId: registrarId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['coverage'] });
      notifications.show({
        title: 'Success',
        message: 'Registrar assigned successfully',
        color: 'green',
      });
      setAssignModalOpen(false);
      setSelectedRequest(null);
      setSelectedRegistrarId(null);
    },
    onError: (error: any) => {
      notifications.show({
        title: 'Error',
        message: error?.response?.data?.message || error?.message || 'Failed to assign registrar',
        color: 'red',
      });
    },
  });

  const unassignMutation = useMutation({
    mutationFn: async (id: number) =>
      api.patch(`/api/coverage/${id}`, { assignedRegistrarId: null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['coverage'] });
      notifications.show({
        title: 'Success',
        message: 'Assignment removed',
        color: 'green',
      });
    },
    onError: (error: any) => {
      notifications.show({
        title: 'Error',
        message: error?.response?.data?.message || error?.message || 'Failed to remove assignment',
        color: 'red',
      });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: number) => api.delete(`/api/coverage/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['coverage'] });
      notifications.show({
        title: 'Success',
        message: 'Coverage request cancelled',
        color: 'green',
      });
    },
    onError: (error: any) => {
      notifications.show({
        title: 'Error',
        message: error?.response?.data?.message || error?.message || 'Failed to cancel request',
        color: 'red',
      });
    },
  });

  const bulkAutoAssignMutation = useMutation({
    mutationFn: async () => api.post<{ assigned: number; failed: number }>('/api/coverage/bulk-auto-assign'),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['coverage'] });
      const { assigned, failed } = res.data;
      notifications.show({
        title: 'Bulk Assignment Complete',
        message: `Assigned ${assigned} request${assigned !== 1 ? 's' : ''}${failed > 0 ? `, ${failed} failed` : ''}`,
        color: failed > 0 ? 'orange' : 'green',
      });
    },
    onError: (error: any) => {
      notifications.show({
        title: 'Error',
        message: error?.response?.data?.message || error?.message || 'Failed to auto-assign',
        color: 'red',
      });
    },
  });

  const openAssignModal = (request: CoverageRequest) => {
    setSelectedRequest(request);
    setSelectedRegistrarId(request.assignedRegistrarId || null);
    setAssignModalOpen(true);
  };

  const onAssign = () => {
    if (selectedRequest && selectedRegistrarId) {
      assignMutation.mutate({
        id: selectedRequest.id,
        registrarId: selectedRegistrarId
      });
    }
  };

  const pendingCount = listQuery.data?.filter(r => r.status === 'pending').length || 0;

  // Sort: pending first, then by date
  const sortedData = [...(listQuery.data || [])].sort((a, b) => {
    if (a.status === 'pending' && b.status !== 'pending') return -1;
    if (a.status !== 'pending' && b.status === 'pending') return 1;
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });

  // Get score color
  const getScoreColor = (score: number) => {
    if (score >= 150) return 'green';
    if (score >= 120) return 'teal';
    if (score >= 100) return 'blue';
    return 'gray';
  };

  return (
    <Box>
      {/* Page Header */}
      <Group justify="space-between" mb={32}>
        <Box>
          <Group gap="sm" align="center">
            <Text
              style={{
                fontSize: '2rem',
                fontWeight: 700,
                color: '#1d1d1f',
                letterSpacing: '-0.025em',
              }}
            >
              Coverage
            </Text>
            {pendingCount > 0 && (
              <Badge color="orange" size="lg" radius="md">
                {pendingCount} pending
              </Badge>
            )}
          </Group>
          <Text style={{ fontSize: '1.0625rem', color: '#86868b', marginTop: 8 }}>
            Manage registrar coverage for consultant activities
          </Text>
        </Box>
        {pendingCount > 0 && (
          <Button
            variant="light"
            color="grape"
            onClick={() => bulkAutoAssignMutation.mutate()}
            loading={bulkAutoAssignMutation.isPending}
            leftSection={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
              </svg>
            }
          >
            Auto-assign All
          </Button>
        )}
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
              backgroundColor: '#e8f5e9',
              borderRadius: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4caf50" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20,6 9,17 4,12"/>
            </svg>
          </Box>
          <Text fw={500} c="#1d1d1f" mb={4}>No coverage requests</Text>
          <Text c="dimmed" size="sm">All activities are covered</Text>
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
                <Table.Th>Date</Table.Th>
                <Table.Th>Session</Table.Th>
                <Table.Th>Consultant</Table.Th>
                <Table.Th>Activity</Table.Th>
                <Table.Th>Reason</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Assigned To</Table.Th>
                <Table.Th style={{ width: 100 }}>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {sortedData.map((r) => (
                <Table.Tr
                  key={r.id}
                  style={{
                    backgroundColor: r.status === 'pending' ? 'rgba(255, 152, 0, 0.04)' : undefined
                  }}
                >
                  <Table.Td>
                    <Text fw={500} c="#1d1d1f">{formatDate(r.date)}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="light" color="blue" radius="md">
                      {r.session}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text c="#1d1d1f">{r.consultant.name}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      {r.duty.color && (
                        <Box
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            backgroundColor: r.duty.color,
                          }}
                        />
                      )}
                      <Text c="#1d1d1f">{r.duty.name}</Text>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Text c="dimmed" size="sm">{reasonLabels[r.reason] || r.reason}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge
                      variant="light"
                      color={statusColors[r.status]}
                      radius="md"
                      tt="capitalize"
                    >
                      {r.status}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    {r.assignedRegistrar ? (
                      <Group gap="xs">
                        <Text c="#1d1d1f">{r.assignedRegistrar.name}</Text>
                        {r.assignedRegistrar.grade && (
                          <Badge variant="outline" color="grape" size="xs" tt="capitalize">
                            {r.assignedRegistrar.grade}
                          </Badge>
                        )}
                      </Group>
                    ) : (
                      <Text c="dimmed" size="sm">—</Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      {r.status === 'pending' && (
                        <Tooltip label="Assign registrar" withArrow>
                          <ActionIcon
                            variant="light"
                            color="green"
                            onClick={() => openAssignModal(r)}
                            radius="md"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                              <circle cx="8.5" cy="7" r="4"/>
                              <line x1="20" y1="8" x2="20" y2="14"/>
                              <line x1="23" y1="11" x2="17" y2="11"/>
                            </svg>
                          </ActionIcon>
                        </Tooltip>
                      )}
                      {r.status === 'assigned' && (
                        <Tooltip label="Remove assignment" withArrow>
                          <ActionIcon
                            variant="light"
                            color="orange"
                            onClick={() => unassignMutation.mutate(r.id)}
                            radius="md"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                              <circle cx="8.5" cy="7" r="4"/>
                              <line x1="18" y1="11" x2="23" y2="11"/>
                            </svg>
                          </ActionIcon>
                        </Tooltip>
                      )}
                      {r.status !== 'cancelled' && (
                        <Tooltip label="Cancel request" withArrow>
                          <ActionIcon
                            variant="light"
                            color="red"
                            onClick={() => cancelMutation.mutate(r.id)}
                            radius="md"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="18" y1="6" x2="6" y2="18"/>
                              <line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                          </ActionIcon>
                        </Tooltip>
                      )}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Box>
      )}

      {/* Assign Modal with Smart Suggestions */}
      <Modal
        opened={assignModalOpen}
        onClose={() => {
          setAssignModalOpen(false);
          setSelectedRequest(null);
          setSelectedRegistrarId(null);
        }}
        title={
          <Text fw={600} size="lg">Assign Registrar</Text>
        }
        size="lg"
      >
        {selectedRequest && (
          <Box>
            <Box mb={16} p={12} style={{ backgroundColor: '#f5f5f7', borderRadius: 8 }}>
              <Text size="sm" c="dimmed">Activity Details</Text>
              <Text fw={500}>{selectedRequest.duty.name}</Text>
              <Text size="sm" c="dimmed" mt={4}>
                {formatDate(selectedRequest.date)} - {selectedRequest.session}
              </Text>
              <Text size="sm" c="dimmed">
                Covering for: {selectedRequest.consultant.name}
              </Text>
            </Box>

            <Text fw={500} mb={12}>Smart Suggestions</Text>

            {suggestionsQuery.isLoading && (
              <Box ta="center" py={24}>
                <Loader size="sm" color="#0071e3" />
                <Text size="sm" c="dimmed" mt={8}>Finding best matches...</Text>
              </Box>
            )}

            {suggestionsQuery.data && suggestionsQuery.data.length === 0 && (
              <Box ta="center" py={24} style={{ backgroundColor: '#fff5f5', borderRadius: 8 }}>
                <Text size="sm" c="red">No registrars available for this time slot</Text>
              </Box>
            )}

            {suggestionsQuery.data && suggestionsQuery.data.length > 0 && (
              <Stack gap="xs" mb={24}>
                {suggestionsQuery.data.map((suggestion, index) => (
                  <UnstyledButton
                    key={suggestion.clinicianId}
                    onClick={() => setSelectedRegistrarId(suggestion.clinicianId)}
                    style={{
                      padding: '12px 16px',
                      borderRadius: 12,
                      border: selectedRegistrarId === suggestion.clinicianId
                        ? '2px solid #0071e3'
                        : '1px solid rgba(0, 0, 0, 0.08)',
                      backgroundColor: selectedRegistrarId === suggestion.clinicianId
                        ? 'rgba(0, 113, 227, 0.04)'
                        : '#ffffff',
                      transition: 'all 150ms ease',
                    }}
                  >
                    <Group justify="space-between" align="flex-start">
                      <Box style={{ flex: 1 }}>
                        <Group gap="sm" mb={4}>
                          <Text fw={500} c="#1d1d1f">{suggestion.clinicianName}</Text>
                          {suggestion.grade && (
                            <Badge variant="outline" color="grape" size="xs" tt="capitalize">
                              {suggestion.grade}
                            </Badge>
                          )}
                          {index === 0 && (
                            <Badge color="green" size="xs" variant="filled">
                              Best Match
                            </Badge>
                          )}
                        </Group>
                        <Group gap="xs" mb={8}>
                          {suggestion.reasons.slice(0, 2).map((reason, i) => (
                            <Text key={i} size="xs" c="dimmed">
                              {i > 0 && '•'} {reason}
                            </Text>
                          ))}
                        </Group>
                        <Group gap="md">
                          <Text size="xs" c="dimmed">
                            Workload: {suggestion.workloadCount} in last 30 days
                          </Text>
                          {suggestion.lastAssignedDate && (
                            <Text size="xs" c="dimmed">
                              Last assigned: {formatDate(suggestion.lastAssignedDate)}
                            </Text>
                          )}
                        </Group>
                      </Box>
                      <Box style={{ textAlign: 'right', minWidth: 80 }}>
                        <Text size="xs" c="dimmed" mb={4}>Score</Text>
                        <Badge
                          color={getScoreColor(suggestion.score)}
                          variant="light"
                          size="lg"
                          radius="md"
                        >
                          {suggestion.score}
                        </Badge>
                        <Progress
                          value={Math.min(100, (suggestion.score / 170) * 100)}
                          color={getScoreColor(suggestion.score)}
                          size="xs"
                          mt={6}
                          radius="xl"
                        />
                      </Box>
                    </Group>
                  </UnstyledButton>
                ))}
              </Stack>
            )}

            <Group justify="flex-end" gap="sm">
              <Button
                variant="subtle"
                color="gray"
                onClick={() => {
                  setAssignModalOpen(false);
                  setSelectedRequest(null);
                  setSelectedRegistrarId(null);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={onAssign}
                loading={assignMutation.isPending}
                disabled={!selectedRegistrarId}
              >
                Assign Selected
              </Button>
            </Group>
          </Box>
        )}
      </Modal>
    </Box>
  );
};
