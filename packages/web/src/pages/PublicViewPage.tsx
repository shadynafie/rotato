import { ActionIcon, Badge, Box, Group, Loader, SegmentedControl, Table, Text } from '@mantine/core';
import React, { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { formatLeaveLabel, formatDateLong } from '../utils/formatters';
import { COLORS } from '../utils/constants';

interface ScheduleEntry {
  date: string;
  clinicianId: number;
  clinicianName: string;
  clinicianRole: 'consultant' | 'registrar';
  session: 'AM' | 'PM';
  dutyId: number | null;
  dutyName: string | null;
  dutyColor: string | null;
  isOncall: boolean;
  isLeave: boolean;
  leaveType: string | null;
  source: 'jobplan' | 'oncall' | 'leave' | 'manual';
  manualOverrideId: number | null;
}

interface OncallToday {
  consultant: { id: number; name: string } | null;
  registrar: { id: number; name: string } | null;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

// Date helper functions
function getDateString(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = `${date.getMonth() + 1}`.padStart(2, '0');
  const dd = `${date.getDate()}`.padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getTodayString(): string {
  return getDateString(new Date());
}

function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return getDateString(date);
}

function addMonths(dateStr: string, months: number): string {
  const date = new Date(dateStr);
  date.setMonth(date.getMonth() + months);
  return getDateString(date);
}

function getWeekStart(dateStr: string): string {
  const date = new Date(dateStr);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return getDateString(date);
}

function getWeekEnd(dateStr: string): string {
  const start = getWeekStart(dateStr);
  return addDays(start, 6);
}

function getWeekDates(weekStart: string): string[] {
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    dates.push(addDays(weekStart, i));
  }
  return dates;
}

function getMonthStart(dateStr: string): string {
  const date = new Date(dateStr);
  return getDateString(new Date(date.getFullYear(), date.getMonth(), 1));
}

function getMonthEnd(dateStr: string): string {
  const date = new Date(dateStr);
  return getDateString(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

function getMonthDays(dateStr: string): { date: string; isCurrentMonth: boolean }[] {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDayOfWeek = firstDay.getDay();
  const daysInMonth = lastDay.getDate();
  const startOffset = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;
  const days: { date: string; isCurrentMonth: boolean }[] = [];
  for (let i = startOffset - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push({ date: getDateString(d), isCurrentMonth: false });
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push({ date: getDateString(new Date(year, month, i)), isCurrentMonth: true });
  }
  const remaining = 42 - days.length;
  for (let i = 1; i <= remaining; i++) {
    days.push({ date: getDateString(new Date(year, month + 1, i)), isCurrentMonth: false });
  }
  return days;
}

function formatMonthYear(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function formatWeekRange(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const startStr = startDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const endStr = endDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${startStr} - ${endStr}`;
}

type ViewType = 'today' | 'week' | 'month';

export const PublicViewPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [view, setView] = useState<ViewType>('today');
  const [selectedDate, setSelectedDate] = useState<string>(getTodayString());
  const today = getTodayString();

  // Calculate week and month ranges
  const weekStart = useMemo(() => getWeekStart(selectedDate), [selectedDate]);
  const weekEnd = useMemo(() => getWeekEnd(selectedDate), [selectedDate]);
  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart]);
  const monthStart = useMemo(() => getMonthStart(selectedDate), [selectedDate]);
  const monthEnd = useMemo(() => getMonthEnd(selectedDate), [selectedDate]);
  const monthDays = useMemo(() => getMonthDays(selectedDate), [selectedDate]);

  // Fetch selected day's schedule (for "today" view - which can show any selected date)
  const dayScheduleQuery = useQuery({
    queryKey: ['public-schedule-day', token, selectedDate],
    queryFn: async () => {
      const res = await axios.get<ScheduleEntry[]>(`${API_BASE}/public/${token}/schedule`, {
        params: { from: selectedDate, to: selectedDate }
      });
      return res.data;
    },
    enabled: !!token && view === 'today',
    retry: false,
  });

  // Fetch week schedule
  const weekScheduleQuery = useQuery({
    queryKey: ['public-schedule-week', token, weekStart, weekEnd],
    queryFn: async () => {
      const res = await axios.get<ScheduleEntry[]>(`${API_BASE}/public/${token}/schedule`, {
        params: { from: weekStart, to: weekEnd }
      });
      return res.data;
    },
    enabled: !!token && view === 'week',
    retry: false,
  });

  // Fetch month schedule
  const monthScheduleQuery = useQuery({
    queryKey: ['public-schedule-month', token, monthStart, monthEnd],
    queryFn: async () => {
      const res = await axios.get<ScheduleEntry[]>(`${API_BASE}/public/${token}/schedule`, {
        params: { from: monthStart, to: monthEnd }
      });
      return res.data;
    },
    enabled: !!token && view === 'month',
    retry: false,
  });

  // Derive on-call from schedule data for the selected date
  const oncallForSelectedDate = useMemo(() => {
    const entries = dayScheduleQuery.data || [];
    const consultant = entries.find((e) => e.clinicianRole === 'consultant' && e.isOncall);
    const registrar = entries.find((e) => e.clinicianRole === 'registrar' && e.isOncall);
    return {
      consultant: consultant ? { id: consultant.clinicianId, name: consultant.clinicianName } : null,
      registrar: registrar ? { id: registrar.clinicianId, name: registrar.clinicianName } : null,
    };
  }, [dayScheduleQuery.data]);

  // Navigation functions
  const goToPrev = () => {
    if (view === 'month') {
      setSelectedDate(addMonths(selectedDate, -1));
    } else if (view === 'week') {
      setSelectedDate(addDays(weekStart, -7));
    } else {
      setSelectedDate(addDays(selectedDate, -1));
    }
  };

  const goToNext = () => {
    if (view === 'month') {
      setSelectedDate(addMonths(selectedDate, 1));
    } else if (view === 'week') {
      setSelectedDate(addDays(weekStart, 7));
    } else {
      setSelectedDate(addDays(selectedDate, 1));
    }
  };

  const goToToday = () => {
    setSelectedDate(getTodayString());
  };

  // Build schedule data for the table grouped by clinician (day view)
  const scheduleData = useMemo(() => {
    const entries = dayScheduleQuery.data || [];

    const clinicianMap = new Map<number, {
      clinicianId: number;
      clinicianName: string;
      clinicianRole: 'consultant' | 'registrar';
      isOncall: boolean;
      amEntry: ScheduleEntry | null;
      pmEntry: ScheduleEntry | null;
    }>();

    entries.forEach((entry) => {
      if (!clinicianMap.has(entry.clinicianId)) {
        clinicianMap.set(entry.clinicianId, {
          clinicianId: entry.clinicianId,
          clinicianName: entry.clinicianName,
          clinicianRole: entry.clinicianRole,
          isOncall: false,
          amEntry: null,
          pmEntry: null,
        });
      }
      const data = clinicianMap.get(entry.clinicianId)!;
      if (entry.session === 'AM') {
        data.amEntry = entry;
      } else {
        data.pmEntry = entry;
      }
      if (entry.isOncall) {
        data.isOncall = true;
      }
    });

    return Array.from(clinicianMap.values());
  }, [dayScheduleQuery.data]);

  // Build week schedule data grouped by clinician
  const weekScheduleData = useMemo(() => {
    const entries = weekScheduleQuery.data || [];
    const clinicianMap = new Map<number, {
      clinicianId: number;
      clinicianName: string;
      clinicianRole: 'consultant' | 'registrar';
      days: Map<string, { am: ScheduleEntry | null; pm: ScheduleEntry | null; isOncall: boolean }>;
    }>();

    entries.forEach((entry) => {
      if (!clinicianMap.has(entry.clinicianId)) {
        clinicianMap.set(entry.clinicianId, {
          clinicianId: entry.clinicianId,
          clinicianName: entry.clinicianName,
          clinicianRole: entry.clinicianRole,
          days: new Map(),
        });
      }
      const clinician = clinicianMap.get(entry.clinicianId)!;
      if (!clinician.days.has(entry.date)) {
        clinician.days.set(entry.date, { am: null, pm: null, isOncall: false });
      }
      const dayData = clinician.days.get(entry.date)!;
      if (entry.session === 'AM') {
        dayData.am = entry;
      } else {
        dayData.pm = entry;
      }
      if (entry.isOncall) {
        dayData.isOncall = true;
      }
    });

    return Array.from(clinicianMap.values());
  }, [weekScheduleQuery.data]);

  // Build month schedule data (map by date for quick lookup)
  const monthScheduleByDate = useMemo(() => {
    const entries = monthScheduleQuery.data || [];
    const dateMap = new Map<string, {
      consultant: ScheduleEntry | null;
      registrar: ScheduleEntry | null;
      onLeave: ScheduleEntry[];
    }>();

    entries.forEach((entry) => {
      if (!dateMap.has(entry.date)) {
        dateMap.set(entry.date, { consultant: null, registrar: null, onLeave: [] });
      }
      const dayData = dateMap.get(entry.date)!;
      if (entry.isOncall) {
        if (entry.clinicianRole === 'consultant') {
          dayData.consultant = entry;
        } else {
          dayData.registrar = entry;
        }
      }
      if (entry.isLeave) {
        // Avoid duplicates (clinician may have AM and PM leave entries)
        if (!dayData.onLeave.some(l => l.clinicianId === entry.clinicianId)) {
          dayData.onLeave.push(entry);
        }
      }
    });

    return dateMap;
  }, [monthScheduleQuery.data]);

  const getDisplayInfo = (entry: ScheduleEntry | null) => {
    if (!entry) return null;

    if (entry.isOncall) {
      return { text: 'On-call', color: COLORS.oncall, bg: COLORS.oncallBg };
    }
    if (entry.isLeave) {
      return { text: formatLeaveLabel(entry.leaveType), color: COLORS.leave, bg: COLORS.leaveBg };
    }
    if (entry.dutyName) {
      return {
        text: entry.dutyName,
        color: entry.dutyColor || COLORS.primary,
        bg: `${entry.dutyColor || COLORS.primary}15`
      };
    }
    return null;
  };

  const getCompactDisplay = (entry: ScheduleEntry | null) => {
    if (!entry) return null;
    if (entry.isOncall) {
      return { text: 'On-call', color: COLORS.oncall, bg: 'rgba(255, 149, 0, 0.15)' };
    }
    if (entry.isLeave) {
      return { text: 'Leave', color: COLORS.leave, bg: 'rgba(255, 59, 48, 0.15)' };
    }
    if (entry.dutyName) {
      return {
        text: entry.dutyName,
        color: entry.dutyColor || COLORS.primary,
        bg: `${entry.dutyColor || COLORS.primary}20`
      };
    }
    return null;
  };

  const consultantSchedule = scheduleData.filter((s) => s.clinicianRole === 'consultant');
  const registrarSchedule = scheduleData.filter((s) => s.clinicianRole === 'registrar');

  const weekConsultants = weekScheduleData.filter((s) => s.clinicianRole === 'consultant');
  const weekRegistrars = weekScheduleData.filter((s) => s.clinicianRole === 'registrar');

  const weekHeaders = weekDates.map((date) => {
    const d = new Date(date);
    return {
      date,
      dayName: d.toLocaleDateString('en-GB', { weekday: 'short' }),
      dayNum: d.getDate(),
      isToday: date === today,
      isWeekend: d.getDay() === 0 || d.getDay() === 6,
    };
  });

  const isLoading =
    (view === 'today' && dayScheduleQuery.isLoading) ||
    (view === 'week' && weekScheduleQuery.isLoading) ||
    (view === 'month' && monthScheduleQuery.isLoading);

  const isError =
    (view === 'today' && dayScheduleQuery.isError) ||
    (view === 'week' && weekScheduleQuery.isError) ||
    (view === 'month' && monthScheduleQuery.isError);

  if (isError) {
    return (
      <Box
        style={{
          minHeight: '100vh',
          backgroundColor: '#f5f5f7',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Box
          ta="center"
          p={40}
          style={{
            backgroundColor: '#ffffff',
            borderRadius: 16,
            maxWidth: 400,
          }}
        >
          <Box
            style={{
              width: 64,
              height: 64,
              backgroundColor: 'rgba(255, 59, 48, 0.1)',
              borderRadius: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ff3b30" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="15" y1="9" x2="9" y2="15"/>
              <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
          </Box>
          <Text fw={600} size="lg" c="#1d1d1f" mb={8}>Invalid or Expired Link</Text>
          <Text c="dimmed" size="sm">
            This share link is invalid or has been deactivated. Please contact your administrator for a new link.
          </Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box
      style={{
        minHeight: '100vh',
        backgroundColor: '#f5f5f7',
      }}
    >
      <Box p={{ base: 'md', sm: 'xl' }} maw={1200} mx="auto">
        {/* Header */}
        <Box mb={32}>
          <Group gap="xs" mb={8}>
            <img src="/icon-192.png" alt="Rotato" width={28} height={28} style={{ borderRadius: 6 }} />
            <Text
              style={{
                fontSize: '1.25rem',
                fontWeight: 600,
                color: '#0071e3',
                letterSpacing: '-0.02em',
              }}
            >
              Rotato
            </Text>
          </Group>
          <Text
            style={{
              fontSize: '2rem',
              fontWeight: 700,
              color: '#1d1d1f',
              letterSpacing: '-0.025em',
              marginBottom: 8,
            }}
          >
            {view === 'today' && formatDateLong(selectedDate)}
            {view === 'week' && formatWeekRange(weekStart, weekEnd)}
            {view === 'month' && formatMonthYear(selectedDate)}
          </Text>
          <Text style={{ fontSize: '1.0625rem', color: '#86868b' }}>
            Team schedule (read-only view)
          </Text>
        </Box>

        {/* View Tabs and Navigation */}
        <Group justify="space-between" mb={24}>
          <SegmentedControl
            value={view}
            onChange={(v) => setView(v as ViewType)}
            data={[
              { label: 'Today', value: 'today' },
              { label: 'Week', value: 'week' },
              { label: 'Month', value: 'month' },
            ]}
            styles={{
              root: { backgroundColor: '#ffffff' },
            }}
          />
          <Group gap="xs">
            <ActionIcon variant="light" onClick={goToPrev} radius="md">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </ActionIcon>
            <ActionIcon variant="light" onClick={goToToday} radius="md">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </ActionIcon>
            <ActionIcon variant="light" onClick={goToNext} radius="md">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </ActionIcon>
          </Group>
        </Group>

        {/* Loading */}
        {isLoading && (
          <Box ta="center" py={60}>
            <Loader size="lg" color="#0071e3" />
            <Text mt="md" c="dimmed">Loading schedule...</Text>
          </Box>
        )}

        {/* Today View */}
        {!isLoading && view === 'today' && (
          <>
            {/* On-Call Banner */}
            <Box
              mb={24}
              p={24}
              style={{
                background: 'linear-gradient(135deg, #ff9500 0%, #ff6b00 100%)',
                borderRadius: 16,
                color: 'white',
              }}
            >
              <Group gap="xs" mb={16}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                </svg>
                <Text fw={600} size="lg">On-Call {selectedDate === today ? 'Today' : ''}</Text>
              </Group>
              <Group gap={48}>
                <Box>
                  <Text size="sm" style={{ opacity: 0.8 }} mb={4}>Consultant</Text>
                  <Text fw={600} size="xl">
                    {oncallForSelectedDate.consultant?.name || 'Not assigned'}
                  </Text>
                </Box>
                <Box>
                  <Text size="sm" style={{ opacity: 0.8 }} mb={4}>Registrar</Text>
                  <Text fw={600} size="xl">
                    {oncallForSelectedDate.registrar?.name || 'Not assigned'}
                  </Text>
                </Box>
              </Group>
            </Box>

            {/* Consultants Table */}
            {consultantSchedule.length > 0 && (
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
                      Consultants
                    </Badge>
                    <Text c="dimmed" size="sm">{consultantSchedule.length} clinicians</Text>
                  </Group>
                </Box>
                <Table verticalSpacing="md" horizontalSpacing="lg">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th style={{ width: '40%' }}>Clinician</Table.Th>
                      <Table.Th style={{ width: '30%', textAlign: 'center' }}>AM</Table.Th>
                      <Table.Th style={{ width: '30%', textAlign: 'center' }}>PM</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {consultantSchedule.map((row) => {
                      const amDisplay = getDisplayInfo(row.amEntry);
                      const pmDisplay = getDisplayInfo(row.pmEntry);
                      return (
                        <Table.Tr
                          key={row.clinicianId}
                          style={{
                            backgroundColor: row.isOncall ? 'rgba(255, 149, 0, 0.04)' : 'transparent',
                          }}
                        >
                          <Table.Td>
                            <Group gap="sm">
                              <Text fw={500} c="#1d1d1f">{row.clinicianName}</Text>
                              {row.isOncall && (
                                <Badge size="xs" color="orange" variant="filled">ON-CALL</Badge>
                              )}
                            </Group>
                          </Table.Td>
                          <Table.Td style={{ textAlign: 'center' }}>
                            {amDisplay ? (
                              <Box
                                px={12}
                                py={6}
                                style={{
                                  backgroundColor: amDisplay.bg,
                                  borderRadius: 8,
                                  display: 'inline-block',
                                }}
                              >
                                <Text fw={500} size="sm" style={{ color: amDisplay.color }}>
                                  {amDisplay.text}
                                </Text>
                              </Box>
                            ) : (
                              <Text c="dimmed" size="sm">—</Text>
                            )}
                          </Table.Td>
                          <Table.Td style={{ textAlign: 'center' }}>
                            {pmDisplay ? (
                              <Box
                                px={12}
                                py={6}
                                style={{
                                  backgroundColor: pmDisplay.bg,
                                  borderRadius: 8,
                                  display: 'inline-block',
                                }}
                              >
                                <Text fw={500} size="sm" style={{ color: pmDisplay.color }}>
                                  {pmDisplay.text}
                                </Text>
                              </Box>
                            ) : (
                              <Text c="dimmed" size="sm">—</Text>
                            )}
                          </Table.Td>
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              </Box>
            )}

            {/* Registrars Table */}
            {registrarSchedule.length > 0 && (
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
                    <Badge variant="light" color="grape" size="lg" radius="md">
                      Registrars
                    </Badge>
                    <Text c="dimmed" size="sm">{registrarSchedule.length} clinicians</Text>
                  </Group>
                </Box>
                <Table verticalSpacing="md" horizontalSpacing="lg">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th style={{ width: '40%' }}>Clinician</Table.Th>
                      <Table.Th style={{ width: '30%', textAlign: 'center' }}>AM</Table.Th>
                      <Table.Th style={{ width: '30%', textAlign: 'center' }}>PM</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {registrarSchedule.map((row) => {
                      const amDisplay = getDisplayInfo(row.amEntry);
                      const pmDisplay = getDisplayInfo(row.pmEntry);
                      return (
                        <Table.Tr
                          key={row.clinicianId}
                          style={{
                            backgroundColor: row.isOncall ? 'rgba(255, 149, 0, 0.04)' : 'transparent',
                          }}
                        >
                          <Table.Td>
                            <Group gap="sm">
                              <Text fw={500} c="#1d1d1f">{row.clinicianName}</Text>
                              {row.isOncall && (
                                <Badge size="xs" color="orange" variant="filled">ON-CALL</Badge>
                              )}
                            </Group>
                          </Table.Td>
                          <Table.Td style={{ textAlign: 'center' }}>
                            {amDisplay ? (
                              <Box
                                px={12}
                                py={6}
                                style={{
                                  backgroundColor: amDisplay.bg,
                                  borderRadius: 8,
                                  display: 'inline-block',
                                }}
                              >
                                <Text fw={500} size="sm" style={{ color: amDisplay.color }}>
                                  {amDisplay.text}
                                </Text>
                              </Box>
                            ) : (
                              <Text c="dimmed" size="sm">—</Text>
                            )}
                          </Table.Td>
                          <Table.Td style={{ textAlign: 'center' }}>
                            {pmDisplay ? (
                              <Box
                                px={12}
                                py={6}
                                style={{
                                  backgroundColor: pmDisplay.bg,
                                  borderRadius: 8,
                                  display: 'inline-block',
                                }}
                              >
                                <Text fw={500} size="sm" style={{ color: pmDisplay.color }}>
                                  {pmDisplay.text}
                                </Text>
                              </Box>
                            ) : (
                              <Text c="dimmed" size="sm">—</Text>
                            )}
                          </Table.Td>
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              </Box>
            )}
          </>
        )}

        {/* Week View */}
        {!isLoading && view === 'week' && (
          <>
            {/* Consultants Week Table */}
            {weekConsultants.length > 0 && (
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
                      Consultants
                    </Badge>
                    <Text c="dimmed" size="sm">{weekConsultants.length} clinicians</Text>
                  </Group>
                </Box>
                <Box style={{ overflowX: 'auto' }}>
                  <Table verticalSpacing="xs" horizontalSpacing="xs" style={{ minWidth: 800 }}>
                    <Table.Thead>
                      <Table.Tr style={{ backgroundColor: '#fafafa' }}>
                        <Table.Th style={{ minWidth: 120, position: 'sticky', left: 0, backgroundColor: '#fafafa', zIndex: 1 }}>Clinician</Table.Th>
                        {weekHeaders.map((h) => (
                          <Table.Th
                            key={h.date}
                            style={{
                              textAlign: 'center',
                              minWidth: 80,
                              backgroundColor: h.isToday ? 'rgba(0, 113, 227, 0.08)' : h.isWeekend ? '#f5f5f7' : '#fafafa',
                            }}
                          >
                            <Text size="xs" c={h.isToday ? '#0071e3' : '#86868b'}>{h.dayName}</Text>
                            <Text size="sm" fw={h.isToday ? 700 : 500} c={h.isToday ? '#0071e3' : '#1d1d1f'}>{h.dayNum}</Text>
                          </Table.Th>
                        ))}
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {weekConsultants.map((row) => (
                        <Table.Tr key={row.clinicianId}>
                          <Table.Td style={{ position: 'sticky', left: 0, backgroundColor: '#fff', zIndex: 1 }}>
                            <Text fw={500} size="sm" c="#1d1d1f">{row.clinicianName}</Text>
                          </Table.Td>
                          {weekDates.map((date) => {
                            const dayData = row.days.get(date);
                            const header = weekHeaders.find((h) => h.date === date)!;
                            const amDisplay = getCompactDisplay(dayData?.am || null);
                            const pmDisplay = getCompactDisplay(dayData?.pm || null);
                            return (
                              <Table.Td
                                key={date}
                                style={{
                                  textAlign: 'center',
                                  padding: 4,
                                  backgroundColor: header.isToday ? 'rgba(0, 113, 227, 0.04)' : dayData?.isOncall ? 'rgba(255, 149, 0, 0.04)' : header.isWeekend ? '#fafafa' : 'transparent',
                                }}
                              >
                                <Box style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                  <Box
                                    px={4}
                                    py={2}
                                    style={{
                                      backgroundColor: amDisplay?.bg || 'rgba(0, 0, 0, 0.04)',
                                      borderRadius: 4,
                                      fontSize: 10,
                                      fontWeight: 500,
                                      color: amDisplay?.color || '#ccc',
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                    }}
                                    title={amDisplay?.text || 'No duty'}
                                  >
                                    {amDisplay?.text || '—'}
                                  </Box>
                                  <Box
                                    px={4}
                                    py={2}
                                    style={{
                                      backgroundColor: pmDisplay?.bg || 'rgba(0, 0, 0, 0.04)',
                                      borderRadius: 4,
                                      fontSize: 10,
                                      fontWeight: 500,
                                      color: pmDisplay?.color || '#ccc',
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                    }}
                                    title={pmDisplay?.text || 'No duty'}
                                  >
                                    {pmDisplay?.text || '—'}
                                  </Box>
                                </Box>
                              </Table.Td>
                            );
                          })}
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Box>
              </Box>
            )}

            {/* Registrars Week Table */}
            {weekRegistrars.length > 0 && (
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
                    <Badge variant="light" color="grape" size="lg" radius="md">
                      Registrars
                    </Badge>
                    <Text c="dimmed" size="sm">{weekRegistrars.length} clinicians</Text>
                  </Group>
                </Box>
                <Box style={{ overflowX: 'auto' }}>
                  <Table verticalSpacing="xs" horizontalSpacing="xs" style={{ minWidth: 800 }}>
                    <Table.Thead>
                      <Table.Tr style={{ backgroundColor: '#fafafa' }}>
                        <Table.Th style={{ minWidth: 120, position: 'sticky', left: 0, backgroundColor: '#fafafa', zIndex: 1 }}>Clinician</Table.Th>
                        {weekHeaders.map((h) => (
                          <Table.Th
                            key={h.date}
                            style={{
                              textAlign: 'center',
                              minWidth: 80,
                              backgroundColor: h.isToday ? 'rgba(0, 113, 227, 0.08)' : h.isWeekend ? '#f5f5f7' : '#fafafa',
                            }}
                          >
                            <Text size="xs" c={h.isToday ? '#0071e3' : '#86868b'}>{h.dayName}</Text>
                            <Text size="sm" fw={h.isToday ? 700 : 500} c={h.isToday ? '#0071e3' : '#1d1d1f'}>{h.dayNum}</Text>
                          </Table.Th>
                        ))}
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {weekRegistrars.map((row) => (
                        <Table.Tr key={row.clinicianId}>
                          <Table.Td style={{ position: 'sticky', left: 0, backgroundColor: '#fff', zIndex: 1 }}>
                            <Text fw={500} size="sm" c="#1d1d1f">{row.clinicianName}</Text>
                          </Table.Td>
                          {weekDates.map((date) => {
                            const dayData = row.days.get(date);
                            const header = weekHeaders.find((h) => h.date === date)!;
                            const amDisplay = getCompactDisplay(dayData?.am || null);
                            const pmDisplay = getCompactDisplay(dayData?.pm || null);
                            return (
                              <Table.Td
                                key={date}
                                style={{
                                  textAlign: 'center',
                                  padding: 4,
                                  backgroundColor: header.isToday ? 'rgba(0, 113, 227, 0.04)' : dayData?.isOncall ? 'rgba(255, 149, 0, 0.04)' : header.isWeekend ? '#fafafa' : 'transparent',
                                }}
                              >
                                <Box style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                  <Box
                                    px={4}
                                    py={2}
                                    style={{
                                      backgroundColor: amDisplay?.bg || 'rgba(0, 0, 0, 0.04)',
                                      borderRadius: 4,
                                      fontSize: 10,
                                      fontWeight: 500,
                                      color: amDisplay?.color || '#ccc',
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                    }}
                                    title={amDisplay?.text || 'No duty'}
                                  >
                                    {amDisplay?.text || '—'}
                                  </Box>
                                  <Box
                                    px={4}
                                    py={2}
                                    style={{
                                      backgroundColor: pmDisplay?.bg || 'rgba(0, 0, 0, 0.04)',
                                      borderRadius: 4,
                                      fontSize: 10,
                                      fontWeight: 500,
                                      color: pmDisplay?.color || '#ccc',
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                    }}
                                    title={pmDisplay?.text || 'No duty'}
                                  >
                                    {pmDisplay?.text || '—'}
                                  </Box>
                                </Box>
                              </Table.Td>
                            );
                          })}
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Box>
              </Box>
            )}
          </>
        )}

        {/* Month View */}
        {!isLoading && view === 'month' && (
          <Box
            style={{
              backgroundColor: '#ffffff',
              borderRadius: 16,
              overflow: 'hidden',
              border: '1px solid rgba(0, 0, 0, 0.06)',
            }}
          >
            {/* Day headers */}
            <Box
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
                backgroundColor: '#fafafa',
              }}
            >
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                <Box key={day} py={12} style={{ textAlign: 'center' }}>
                  <Text size="sm" fw={500} c="#86868b">{day}</Text>
                </Box>
              ))}
            </Box>

            {/* Calendar grid */}
            <Box
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
              }}
            >
              {monthDays.map((day, idx) => {
                const todayCheck = day.date === today;
                const oncallData = monthScheduleByDate.get(day.date);
                const isWeekend = idx % 7 >= 5;

                return (
                  <Box
                    key={day.date}
                    p={8}
                    onClick={() => {
                      setSelectedDate(day.date);
                      setView('today');
                    }}
                    style={{
                      minHeight: 90,
                      borderRight: (idx + 1) % 7 !== 0 ? '1px solid rgba(0, 0, 0, 0.04)' : 'none',
                      borderBottom: idx < 35 ? '1px solid rgba(0, 0, 0, 0.04)' : 'none',
                      backgroundColor: todayCheck ? 'rgba(0, 113, 227, 0.04)' : isWeekend ? '#fafafa' : 'transparent',
                      opacity: day.isCurrentMonth ? 1 : 0.4,
                      cursor: 'pointer',
                      transition: 'background-color 150ms ease',
                    }}
                    onMouseEnter={(e) => {
                      if (!todayCheck) e.currentTarget.style.backgroundColor = 'rgba(0, 113, 227, 0.06)';
                    }}
                    onMouseLeave={(e) => {
                      if (!todayCheck) e.currentTarget.style.backgroundColor = isWeekend ? '#fafafa' : 'transparent';
                    }}
                  >
                    <Box mb={4}>
                      <Text
                        size="sm"
                        fw={todayCheck ? 700 : 500}
                        style={{
                          width: 24,
                          height: 24,
                          lineHeight: '24px',
                          textAlign: 'center',
                          borderRadius: '50%',
                          backgroundColor: todayCheck ? '#0071e3' : 'transparent',
                          color: todayCheck ? '#ffffff' : day.isCurrentMonth ? '#1d1d1f' : '#86868b',
                          display: 'inline-block',
                        }}
                      >
                        {new Date(day.date).getDate()}
                      </Text>
                    </Box>

                    {/* On-call and leave info */}
                    {oncallData && (
                      <Box style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {oncallData.consultant && (
                          <Box
                            px={4}
                            py={2}
                            style={{
                              backgroundColor: 'rgba(255, 149, 0, 0.15)',
                              borderRadius: 4,
                              fontSize: 9,
                              fontWeight: 500,
                              color: '#ff9500',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                            title={`Consultant On-call: ${oncallData.consultant.clinicianName}`}
                          >
                            C: {getSurname(oncallData.consultant.clinicianName)}
                          </Box>
                        )}
                        {oncallData.registrar && (
                          <Box
                            px={4}
                            py={2}
                            style={{
                              backgroundColor: 'rgba(136, 84, 208, 0.15)',
                              borderRadius: 4,
                              fontSize: 9,
                              fontWeight: 500,
                              color: '#8854d0',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                            title={`Registrar On-call: ${oncallData.registrar.clinicianName}`}
                          >
                            R: {getSurname(oncallData.registrar.clinicianName)}
                          </Box>
                        )}
                        {oncallData.onLeave.slice(0, 2).map((leave) => (
                          <Box
                            key={leave.clinicianId}
                            px={4}
                            py={2}
                            style={{
                              backgroundColor: 'rgba(255, 59, 48, 0.12)',
                              borderRadius: 4,
                              fontSize: 9,
                              fontWeight: 500,
                              color: '#ff3b30',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                            title={`On Leave: ${leave.clinicianName}`}
                          >
                            {getSurname(leave.clinicianName)}
                          </Box>
                        ))}
                        {oncallData.onLeave.length > 2 && (
                          <Box
                            px={4}
                            py={1}
                            style={{
                              fontSize: 8,
                              color: '#ff3b30',
                            }}
                          >
                            +{oncallData.onLeave.length - 2} more
                          </Box>
                        )}
                      </Box>
                    )}
                  </Box>
                );
              })}
            </Box>
          </Box>
        )}

        {/* Footer */}
        <Box mt={40} ta="center">
          <Text size="sm" c="dimmed">
            This is a read-only view. Contact your administrator to make changes.
          </Text>
        </Box>
      </Box>
    </Box>
  );
};
