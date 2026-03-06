import {
  Alert,
  Badge,
  Box,
  Button,
  Divider,
  Group,
  Modal,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Tooltip,
  ActionIcon,
  Timeline,
} from '@mantine/core';
import { notify } from '../../utils/notify';
import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import {
  PageHeader,
  LoadingSpinner,
  PhoneIcon,
  DeleteIcon,
  RefreshIcon,
  CalendarIcon,
} from '../../components';

// Types
interface OnCallSlot {
  id: number;
  name: string;
  role: 'consultant' | 'registrar';
  position: number;
  active: boolean;
  currentAssignment: SlotAssignment | null;
  assignments: SlotAssignment[];
}

interface SlotAssignment {
  id: number;
  slotId: number;
  clinicianId: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  clinician: Clinician;
}

interface OnCallConfig {
  id: number;
  role: 'consultant' | 'registrar';
  cycleLength: number;
  startDate: string;
  unitType: 'week' | 'day';
}

interface OnCallPattern {
  id: number;
  role: string;
  dayOfCycle: number;
  slotId: number;
  slot: OnCallSlot;
}

interface Clinician {
  id: number;
  name: string;
  role: 'consultant' | 'registrar';
  active: boolean;
}

// Fetch all data needed for the page
const fetchData = async () => {
  const [slotsRes, configRes, patternRes, cliniciansRes] = await Promise.all([
    api.get<{ consultant: OnCallSlot[]; registrar: OnCallSlot[] }>('/api/oncall-slots'),
    api.get<{ consultant: OnCallConfig | null; registrar: OnCallConfig | null }>('/api/oncall-config'),
    api.get<OnCallPattern[]>('/api/oncall-pattern'),
    api.get<Clinician[]>('/api/clinicians'),
  ]);
  return {
    slots: slotsRes.data,
    config: configRes.data,
    pattern: patternRes.data,
    clinicians: cliniciansRes.data.filter((c) => c.active),
  };
};

// Day of week labels - will be computed dynamically based on start date
const ALL_DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Helper to get day labels starting from a specific date
function getDayLabelsFromDate(startDateStr: string): string[] {
  const date = new Date(startDateStr + 'T00:00:00');
  const startDayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const labels: string[] = [];
  for (let i = 0; i < 7; i++) {
    const dayIdx = (startDayOfWeek + i) % 7;
    labels.push(ALL_DAY_LABELS[dayIdx]);
  }
  return labels;
}

// Helper to check if a day index (0-6) within a week is a weekend
function isWeekendDay(dayIdx: number, startDateStr: string): boolean {
  const date = new Date(startDateStr + 'T00:00:00');
  const startDayOfWeek = date.getDay();
  const actualDayOfWeek = (startDayOfWeek + dayIdx) % 7;
  return actualDayOfWeek === 0 || actualDayOfWeek === 6; // Sunday = 0, Saturday = 6
}

