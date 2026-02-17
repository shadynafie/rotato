import { Badge, Box, Button, Group, Loader, Select, Stack, Tabs, Table, Text } from '@mantine/core';
import { notify } from '../../utils/notify';
import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import { getSurname } from '../../utils/formatters';

type Clinician = { id: number; name: string; role: 'consultant' | 'registrar' };
type Duty = { id: number; name: string };
type JobPlanWeek = {
  clinicianId: number;
  weekNo: number;
  dayOfWeek: number; // 1=Monday, 2=Tuesday, ..., 5=Friday
  amDutyId?: number | null;
  pmDutyId?: number | null;
  amSupportingClinicianId?: number | null;
  pmSupportingClinicianId?: number | null;
};

const fetchJobPlanData = async () => {
  const [cliniciansRes, dutiesRes, jobPlanRes] = await Promise.all([
    api.get<Clinician[]>('/api/clinicians'),
    api.get<Duty[]>('/api/duties'),
    api.get<JobPlanWeek[]>('/api/job-plans')
  ]);
  return { clinicians: cliniciansRes.data, duties: dutiesRes.data, jobPlans: jobPlanRes.data };
};

const weeks = [1, 2, 3, 4, 5];
const days = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
];

export const JobPlansPage: React.FC = () => {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['jobplan-data'], queryFn: fetchJobPlanData });
  const [dirty, setDirty] = useState<Record<string, JobPlanWeek>>({});
  const [activeWeek, setActiveWeek] = useState('1');

  const dutyOptions = useMemo(
    () => (data?.duties || []).map((d) => ({ value: d.id.toString(), label: d.name })),
    [data?.duties]
  );

  // Build duty lookup for names
  const dutyById = useMemo(() => {
    const map = new Map<number, string>();
    (data?.duties || []).forEach((d) => map.set(d.id, d.name));
    return map;
  }, [data?.duties]);

  const planByKey = useMemo(() => {
    const map = new Map<string, JobPlanWeek>();
    data?.jobPlans.forEach((p) => map.set(`${p.clinicianId}-${p.weekNo}-${p.dayOfWeek}`, p));
    return map;
  }, [data?.jobPlans]);

  // Get consultant options for a specific slot (only those with the SAME duty as the registrar)
  const getConsultantOptionsForSlot = (weekNo: number, dayOfWeek: number, session: 'AM' | 'PM', registrarDutyId: number | null | undefined) => {
    if (!registrarDutyId) return [];

    const consultants = (data?.clinicians || []).filter((c) => c.role === 'consultant');
    const options: { value: string; label: string }[] = [];

    for (const consultant of consultants) {
      const key = `${consultant.id}-${weekNo}-${dayOfWeek}`;
      const plan = dirty[key] || planByKey.get(key);
      const consultantDutyId = session === 'AM' ? plan?.amDutyId : plan?.pmDutyId;

      // Only show consultants with the same duty as the registrar
      if (consultantDutyId === registrarDutyId) {
        const dutyName = dutyById.get(consultantDutyId) || 'Duty';
        const surname = getSurname(consultant.name);
        options.push({
          value: consultant.id.toString(),
          label: `${surname} ${dutyName}`
        });
      }
    }

    return options;
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = Object.values(dirty);
      if (payload.length === 0) return;
      await api.put('/api/job-plans', payload);
    },
    onSuccess: () => {
      setDirty({});
      qc.invalidateQueries({ queryKey: ['jobplan-data'] });
      notify.show({
        title: 'Success',
        message: 'Job plans saved successfully',
        color: 'green',
      });
    },
    onError: (error: any) => {
      notify.show({
        title: 'Error',
        message: error?.response?.data?.message || error?.message || 'Failed to save job plans',
        color: 'red',
      });
    },
  });

  const setCell = (
    clinicianId: number,
    weekNo: number,
    dayOfWeek: number,
    field: 'amDutyId' | 'pmDutyId' | 'amSupportingClinicianId' | 'pmSupportingClinicianId',
    value: number | null
  ) => {
    const key = `${clinicianId}-${weekNo}-${dayOfWeek}`;
    const existing = dirty[key] || planByKey.get(key) || { clinicianId, weekNo, dayOfWeek };
    const updated: JobPlanWeek = { ...existing, [field]: value ?? null };
    // If clearing a duty, also clear the supporting clinician
    if ((field === 'amDutyId' && value === null) || (field === 'pmDutyId' && value === null)) {
      const supportField = field === 'amDutyId' ? 'amSupportingClinicianId' : 'pmSupportingClinicianId';
      updated[supportField] = null;
    }
    setDirty((d) => ({ ...d, [key]: updated }));
  };

  const hasChanges = Object.keys(dirty).length > 0;
  const currentWeekNo = Number(activeWeek);

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
            Job Plans
          </Text>
          <Text style={{ fontSize: '1.0625rem', color: '#86868b' }}>
            Configure weekly duty schedules for each clinician (Mon-Fri, Week 1-5 repeating monthly)
          </Text>
        </Box>
        <Button
          onClick={() => saveMutation.mutate()}
          loading={saveMutation.isPending}
          disabled={!hasChanges}
          leftSection={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
              <polyline points="17 21 17 13 7 13 7 21"/>
              <polyline points="7 3 7 8 15 8"/>
            </svg>
          }
        >
          {hasChanges ? 'Save Changes' : 'No Changes'}
        </Button>
      </Group>

      {/* Loading State */}
      {isLoading && (
        <Box ta="center" py={60}>
          <Loader size="lg" color="#0071e3" />
          <Text mt="md" c="dimmed">Loading job plans...</Text>
        </Box>
      )}

      {/* Week Tabs and Table */}
      {data && (
        <Box
          style={{
            backgroundColor: '#ffffff',
            borderRadius: 16,
            overflow: 'hidden',
            border: '1px solid rgba(0, 0, 0, 0.06)',
          }}
        >
          <Tabs value={activeWeek} onChange={(v) => setActiveWeek(v || '1')}>
            <Tabs.List
              style={{
                backgroundColor: '#fafafa',
                borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
                padding: '0 16px',
              }}
            >
              {weeks.map((w) => (
                <Tabs.Tab
                  key={w}
                  value={w.toString()}
                  style={{ fontWeight: 500 }}
                >
                  Week {w}
                </Tabs.Tab>
              ))}
            </Tabs.List>

            {weeks.map((weekNo) => (
              <Tabs.Panel key={weekNo} value={weekNo.toString()}>
                <Box style={{ overflowX: 'auto' }}>
                  <Table verticalSpacing="md" horizontalSpacing="md">
                    <Table.Thead>
                      <Table.Tr style={{ backgroundColor: '#fafafa' }}>
                        <Table.Th style={{ minWidth: 160, position: 'sticky', left: 0, backgroundColor: '#fafafa', zIndex: 1 }}>
                          Clinician
                        </Table.Th>
                        {days.map((day) => (
                          <Table.Th key={day.value} style={{ minWidth: 140, textAlign: 'center' }}>
                            <Text fw={600} c="#1d1d1f">{day.label}</Text>
                          </Table.Th>
                        ))}
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {data.clinicians.map((c) => (
                        <Table.Tr key={c.id}>
                          <Table.Td style={{ position: 'sticky', left: 0, backgroundColor: '#fff', zIndex: 1 }}>
                            <Box>
                              <Text fw={500} c="#1d1d1f" size="sm">{c.name}</Text>
                              <Badge
                                variant="light"
                                color={c.role === 'consultant' ? 'blue' : 'grape'}
                                radius="md"
                                size="xs"
                                mt={4}
                                tt="capitalize"
                              >
                                {c.role}
                              </Badge>
                            </Box>
                          </Table.Td>
                          {days.map((day) => {
                            const key = `${c.id}-${weekNo}-${day.value}`;
                            const plan = dirty[key] || planByKey.get(key);
                            const isModified = !!dirty[key];
                            return (
                              <Table.Td
                                key={key}
                                style={{
                                  backgroundColor: isModified ? 'rgba(0, 113, 227, 0.04)' : 'transparent',
                                  verticalAlign: 'top',
                                }}
                              >
                                <Stack gap={6}>
                                  <Box>
                                    <Text size="xs" fw={500} c="blue" mb={2}>AM</Text>
                                    <Select
                                      placeholder="—"
                                      data={dutyOptions}
                                      value={plan?.amDutyId?.toString() ?? null}
                                      onChange={(v) => setCell(c.id, weekNo, day.value, 'amDutyId', v ? Number(v) : null)}
                                      clearable
                                      size="xs"
                                      styles={{
                                        input: { fontSize: '0.75rem' }
                                      }}
                                    />
                                    {c.role === 'registrar' && plan?.amDutyId && (
                                      <Select
                                        placeholder="Supporting..."
                                        data={getConsultantOptionsForSlot(weekNo, day.value, 'AM', plan?.amDutyId)}
                                        value={plan?.amSupportingClinicianId?.toString() ?? null}
                                        onChange={(v) => setCell(c.id, weekNo, day.value, 'amSupportingClinicianId', v ? Number(v) : null)}
                                        clearable
                                        size="xs"
                                        mt={4}
                                        styles={{
                                          input: { fontSize: '0.7rem', fontStyle: 'italic' }
                                        }}
                                      />
                                    )}
                                  </Box>
                                  <Box>
                                    <Text size="xs" fw={500} c="orange" mb={2}>PM</Text>
                                    <Select
                                      placeholder="—"
                                      data={dutyOptions}
                                      value={plan?.pmDutyId?.toString() ?? null}
                                      onChange={(v) => setCell(c.id, weekNo, day.value, 'pmDutyId', v ? Number(v) : null)}
                                      clearable
                                      size="xs"
                                      styles={{
                                        input: { fontSize: '0.75rem' }
                                      }}
                                    />
                                    {c.role === 'registrar' && plan?.pmDutyId && (
                                      <Select
                                        placeholder="Supporting..."
                                        data={getConsultantOptionsForSlot(weekNo, day.value, 'PM', plan?.pmDutyId)}
                                        value={plan?.pmSupportingClinicianId?.toString() ?? null}
                                        onChange={(v) => setCell(c.id, weekNo, day.value, 'pmSupportingClinicianId', v ? Number(v) : null)}
                                        clearable
                                        size="xs"
                                        mt={4}
                                        styles={{
                                          input: { fontSize: '0.7rem', fontStyle: 'italic' }
                                        }}
                                      />
                                    )}
                                  </Box>
                                </Stack>
                              </Table.Td>
                            );
                          })}
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Box>
              </Tabs.Panel>
            ))}
          </Tabs>
        </Box>
      )}

      {/* Empty State */}
      {data && data.clinicians.length === 0 && (
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
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </Box>
          <Text fw={500} c="#1d1d1f" mb={4}>No clinicians found</Text>
          <Text c="dimmed" size="sm">Add clinicians first to configure their job plans</Text>
        </Box>
      )}
    </Box>
  );
};
