import { ActionIcon, Badge, Box, Button, Collapse, Group, Loader, Modal, Progress, Stack, Table, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { notify } from '../../utils/notify';
import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import { formatDateWithWeekday, getSurname } from '../../utils/formatters';

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
  consultantId?: number | null;
  consultant?: Clinician | null;
  dutyId: number;
  duty: Duty;
  reason: 'leave' | 'oncall_conflict' | 'manual';
  status: 'pending' | 'assigned' | 'cancelled';
  absentRegistrarId?: number | null;
  absentRegistrar?: Clinician | null;
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
  dutiesIn30Days: number;
  oncallsIn30Days: number;
  coveragesIn30Days: number;
  daysSinceCoverage: number | null;
  daysSinceOncall: number | null;
};

type UnavailableRegistrar = {
  clinicianId: number;
  clinicianName: string;
  grade: string | null;
  unavailabilityReason: string;
  unavailabilityLabel: string;
};

type SuggestionResult = {
  available: SuggestedRegistrar[];
  unavailable: UnavailableRegistrar[];
};

const fetchCoverageRequests = async () => {
  const res = await api.get<CoverageRequest[]>('/api/coverage');
  return res.data;
};

const fetchSuggestions = async (requestId: number) => {
  const res = await api.get<SuggestionResult>(`/api/coverage/${requestId}/suggestions`);
  return res.data;
};

const reasonLabels: Record<string, string> = {
  leave: 'On Leave',
  oncall_conflict: 'On-call Conflict',
  manual: 'Manual Request',
};