export const OnCallSlotsPage: React.FC = () => {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['oncall-slots', 'data'], queryFn: fetchData });

  // Config state (cycle length is auto-calculated from slot count)
  const [consStartDate, setConsStartDate] = useState('2024-01-01');
  const [regStartDate, setRegStartDate] = useState('2024-01-01');

  // Slot assignment state
  const [slotAssignments, setSlotAssignments] = useState<Record<number, number | null>>({});

  // Pattern editor modal state
  const [patternModalOpen, setPatternModalOpen] = useState(false);
  const [editablePattern, setEditablePattern] = useState<{ dayOfCycle: number; slotPosition: number }[]>([]);

  // Assignment modal state
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignModalSlot, setAssignModalSlot] = useState<OnCallSlot | null>(null);
  const [assignModalClinicianId, setAssignModalClinicianId] = useState<string | null>(null);
  const [assignModalEffectiveDate, setAssignModalEffectiveDate] = useState(() => {
    return new Date().toISOString().slice(0, 10);
  });

  // Start date warning modal state
  const [startDateWarningOpen, setStartDateWarningOpen] = useState(false);
  const [pendingStartDateChange, setPendingStartDateChange] = useState<{ role: 'consultant' | 'registrar'; newDate: string } | null>(null);

  // Update calendar modal state
  const [updateCalendarModalOpen, setUpdateCalendarModalOpen] = useState(false);
  const [updateFromDate, setUpdateFromDate] = useState(() => {
    const today = new Date();
    return today.toISOString().slice(0, 10);
  });
  const [updateToDate, setUpdateToDate] = useState(() => {
    const threeMonths = new Date();
    threeMonths.setMonth(threeMonths.getMonth() + 3);
    return threeMonths.toISOString().slice(0, 10);
  });

  // Initialize state from fetched data
  useEffect(() => {
    if (data) {
      // Set config dates
      if (data.config.consultant) {
        setConsStartDate(data.config.consultant.startDate.slice(0, 10));
      }
      if (data.config.registrar) {
        setRegStartDate(data.config.registrar.startDate.slice(0, 10));
      }

      // Set slot assignments
      const assignments: Record<number, number | null> = {};
      [...data.slots.consultant, ...data.slots.registrar].forEach((slot) => {
        assignments[slot.id] = slot.currentAssignment?.clinicianId ?? null;
      });
      setSlotAssignments(assignments);

      // Set pattern
      const patternData = data.pattern.map((p) => ({
        dayOfCycle: p.dayOfCycle,
        slotPosition: data.slots.registrar.find((s) => s.id === p.slotId)?.position ?? 1,
      }));
      setEditablePattern(patternData.sort((a, b) => a.dayOfCycle - b.dayOfCycle));
    }
  }, [data]);

  // Clinician options filtered by role
  const clinicianOptions = useMemo(() => {
    return (data?.clinicians || []).map((c) => ({
      value: c.id.toString(),
      label: c.name,
      role: c.role,
    }));
  }, [data?.clinicians]);

  // Slot options for pattern editor
  const registrarSlotOptions = useMemo(() => {
    return (data?.slots.registrar || []).map((s) => ({
      value: s.position.toString(),
      label: s.name,
    }));
  }, [data?.slots.registrar]);

  // Save config mutation (only start date - cycle length is auto-calculated)
  const saveConfigMutation = useMutation({
    mutationFn: async (params: { role: string; startDate: string }) => {
      return api.put(`/api/oncall-config/${params.role}`, {
        startDate: params.startDate,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['oncall-slots', 'data'] });
    },
  });

  // Add slot mutation
  const addSlotMutation = useMutation({
    mutationFn: async (role: 'consultant' | 'registrar') => {
      return api.post('/api/oncall-slots', { role });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['oncall-slots', 'data'] });
      notify.show({
        title: 'Success',
        message: 'New slot created',
        color: 'green',
      });
    },
    onError: (error: any) => {
      notify.show({
        title: 'Error',
        message: error?.response?.data?.message || 'Failed to create slot',
        color: 'red',
      });
    },
  });

  // Delete slot mutation
  const deleteSlotMutation = useMutation({
    mutationFn: async (slotId: number) => {
      return api.delete(`/api/oncall-slots/${slotId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['oncall-slots', 'data'] });
      notify.show({
        title: 'Success',
        message: 'Slot deleted',
        color: 'green',
      });
    },
    onError: (error: any) => {
      notify.show({
        title: 'Error',
        message: error?.response?.data?.message || 'Failed to delete slot',
        color: 'red',
      });
    },
  });

  // Quick assign mutation
  const quickAssignMutation = useMutation({
    mutationFn: async (params: { slotId: number; clinicianId: number; effectiveFrom: string }) => {
      return api.post('/api/oncall-slots/quick-assign', params);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['oncall-slots', 'data'] });
      setAssignModalOpen(false);
      notify.show({
        title: 'Success',
        message: 'Slot assignment saved',
        color: 'green',
      });
    },
    onError: (error: any) => {
      notify.show({
        title: 'Error',
        message: error?.response?.data?.message || 'Failed to save assignment',
        color: 'red',
      });
    },
  });

  // End assignment mutation (vacate slot)
  const endAssignmentMutation = useMutation({
    mutationFn: async (params: { assignmentId: number; effectiveTo: string }) => {
      return api.put(`/api/slot-assignments/${params.assignmentId}`, {
        effectiveTo: params.effectiveTo,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['oncall-slots', 'data'] });
      setAssignModalOpen(false);
      notify.show({
        title: 'Success',
        message: 'Assignment ended',
        color: 'green',
      });
    },
    onError: (error: any) => {
      notify.show({
        title: 'Error',
        message: error?.response?.data?.message || 'Failed to end assignment',
        color: 'red',
      });
    },
  });

  // Save pattern mutation
  const savePatternMutation = useMutation({
    mutationFn: async (pattern: { dayOfCycle: number; slotPosition: number }[]) => {
      return api.put('/api/oncall-pattern', { pattern });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['oncall-slots', 'data'] });
      setPatternModalOpen(false);
      notify.show({
        title: 'Success',
        message: 'Registrar pattern saved',
        color: 'green',
      });
    },
    onError: (error: any) => {
      notify.show({
        title: 'Error',
        message: error?.response?.data?.message || 'Failed to save pattern',
        color: 'red',
      });
    },
  });

  // Regenerate rota mutation
  const regenerateRotaMutation = useMutation({
    mutationFn: async (params: { from: string; to: string }) => {
      return api.post('/api/rota/generate', {
        from: params.from,
        to: params.to,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rota'] });
      setUpdateCalendarModalOpen(false);
      notify.show({
        title: 'Calendar Updated',
        message: 'On-call assignments have been regenerated for the selected date range',
        color: 'green',
      });
    },
    onError: (error: any) => {
      notify.show({
        title: 'Error',
        message: error?.response?.data?.message || 'Failed to regenerate rota',
        color: 'red',
      });
    },
  });

  // Open assignment modal for a slot
  const openAssignModal = (slot: OnCallSlot) => {
    setAssignModalSlot(slot);
    setAssignModalClinicianId(slot.currentAssignment?.clinicianId?.toString() ?? null);
    setAssignModalEffectiveDate(new Date().toISOString().slice(0, 10));
    setAssignModalOpen(true);
  };

  // Handle saving from assignment modal
  const handleAssignmentSave = () => {
    if (!assignModalSlot || !assignModalClinicianId) return;
    quickAssignMutation.mutate({
      slotId: assignModalSlot.id,
      clinicianId: Number(assignModalClinicianId),
      effectiveFrom: assignModalEffectiveDate,
    });
  };

  // Handle ending current assignment
  const handleEndAssignment = () => {
    if (!assignModalSlot?.currentAssignment) return;
    // End yesterday (day before effective date)
    const effectiveTo = new Date(assignModalEffectiveDate);
    effectiveTo.setDate(effectiveTo.getDate() - 1);
    endAssignmentMutation.mutate({
      assignmentId: assignModalSlot.currentAssignment.id,
      effectiveTo: effectiveTo.toISOString().slice(0, 10),
    });
  };

  // Handle pattern change
  const handlePatternChange = (dayOfCycle: number, slotPosition: string) => {
    setEditablePattern((prev) =>
      prev.map((p) => (p.dayOfCycle === dayOfCycle ? { ...p, slotPosition: Number(slotPosition) } : p))
    );
  };

  // Save config (only start date - cycle length is auto-calculated from slot count)
  const saveConfig = (role: 'consultant' | 'registrar') => {
    const newDate = role === 'consultant' ? consStartDate : regStartDate;
    const existingConfig = role === 'consultant' ? data?.config.consultant : data?.config.registrar;

    // If there's an existing start date that differs, show warning
    if (existingConfig && existingConfig.startDate.slice(0, 10) !== newDate) {
      setPendingStartDateChange({ role, newDate });
      setStartDateWarningOpen(true);
      return;
    }

    // Otherwise, save directly
    doSaveConfig(role, newDate);
  };

  // Actually save the config
  const doSaveConfig = (role: 'consultant' | 'registrar', startDate: string) => {
    saveConfigMutation.mutate(
      { role, startDate },
      {
        onSuccess: () => {
          notify.show({
            title: 'Success',
            message: `${role === 'consultant' ? 'Consultant' : 'Registrar'} start date saved`,
            color: 'green',
          });
        },
      }
    );
  };

  // Confirm start date change (from warning modal)
  const confirmStartDateChange = () => {
    if (pendingStartDateChange) {
      doSaveConfig(pendingStartDateChange.role, pendingStartDateChange.newDate);
      setStartDateWarningOpen(false);
      setPendingStartDateChange(null);
    }
  };

  // Render slot card
  const renderSlotCard = (
    role: 'consultant' | 'registrar',
    slots: OnCallSlot[],
    startDate: string,
    setStartDate: (v: string) => void,
    unitType: string
  ) => {
    const isConsultant = role === 'consultant';
    const color = isConsultant ? 'blue' : 'grape';
    const iconColor = isConsultant ? '#0071e3' : '#af52de';
    const bgColor = isConsultant ? 'rgba(0, 113, 227, 0.1)' : 'rgba(175, 82, 222, 0.1)';
    // Cycle length is auto-calculated: consultants = slot count, registrars = slot count × 7
    const cycleLength = isConsultant ? slots.length : slots.length * 7;

    return (
      <Box
        style={{
          backgroundColor: '#ffffff',
          borderRadius: 16,
          overflow: 'hidden',
          border: '1px solid rgba(0, 0, 0, 0.06)',
        }}
      >
        {/* Card Header */}
        <Box
          px={24}
          py={20}
          style={{
            backgroundColor: '#fafafa',
            borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
          }}
        >
          <Group justify="space-between" align="center">
            <Group gap="sm">
              <Box
                style={{
                  width: 40,
                  height: 40,
                  backgroundColor: bgColor,
                  borderRadius: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <PhoneIcon size={20} color={iconColor} />
              </Box>
              <Box>
                <Text fw={600} c="#1d1d1f">
                  {isConsultant ? 'Consultants' : 'Registrars'}
                </Text>
                <Text size="sm" c="dimmed">
                  Slot-based on-call rotation
                </Text>
              </Box>
            </Group>
            <Group gap="xs">
              <Badge variant="light" color={color} radius="md">
                {cycleLength} {unitType} cycle
              </Badge>
              <Button
                size="xs"
                variant="light"
                onClick={() => addSlotMutation.mutate(role)}
                loading={addSlotMutation.isPending}
              >
                Add Slot
              </Button>
            </Group>
          </Group>
        </Box>

        {/* Config Section */}
        <Box px={24} py={16} style={{ borderBottom: '1px solid rgba(0, 0, 0, 0.04)' }}>
          <Group align="flex-end" gap="md" wrap="wrap">
            <TextInput
              label="Cycle start date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.currentTarget.value)}
              styles={{ input: { width: 180 } }}
            />
            <Button
              size="sm"
              variant="light"
              onClick={() => saveConfig(role)}
              loading={saveConfigMutation.isPending}
            >
              Save Start Date
            </Button>
          </Group>
        </Box>

        {/* Slots Table */}
        {slots.length > 0 ? (
          <Table verticalSpacing="sm" horizontalSpacing="lg">
            <Table.Thead>
              <Table.Tr>
                <Table.Th style={{ width: 60 }}>Slot</Table.Th>
                <Table.Th>Current Clinician</Table.Th>
                <Table.Th style={{ width: 60 }}>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {slots.map((slot) => {
                const current = slot.currentAssignment;
                return (
                  <Table.Tr key={slot.id}>
                    <Table.Td>
                      <Badge variant="light" color="gray" radius="md">
                        {slot.position}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <Box style={{ flex: 1 }}>
                          {current ? (
                            <Group gap="xs">
                              <Text size="sm" fw={500}>{current.clinician.name}</Text>
                              <Text size="xs" c="dimmed">
                                since {new Date(current.effectiveFrom).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </Text>
                            </Group>
                          ) : (
                            <Text size="sm" c="dimmed" fs="italic">Vacant</Text>
                          )}
                        </Box>
                        <Button
                          size="xs"
                          variant="light"
                          onClick={() => openAssignModal(slot)}
                        >
                          {current ? 'Change' : 'Assign'}
                        </Button>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Tooltip label={slot.currentAssignment ? 'End assignment first' : 'Delete slot'}>
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          onClick={() => deleteSlotMutation.mutate(slot.id)}
                          disabled={!!slot.currentAssignment || deleteSlotMutation.isPending}
                        >
                          <DeleteIcon />
                        </ActionIcon>
                      </Tooltip>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        ) : (
          <Box px={24} py={32} ta="center">
            <Text c="dimmed" size="sm">
              No slots configured. Click "Add Slot" to create one.
            </Text>
          </Box>
        )}
      </Box>
    );
  };

  // Initialize pattern for new cycle length
  const initializePatternForCycleLength = (length: number) => {
    const numSlots = data?.slots.registrar.length ?? 1;
    const newPattern: { dayOfCycle: number; slotPosition: number }[] = [];
    for (let day = 1; day <= length; day++) {
      // Default: cycle through available slots
      const slotPosition = ((day - 1) % numSlots) + 1;
      newPattern.push({ dayOfCycle: day, slotPosition });
    }
    setEditablePattern(newPattern);
  };

  // Render pattern section (registrars only)
  const renderPatternSection = () => {
    if (!data?.slots.registrar.length) return null;

    // Cycle length = number of registrar slots × 7
    const cycleLen = data.slots.registrar.length * 7;
    const numWeeks = data.slots.registrar.length;

    // Get dynamic day labels based on start date
    const dayLabels = getDayLabelsFromDate(regStartDate);

    // Group pattern by weeks (7 days each)
    const weeks: { dayOfCycle: number; slotPosition: number }[][] = [];
    for (let i = 0; i < numWeeks; i++) {
      const weekDays = editablePattern.slice(i * 7, Math.min((i + 1) * 7, cycleLen));
      if (weekDays.length > 0) {
        weeks.push(weekDays);
      }
    }

    // Check if pattern needs initialization (length mismatch)
    const patternNeedsInit = editablePattern.length !== cycleLen;

    return (
      <Box
        mt="lg"
        style={{
          backgroundColor: '#ffffff',
          borderRadius: 16,
          overflow: 'hidden',
          border: '1px solid rgba(0, 0, 0, 0.06)',
        }}
      >
        {/* Section Header */}
        <Box
          px={24}
          py={20}
          style={{
            backgroundColor: '#fafafa',
            borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
          }}
        >
          <Group justify="space-between" align="center">
            <Group gap="sm">
              <Box
                style={{
                  width: 40,
                  height: 40,
                  backgroundColor: 'rgba(52, 199, 89, 0.1)',
                  borderRadius: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <CalendarIcon size={20} color="#34c759" />
              </Box>
              <Box>
                <Text fw={600} c="#1d1d1f">
                  Registrar {cycleLen}-Day Pattern
                </Text>
                <Text size="sm" c="dimmed">
                  Configure which slot covers each day of the cycle
                </Text>
              </Box>
            </Group>
            <Group gap="xs">
              {patternNeedsInit && (
                <Button
                  size="xs"
                  variant="outline"
                  color="orange"
                  onClick={() => initializePatternForCycleLength(cycleLen)}
                >
                  Initialize Pattern
                </Button>
              )}
              <Button
                size="sm"
                variant="light"
                onClick={() => setPatternModalOpen(true)}
                disabled={patternNeedsInit}
              >
                Edit Pattern
              </Button>
            </Group>
          </Group>
        </Box>

        {/* Pattern Grid Preview */}
        <Box px={24} py={16}>
          {patternNeedsInit ? (
            <Box ta="center" py={24}>
              <Text c="orange" size="sm" fw={500}>
                Pattern length ({editablePattern.length}) doesn't match cycle length ({cycleLen}).
              </Text>
              <Text c="dimmed" size="sm" mt="xs">
                Click "Initialize Pattern" to create a new pattern, or adjust the cycle length.
              </Text>
            </Box>
          ) : (
            <>
              <Table withTableBorder withColumnBorders>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th style={{ width: 80 }}>Week</Table.Th>
                    {dayLabels.map((day) => (
                      <Table.Th key={day} style={{ textAlign: 'center' }}>
                        {day}
                      </Table.Th>
                    ))}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {weeks.map((week, weekIdx) => (
                    <Table.Tr key={weekIdx}>
                      <Table.Td>
                        <Badge variant="light" color="gray" size="sm">
                          Week {weekIdx + 1}
                        </Badge>
                      </Table.Td>
                      {week.map((day, dayIdx) => {
                        const slotName =
                          data?.slots.registrar.find((s) => s.position === day.slotPosition)?.name ||
                          `Slot ${day.slotPosition}`;
                        const isWeekend = isWeekendDay(dayIdx, regStartDate);
                        return (
                          <Table.Td
                            key={day.dayOfCycle}
                            style={{
                              textAlign: 'center',
                              backgroundColor: isWeekend ? 'rgba(255, 149, 0, 0.1)' : undefined,
                            }}
                          >
                            <Tooltip label={`Day ${day.dayOfCycle}: ${slotName}`}>
                              <Badge
                                variant="light"
                                color={isWeekend ? 'orange' : 'blue'}
                                size="sm"
                              >
                                {String(day.slotPosition).padStart(2, '0')}
                              </Badge>
                            </Tooltip>
                          </Table.Td>
                        );
                      })}
                      {/* Fill empty cells if week is incomplete */}
                      {week.length < 7 &&
                        Array.from({ length: 7 - week.length }).map((_, i) => (
                          <Table.Td key={`empty-${i}`} style={{ textAlign: 'center' }}>
                            <Text c="dimmed" size="xs">
                              -
                            </Text>
                          </Table.Td>
                        ))}
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
              <Text size="xs" c="dimmed" mt="sm">
                <Badge variant="light" color="orange" size="xs" mr={4}>
                  Orange
                </Badge>
                Weekend (Sat/Sun)
              </Text>
            </>
          )}
        </Box>
      </Box>
    );
  };

  // Pattern Editor Modal
  const renderPatternModal = () => {
    const cycleLen = (data?.slots.registrar.length ?? 0) * 7;
    const modalDayLabels = getDayLabelsFromDate(regStartDate);
    return (
    <Modal
      opened={patternModalOpen}
      onClose={() => setPatternModalOpen(false)}
      title={`Edit ${cycleLen}-Day Registrar Pattern`}
      size="xl"
    >
      <Box style={{ maxHeight: '60vh', overflow: 'auto' }}>
        <Table withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th style={{ width: 80 }}>Day</Table.Th>
              <Table.Th style={{ width: 80 }}>Weekday</Table.Th>
              <Table.Th>Slot</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {editablePattern.map((day, idx) => (
              <Table.Tr key={day.dayOfCycle}>
                <Table.Td>
                  <Badge variant="light" color="gray" size="sm">
                    Day {day.dayOfCycle}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    {modalDayLabels[idx % 7]}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Select
                    data={registrarSlotOptions}
                    value={day.slotPosition.toString()}
                    onChange={(v) => v && handlePatternChange(day.dayOfCycle, v)}
                    size="sm"
                  />
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Box>
      <Group justify="flex-end" mt="lg">
        <Button variant="default" onClick={() => setPatternModalOpen(false)}>
          Cancel
        </Button>
        <Button
          onClick={() => savePatternMutation.mutate(editablePattern)}
          loading={savePatternMutation.isPending}
        >
          Save Pattern
        </Button>
      </Group>
    </Modal>
  );
  };

  // Assignment Modal
  const renderAssignmentModal = () => {
    if (!assignModalSlot) return null;

    const current = assignModalSlot.currentAssignment;
    const role = assignModalSlot.role;
    const isChanging = current && assignModalClinicianId && Number(assignModalClinicianId) !== current.clinicianId;
    const isNewAssignment = !current && assignModalClinicianId;
    const isFutureDate = assignModalEffectiveDate > new Date().toISOString().slice(0, 10);

    // Sort assignments by date (most recent first)
    const pastAssignments = assignModalSlot.assignments
      .filter(a => a.effectiveTo !== null)
      .sort((a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime());

    return (
      <Modal
        opened={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        title={
          <Group gap="sm">
            <Badge variant="light" color="gray">{assignModalSlot.position}</Badge>
            <Text fw={600}>{assignModalSlot.name}</Text>
          </Group>
        }
        size="md"
      >
        <Stack gap="lg">
          {/* Current Assignment */}
          <Box>
            <Text size="sm" fw={500} c="dimmed" mb="xs">Current Assignment</Text>
            {current ? (
              <Box
                p="md"
                style={{
                  backgroundColor: 'rgba(0, 113, 227, 0.05)',
                  borderRadius: 8,
                  border: '1px solid rgba(0, 113, 227, 0.1)',
                }}
              >
                <Group justify="space-between">
                  <Box>
                    <Text fw={600}>{current.clinician.name}</Text>
                    <Text size="sm" c="dimmed">
                      Since {new Date(current.effectiveFrom).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </Text>
                  </Box>
                </Group>
              </Box>
            ) : (
              <Text size="sm" c="dimmed" fs="italic">This slot is currently vacant</Text>
            )}
          </Box>

          <Divider />

          {/* New Assignment */}
          <Box>
            <Text size="sm" fw={500} c="dimmed" mb="xs">
              {current ? 'Reassign To' : 'Assign To'}
            </Text>
            <Select
              data={clinicianOptions.filter((c) => c.role === role)}
              value={assignModalClinicianId}
              onChange={setAssignModalClinicianId}
              placeholder="Select clinician"
              searchable
              clearable
            />
          </Box>

          {/* Effective Date */}
          <Box>
            <Text size="sm" fw={500} c="dimmed" mb="xs">Effective From</Text>
            <TextInput
              type="date"
              value={assignModalEffectiveDate}
              onChange={(e) => setAssignModalEffectiveDate(e.currentTarget.value)}
              description={isFutureDate ?
                "Scheduling handover for a future date" :
                "Changes take effect immediately"}
            />
          </Box>

          {/* Action Buttons */}
          <Group justify="space-between" mt="md">
            <Box>
              {current && (
                <Button
                  variant="subtle"
                  color="orange"
                  onClick={handleEndAssignment}
                  loading={endAssignmentMutation.isPending}
                >
                  End Assignment
                </Button>
              )}
            </Box>
            <Group>
              <Button variant="default" onClick={() => setAssignModalOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleAssignmentSave}
                disabled={!assignModalClinicianId || (current !== null && Number(assignModalClinicianId) === current.clinicianId)}
                loading={quickAssignMutation.isPending}
              >
                {isChanging ? 'Reassign' : isNewAssignment ? 'Assign' : 'Save'}
              </Button>
            </Group>
          </Group>

          {/* Assignment History */}
          {pastAssignments.length > 0 && (
            <>
              <Divider />
              <Box>
                <Text size="sm" fw={500} c="dimmed" mb="md">Assignment History</Text>
                <Timeline bulletSize={20} lineWidth={2}>
                  {pastAssignments.slice(0, 5).map((assignment) => (
                    <Timeline.Item
                      key={assignment.id}
                      bullet={
                        <Box
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            backgroundColor: '#86868b',
                          }}
                        />
                      }
                    >
                      <Text size="sm" fw={500}>{assignment.clinician.name}</Text>
                      <Text size="xs" c="dimmed">
                        {new Date(assignment.effectiveFrom).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {' — '}
                        {assignment.effectiveTo
                          ? new Date(assignment.effectiveTo).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                          : 'Present'}
                      </Text>
                    </Timeline.Item>
                  ))}
                </Timeline>
                {pastAssignments.length > 5 && (
                  <Text size="xs" c="dimmed" mt="sm">
                    + {pastAssignments.length - 5} more previous assignments
                  </Text>
                )}
              </Box>
            </>
          )}
        </Stack>
      </Modal>
    );
  };

  return (
    <Box>
      <PageHeader
        title="On-Calls"
        subtitle="Configure on-call rotation slots and assign clinicians"
        actions={
          <Button
            size="md"
            leftSection={<RefreshIcon size={18} />}
            onClick={() => setUpdateCalendarModalOpen(true)}
          >
            Update Calendar
          </Button>
        }
      />

      {isLoading && <LoadingSpinner message="Loading on-call slots..." />}

      {data && (
        <>
          {/* Slot Cards */}
          <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
            {renderSlotCard(
              'consultant',
              data.slots.consultant,
              consStartDate,
              setConsStartDate,
              'week'
            )}
            {renderSlotCard(
              'registrar',
              data.slots.registrar,
              regStartDate,
              setRegStartDate,
              'day'
            )}
          </SimpleGrid>

          {/* 49-Day Pattern Section */}
          {renderPatternSection()}

          {/* Pattern Editor Modal */}
          {renderPatternModal()}

          {/* Assignment Modal */}
          {renderAssignmentModal()}
        </>
      )}

      {/* Start Date Warning Modal */}
      <Modal
        opened={startDateWarningOpen}
        onClose={() => {
          setStartDateWarningOpen(false);
          setPendingStartDateChange(null);
        }}
        title={
          <Group gap="sm">
            <Box
              style={{
                width: 32,
                height: 32,
                backgroundColor: 'rgba(255, 149, 0, 0.1)',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ff9500" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </Box>
            <Text fw={600}>Change Start Date?</Text>
          </Group>
        }
        size="md"
      >
        <Stack gap="lg">
          <Alert color="orange" variant="light">
            <Text size="sm">
              Changing the cycle start date will affect all on-call calculations.
              This may cause on-call assignments to shift to different dates.
            </Text>
          </Alert>
          <Text size="sm" c="dimmed">
            After changing the start date, you will need to click "Update Calendar" to regenerate
            the rota entries with the new calculations.
          </Text>
          <Group justify="flex-end" mt="md">
            <Button
              variant="default"
              onClick={() => {
                setStartDateWarningOpen(false);
                setPendingStartDateChange(null);
                // Reset the date input to the original value
                if (pendingStartDateChange?.role === 'consultant' && data?.config.consultant) {
                  setConsStartDate(data.config.consultant.startDate.slice(0, 10));
                } else if (pendingStartDateChange?.role === 'registrar' && data?.config.registrar) {
                  setRegStartDate(data.config.registrar.startDate.slice(0, 10));
                }
              }}
            >
              Cancel
            </Button>
            <Button
              color="orange"
              onClick={confirmStartDateChange}
              loading={saveConfigMutation.isPending}
            >
              Change Start Date
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Update Calendar Modal */}
      <Modal
        opened={updateCalendarModalOpen}
        onClose={() => setUpdateCalendarModalOpen(false)}
        title={
          <Group gap="sm">
            <Box
              style={{
                width: 32,
                height: 32,
                backgroundColor: 'rgba(0, 113, 227, 0.1)',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0071e3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
            </Box>
            <Text fw={600}>Update Calendar</Text>
          </Group>
        }
        size="md"
      >
        <Stack gap="lg">
          <Text size="sm" c="dimmed">
            Regenerate the rota for the selected date range. This will update on-call assignments
            based on your current slot configuration and assignments.
          </Text>
          <Alert color="blue" variant="light">
            <Text size="sm" fw={500} mb={4}>Priority Order:</Text>
            <Text size="sm">
              1. <strong>Manual edits & Leave</strong> — Never overwritten<br />
              2. <strong>On-call</strong> — Override job plans<br />
              3. <strong>Job Plans</strong> — Base schedule
            </Text>
          </Alert>
          <Group grow>
            <TextInput
              label="From"
              type="date"
              value={updateFromDate}
              onChange={(e) => setUpdateFromDate(e.currentTarget.value)}
            />
            <TextInput
              label="To"
              type="date"
              value={updateToDate}
              onChange={(e) => setUpdateToDate(e.currentTarget.value)}
            />
          </Group>
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={() => setUpdateCalendarModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => regenerateRotaMutation.mutate({ from: updateFromDate, to: updateToDate })}
              loading={regenerateRotaMutation.isPending}
            >
              Update Calendar
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Box>
  );
};