// Format the "covering for" display
const formatCoveringFor = (request: CoverageRequest): { text: string; subtext?: string } => {
  if (request.absentRegistrar) {
    return {
      text: request.absentRegistrar.name,
      subtext: reasonLabels[request.reason] || request.reason
    };
  }
  // Fallback for older requests without absentRegistrar
  return { text: reasonLabels[request.reason] || request.reason };
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
  const [unavailableExpanded, setUnavailableExpanded] = useState(false);
  const [requestToDelete, setRequestToDelete] = useState<CoverageRequest | null>(null);

  const listQuery = useQuery({ queryKey: ['coverage'], queryFn: fetchCoverageRequests });

  const suggestionsQuery = useQuery({
    queryKey: ['coverage-suggestions', selectedRequest?.id],
    queryFn: () => selectedRequest ? fetchSuggestions(selectedRequest.id) : Promise.resolve({ available: [], unavailable: [] }),
    enabled: !!selectedRequest && assignModalOpen
  });

  const assignMutation = useMutation({
    mutationFn: async ({ id, registrarId }: { id: number; registrarId: number }) =>
      api.patch(`/api/coverage/${id}`, { assignedRegistrarId: registrarId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['coverage'] });
      notify.show({
        title: 'Success',
        message: 'Registrar assigned successfully',
        color: 'green',
      });
      setAssignModalOpen(false);
      setSelectedRequest(null);
      setSelectedRegistrarId(null);
    },
    onError: (error: any) => {
      notify.show({
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
      notify.show({
        title: 'Success',
        message: 'Assignment removed',
        color: 'green',
      });
    },
    onError: (error: any) => {
      notify.show({
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
      notify.show({
        title: 'Success',
        message: 'Coverage request cancelled',
        color: 'green',
      });
    },
    onError: (error: any) => {
      notify.show({
        title: 'Error',
        message: error?.response?.data?.message || error?.message || 'Failed to cancel request',
        color: 'red',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => api.delete(`/api/coverage/${id}/permanent`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['coverage'] });
      notify.show({
        title: 'Deleted',
        message: 'Coverage request permanently deleted',
        color: 'green',
      });
      setRequestToDelete(null);
    },
    onError: (error: any) => {
      notify.show({
        title: 'Error',
        message: error?.response?.data?.message || error?.message || 'Failed to delete request',
        color: 'red',
      });
    },
  });

  const bulkAutoAssignMutation = useMutation({
    mutationFn: async () => api.post<{ assigned: number; failed: number }>('/api/coverage/bulk-auto-assign'),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['coverage'] });
      const { assigned, failed } = res.data;
      notify.show({
        title: 'Bulk Assignment Complete',
        message: `Assigned ${assigned} request${assigned !== 1 ? 's' : ''}${failed > 0 ? `, ${failed} failed` : ''}`,
        color: failed > 0 ? 'orange' : 'green',
      });
    },
    onError: (error: any) => {
      notify.show({
        title: 'Error',
        message: error?.response?.data?.message || error?.message || 'Failed to auto-assign',
        color: 'red',
      });
    },
  });

  const openAssignModal = (request: CoverageRequest) => {
    setSelectedRequest(request);
    setSelectedRegistrarId(request.assignedRegistrarId || null);
    setUnavailableExpanded(false);
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

  // Get score color (0-100 scale)
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'green';
    if (score >= 60) return 'teal';
    if (score >= 40) return 'blue';
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
                <Table.Th>Covering For</Table.Th>
                <Table.Th>Activity</Table.Th>
                <Table.Th>Consultant</Table.Th>
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
                    <Text fw={500} c="#1d1d1f">{formatDateWithWeekday(r.date)}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="light" color="blue" radius="md">
                      {r.session}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    {(() => {
                      const covering = formatCoveringFor(r);
                      return (
                        <Box>
                          <Text c="#1d1d1f" fw={500}>{covering.text}</Text>
                          {covering.subtext && (
                            <Text size="xs" c="dimmed">{covering.subtext}</Text>
                          )}
                        </Box>
                      );
                    })()}
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
                    {r.consultant ? (
                      <Text c="#1d1d1f">{r.consultant.name}</Text>
                    ) : (
                      <Text c="dimmed" size="sm" fs="italic">Independent</Text>
                    )}
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
                      {r.status === 'cancelled' && (
                        <Tooltip label="Delete permanently" withArrow>
                          <ActionIcon
                            variant="light"
                            color="red"
                            onClick={() => setRequestToDelete(r)}
                            radius="md"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6"/>
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                              <line x1="10" y1="11" x2="10" y2="17"/>
                              <line x1="14" y1="11" x2="14" y2="17"/>
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
            <Box mb={16} p={14} style={{ backgroundColor: '#f5f5f7', borderRadius: 12 }}>
              <Group gap="sm" align="center" mb={4}>
                {selectedRequest.duty.color && (
                  <Box
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      backgroundColor: selectedRequest.duty.color,
                    }}
                  />
                )}
                <Text fw={600} size="lg" c="#1d1d1f">
                  {selectedRequest.consultant
                    ? `${getSurname(selectedRequest.consultant.name)} ${selectedRequest.duty.name}`
                    : selectedRequest.duty.name}
                </Text>
              </Group>
              <Text size="sm" c="dimmed" mb={4}>
                {formatDateWithWeekday(selectedRequest.date)} - {selectedRequest.session}
              </Text>
              {selectedRequest.absentRegistrar && (
                <Text size="sm" c="#1d1d1f">
                  {selectedRequest.absentRegistrar.name}{' '}
                  <Text span c="dimmed">({reasonLabels[selectedRequest.reason]})</Text>
                </Text>
              )}
              {!selectedRequest.consultant && !selectedRequest.absentRegistrar && (
                <Text size="sm" c="dimmed" fs="italic">Independent duty</Text>
              )}
            </Box>

            <Text fw={500} mb={12}>Available Registrars</Text>

            {suggestionsQuery.isLoading && (
              <Box ta="center" py={24}>
                <Loader size="sm" color="#0071e3" />
                <Text size="sm" c="dimmed" mt={8}>Finding best matches...</Text>
              </Box>
            )}

            {suggestionsQuery.data && suggestionsQuery.data.available.length === 0 && (
              <Box ta="center" py={24} style={{ backgroundColor: '#fff5f5', borderRadius: 8 }}>
                <Text size="sm" c="red">No registrars available for this time slot</Text>
              </Box>
            )}

            {suggestionsQuery.data && suggestionsQuery.data.available.length > 0 && (
              <Stack gap="xs" mb={16}>
                {suggestionsQuery.data.available.map((suggestion, index) => (
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
                        <Group gap="xs">
                          {suggestion.reasons.slice(0, 2).map((reason, i) => (
                            <Text key={i} size="xs" c="dimmed">
                              {i > 0 && '•'} {reason}
                            </Text>
                          ))}
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
                          value={suggestion.score}
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

            {/* Unavailable Section */}
            {suggestionsQuery.data && suggestionsQuery.data.unavailable.length > 0 && (
              <Box mb={16}>
                <UnstyledButton
                  onClick={() => setUnavailableExpanded(!unavailableExpanded)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 12px',
                    borderRadius: 8,
                    backgroundColor: '#f5f5f7',
                    width: '100%',
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#86868b"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                      transform: unavailableExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                      transition: 'transform 200ms ease',
                    }}
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                  <Text size="sm" c="dimmed" fw={500}>
                    Unavailable ({suggestionsQuery.data.unavailable.length})
                  </Text>
                </UnstyledButton>

                <Collapse in={unavailableExpanded}>
                  <Stack gap="xs" mt={8} pl={8}>
                    {suggestionsQuery.data.unavailable.map((registrar) => (
                      <Box
                        key={registrar.clinicianId}
                        style={{
                          padding: '10px 12px',
                          borderRadius: 8,
                          backgroundColor: '#fafafa',
                          border: '1px solid rgba(0, 0, 0, 0.04)',
                        }}
                      >
                        <Group justify="space-between">
                          <Group gap="sm">
                            <Text size="sm" c="#666">{registrar.clinicianName}</Text>
                            {registrar.grade && (
                              <Badge variant="outline" color="gray" size="xs" tt="capitalize">
                                {registrar.grade}
                              </Badge>
                            )}
                          </Group>
                          <Badge color="red" size="sm" variant="light">
                            {registrar.unavailabilityLabel}
                          </Badge>
                        </Group>
                      </Box>
                    ))}
                  </Stack>
                </Collapse>
              </Box>
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

      {/* Delete Confirmation Modal */}
      <Modal
        opened={!!requestToDelete}
        onClose={() => setRequestToDelete(null)}
        title={
          <Group gap="xs">
            <Box
              style={{
                width: 28,
                height: 28,
                backgroundColor: 'rgba(255, 59, 48, 0.1)',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ff3b30" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
            </Box>
            <Text fw={600}>Delete Coverage Request</Text>
          </Group>
        }
        size="sm"
        centered
      >
        {requestToDelete && (
          <Box>
            <Text size="sm" c="dimmed" mb={16}>
              Are you sure you want to permanently delete this coverage request? This action cannot be undone.
            </Text>
            <Box
              p={12}
              mb={20}
              style={{
                backgroundColor: '#f5f5f7',
                borderRadius: 8,
              }}
            >
              <Text size="sm" fw={500}>{requestToDelete.duty.name}</Text>
              <Text size="xs" c="dimmed">
                {formatDateWithWeekday(requestToDelete.date)} - {requestToDelete.session}
              </Text>
              {requestToDelete.absentRegistrar && (
                <Text size="xs" c="dimmed">
                  Absent: {requestToDelete.absentRegistrar.name}
                </Text>
              )}
              {requestToDelete.consultant && (
                <Text size="xs" c="dimmed">
                  Consultant: {requestToDelete.consultant.name}
                </Text>
              )}
            </Box>
            <Group justify="flex-end" gap="sm">
              <Button
                variant="subtle"
                color="gray"
                onClick={() => setRequestToDelete(null)}
              >
                Cancel
              </Button>
              <Button
                color="red"
                onClick={() => deleteMutation.mutate(requestToDelete.id)}
                loading={deleteMutation.isPending}
              >
                Delete
              </Button>
            </Group>
          </Box>
        )}
      </Modal>
    </Box>
  );
};
