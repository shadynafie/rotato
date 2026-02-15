import { ActionIcon, Badge, Box, Button, Group, Loader, Modal, Popover, SegmentedControl, Select, Switch, Table, Text, Textarea } from '@mantine/core';
import { DatePicker } from '@mantine/dates';
import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';

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
  supportingClinicianId: number | null;
  supportingClinicianName: string | null;
}

interface OncallToday {
  consultant: { id: number; name: string } | null;
  registrar: { id: number; name: string } | null;
}

interface Duty {
  id: number;
  name: string;
  color?: string | null;
}

interface EditingCell {
  clinicianId: number;
  clinicianName: string;
  date: string;
  session: 'AM' | 'PM';
  currentEntry: ScheduleEntry | null;
}

// Get today's date in YYYY-MM-DD format
function getDateString(date: Date) {
  const yyyy = date.getFullYear();
  const mm = `${date.getMonth() + 1}`.padStart(2, '0');
  const dd = `${date.getDate()}`.padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getTodayString() {
  return getDateString(new Date());
}

function formatDisplayDate(dateStr: string) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return getDateString(date);
}

function isToday(dateStr: string): boolean {
  return dateStr === getTodayString();
}

// Get Monday of the week containing the given date
function getWeekStart(dateStr: string): string {
  const date = new Date(dateStr);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
  const monday = new Date(date.setDate(diff));
  return getDateString(monday);
}

// Get Sunday of the week containing the given date
function getWeekEnd(dateStr: string): string {
  const weekStart = getWeekStart(dateStr);
  return addDays(weekStart, 6);
}

// Get all dates for a week starting from Monday
function getWeekDates(weekStartStr: string): string[] {
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    dates.push(addDays(weekStartStr, i));
  }
  return dates;
}

// Format date for week header (e.g., "Mon 10")
function formatWeekDayHeader(dateStr: string): { day: string; date: number; isToday: boolean } {
  const date = new Date(dateStr);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return {
    day: days[date.getDay()],
    date: date.getDate(),
    isToday: isToday(dateStr),
  };
}

// Format week range for display (e.g., "10 - 16 February 2025")
function formatWeekRange(weekStartStr: string): string {
  const start = new Date(weekStartStr);
  const end = new Date(addDays(weekStartStr, 6));

  const startDay = start.getDate();
  const endDay = end.getDate();
  const endMonth = end.toLocaleDateString('en-GB', { month: 'long' });
  const endYear = end.getFullYear();

  if (start.getMonth() === end.getMonth()) {
    return `${startDay} - ${endDay} ${endMonth} ${endYear}`;
  } else {
    const startMonth = start.toLocaleDateString('en-GB', { month: 'short' });
    return `${startDay} ${startMonth} - ${endDay} ${endMonth} ${endYear}`;
  }
}

// Get start of month
function getMonthStart(dateStr: string): string {
  const date = new Date(dateStr);
  return getDateString(new Date(date.getFullYear(), date.getMonth(), 1));
}

// Get end of month
function getMonthEnd(dateStr: string): string {
  const date = new Date(dateStr);
  return getDateString(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

// Format month for display (e.g., "February 2025")
function formatMonthDisplay(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

// Get calendar grid for month (includes padding days from prev/next month)
function getMonthCalendarDates(monthStartStr: string): { date: string; isCurrentMonth: boolean }[][] {
  const monthStart = new Date(monthStartStr);
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);

  // Find the Monday before or on the month start
  const calendarStart = new Date(monthStart);
  const startDay = calendarStart.getDay();
  const daysToSubtract = startDay === 0 ? 6 : startDay - 1;
  calendarStart.setDate(calendarStart.getDate() - daysToSubtract);

  const weeks: { date: string; isCurrentMonth: boolean }[][] = [];
  const current = new Date(calendarStart);

  // Generate 6 weeks to cover all cases
  for (let w = 0; w < 6; w++) {
    const week: { date: string; isCurrentMonth: boolean }[] = [];
    for (let d = 0; d < 7; d++) {
      const dateStr = getDateString(current);
      const isCurrentMonth = current.getMonth() === monthStart.getMonth();
      week.push({ date: dateStr, isCurrentMonth });
      current.setDate(current.getDate() + 1);
    }
    // Only include week if it has at least one day in the current month
    if (week.some((d) => d.isCurrentMonth)) {
      weeks.push(week);
    }
  }

  return weeks;
}

// Add months
function addMonths(dateStr: string, months: number): string {
  const date = new Date(dateStr);
  date.setMonth(date.getMonth() + months);
  return getDateString(date);
}

const fetchSchedule = async (from: string, to: string) => {
  const res = await api.get<ScheduleEntry[]>('/api/schedule', { params: { from, to } });
  return res.data;
};

const fetchOncallToday = async () => {
  const res = await api.get<OncallToday>('/api/schedule/oncall-today');
  return res.data;
};

const fetchDuties = async () => {
  const res = await api.get<Duty[]>('/api/duties');
  return res.data;
};

interface OverridePayload {
  clinicianId: number;
  date: string;
  session: 'AM' | 'PM';
  dutyId: number | null;
  isOncall: boolean;
  note: string | null;
}

const createOverride = async (payload: OverridePayload) => {
  const res = await api.post('/api/rota/override', payload);
  return res.data;
};

const deleteOverride = async (clinicianId: number, date: string, session: 'AM' | 'PM') => {
  await api.delete('/api/rota/override', { params: { clinicianId, date, session } });
};

type ViewType = 'today' | 'week' | 'month' | 'oncall' | 'staff' | 'leave';

export const CalendarPage: React.FC = () => {
  const [view, setView] = useState<ViewType>('today');
  const [selectedDate, setSelectedDate] = useState<string>(getTodayString());
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  // Edit modal state
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editDutyId, setEditDutyId] = useState<string | null>(null);
  const [editIsOncall, setEditIsOncall] = useState(false);
  const [editNote, setEditNote] = useState('');

  const queryClient = useQueryClient();

  // Week view calculations
  const weekStart = useMemo(() => getWeekStart(selectedDate), [selectedDate]);
  const weekEnd = useMemo(() => getWeekEnd(selectedDate), [selectedDate]);
  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart]);

  // Month view calculations
  const monthStart = useMemo(() => getMonthStart(selectedDate), [selectedDate]);
  const monthEnd = useMemo(() => getMonthEnd(selectedDate), [selectedDate]);
  const monthCalendarWeeks = useMemo(() => getMonthCalendarDates(monthStart), [monthStart]);

  // Fetch schedule for selected date (computed on-the-fly)
  const scheduleQuery = useQuery({
    queryKey: ['schedule', selectedDate, selectedDate],
    queryFn: () => fetchSchedule(selectedDate, selectedDate),
    enabled: view === 'today',
  });

  // Fetch schedule for week view
  const weekScheduleQuery = useQuery({
    queryKey: ['schedule-week', weekStart, weekEnd],
    queryFn: () => fetchSchedule(weekStart, weekEnd),
    enabled: view === 'week',
  });

  // Fetch schedule for month view (get full calendar range to include padding days)
  const monthCalendarStart = monthCalendarWeeks[0]?.[0]?.date || monthStart;
  const monthCalendarEnd = monthCalendarWeeks[monthCalendarWeeks.length - 1]?.[6]?.date || monthEnd;
  const monthScheduleQuery = useQuery({
    queryKey: ['schedule-month', monthCalendarStart, monthCalendarEnd],
    queryFn: () => fetchSchedule(monthCalendarStart, monthCalendarEnd),
    enabled: view === 'month',
  });

  // Fetch on-call for selected date
  const oncallQuery = useQuery({
    queryKey: ['oncall-date', selectedDate],
    queryFn: () => fetchSchedule(selectedDate, selectedDate),
    select: (data) => {
      const consultant = data.find((e) => e.clinicianRole === 'consultant' && e.isOncall);
      const registrar = data.find((e) => e.clinicianRole === 'registrar' && e.isOncall);
      return {
        consultant: consultant ? { id: consultant.clinicianId, name: consultant.clinicianName } : null,
        registrar: registrar ? { id: registrar.clinicianId, name: registrar.clinicianName } : null,
      };
    },
    enabled: view === 'today',
  });

  // Fetch duties for the edit modal
  const dutiesQuery = useQuery({
    queryKey: ['duties'],
    queryFn: fetchDuties,
  });

  // Override mutations
  const overrideMutation = useMutation({
    mutationFn: createOverride,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule'] });
      queryClient.invalidateQueries({ queryKey: ['schedule-week'] });
      queryClient.invalidateQueries({ queryKey: ['schedule-month'] });
      queryClient.invalidateQueries({ queryKey: ['oncall-date'] });
      setEditingCell(null);
    },
  });

  const deleteOverrideMutation = useMutation({
    mutationFn: ({ clinicianId, date, session }: { clinicianId: number; date: string; session: 'AM' | 'PM' }) =>
      deleteOverride(clinicianId, date, session),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule'] });
      queryClient.invalidateQueries({ queryKey: ['schedule-week'] });
      queryClient.invalidateQueries({ queryKey: ['schedule-month'] });
      queryClient.invalidateQueries({ queryKey: ['oncall-date'] });
      setEditingCell(null);
    },
  });

  // Open edit modal
  const openEditModal = (cell: EditingCell) => {
    setEditingCell(cell);
    // Pre-fill with current values if there's an entry
    if (cell.currentEntry) {
      setEditDutyId(cell.currentEntry.dutyId?.toString() || null);
      setEditIsOncall(cell.currentEntry.isOncall);
      setEditNote('');
    } else {
      setEditDutyId(null);
      setEditIsOncall(false);
      setEditNote('');
    }
  };

  // Save override
  const handleSaveOverride = () => {
    if (!editingCell) return;
    overrideMutation.mutate({
      clinicianId: editingCell.clinicianId,
      date: editingCell.date,
      session: editingCell.session,
      dutyId: editDutyId ? parseInt(editDutyId) : null,
      isOncall: editIsOncall,
      note: editNote || null,
    });
  };

  // Revert override
  const handleRevertOverride = () => {
    if (!editingCell) return;
    deleteOverrideMutation.mutate({
      clinicianId: editingCell.clinicianId,
      date: editingCell.date,
      session: editingCell.session,
    });
  };

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
  const goToToday = () => setSelectedDate(getTodayString());

  // Build schedule data for the table grouped by clinician
  const scheduleData = useMemo(() => {
    const entries = scheduleQuery.data || [];

    // Group by clinician
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
  }, [scheduleQuery.data]);

  // Helper to get surname from full name
  const getSurname = (fullName: string) => {
    const parts = fullName.split(' ');
    return parts.length > 1 ? parts[parts.length - 1] : fullName;
  };

  // Helper to get display info for a session entry
  const getDisplayInfo = (entry: ScheduleEntry | null) => {
    if (!entry) return null;

    if (entry.isOncall) {
      return { text: 'On-call', color: '#ff9500', bg: 'rgba(255, 149, 0, 0.1)' };
    }
    if (entry.isLeave) {
      const leaveLabel = entry.leaveType
        ? entry.leaveType.charAt(0).toUpperCase() + entry.leaveType.slice(1) + ' Leave'
        : 'Leave';
      return { text: leaveLabel, color: '#ff3b30', bg: 'rgba(255, 59, 48, 0.1)' };
    }
    if (entry.dutyName) {
      // For registrars with a supporting consultant, show "Surname Duty" format
      let displayText = entry.dutyName;
      if (entry.supportingClinicianName && entry.clinicianRole === 'registrar') {
        const surname = getSurname(entry.supportingClinicianName);
        displayText = `${surname} ${entry.dutyName}`;
      }
      return {
        text: displayText,
        color: entry.dutyColor || '#0071e3',
        bg: `${entry.dutyColor || '#0071e3'}15`
      };
    }
    return null;
  };

  // Separate consultants and registrars
  const consultantSchedule = scheduleData.filter((s) => s.clinicianRole === 'consultant');
  const registrarSchedule = scheduleData.filter((s) => s.clinicianRole === 'registrar');

  // Build week schedule data grouped by clinician
  const weekScheduleData = useMemo(() => {
    const entries = weekScheduleQuery.data || [];

    // Group by clinician
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
      const data = clinicianMap.get(entry.clinicianId)!;
      if (!data.days.has(entry.date)) {
        data.days.set(entry.date, { am: null, pm: null, isOncall: false });
      }
      const dayData = data.days.get(entry.date)!;
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

  const weekConsultants = weekScheduleData.filter((s) => s.clinicianRole === 'consultant');
  const weekRegistrars = weekScheduleData.filter((s) => s.clinicianRole === 'registrar');

  // Build month schedule lookup: date -> { consultantOncall, registrarOncall, onLeave }
  const monthScheduleLookup = useMemo(() => {
    const entries = monthScheduleQuery.data || [];
    const lookup = new Map<string, {
      consultantOncall: string | null;
      registrarOncall: string | null;
      onLeave: string[];
    }>();

    entries.forEach((entry) => {
      if (!lookup.has(entry.date)) {
        lookup.set(entry.date, {
          consultantOncall: null,
          registrarOncall: null,
          onLeave: [],
        });
      }
      const data = lookup.get(entry.date)!;
      if (entry.isOncall) {
        if (entry.clinicianRole === 'consultant') {
          data.consultantOncall = entry.clinicianName;
        } else {
          data.registrarOncall = entry.clinicianName;
        }
      }
      if (entry.isLeave) {
        // Avoid duplicates (clinician may have AM and PM leave entries)
        if (!data.onLeave.includes(entry.clinicianName)) {
          data.onLeave.push(entry.clinicianName);
        }
      }
    });

    return lookup;
  }, [monthScheduleQuery.data]);

  const isLoading = (view === 'today' && (scheduleQuery.isLoading || oncallQuery.isLoading)) ||
    (view === 'week' && weekScheduleQuery.isLoading) ||
    (view === 'month' && monthScheduleQuery.isLoading);

  // Helper to get compact display for week view cells
  const getCompactDisplay = (entry: ScheduleEntry | null) => {
    if (!entry) return null;

    if (entry.isOncall) {
      return { text: 'On-call', color: '#ff9500', bg: 'rgba(255, 149, 0, 0.15)', isManual: entry.source === 'manual' };
    }
    if (entry.isLeave) {
      return { text: 'Leave', color: '#ff3b30', bg: 'rgba(255, 59, 48, 0.15)', isManual: entry.source === 'manual' };
    }
    if (entry.dutyName) {
      // For registrars with a supporting consultant, show "Surname Duty" format
      let displayText = entry.dutyName;
      if (entry.supportingClinicianName && entry.clinicianRole === 'registrar') {
        const surname = getSurname(entry.supportingClinicianName);
        displayText = `${surname} ${entry.dutyName}`;
      }
      return {
        text: displayText,
        color: entry.dutyColor || '#0071e3',
        bg: `${entry.dutyColor || '#0071e3'}20`,
        isManual: entry.source === 'manual'
      };
    }
    return null;
  };

  return (
    <Box>
      {/* Page Header */}
      <Group justify="space-between" mb={32}>
        <Box>
          <Group gap="md" mb={8}>
            <Text
              style={{
                fontSize: '2rem',
                fontWeight: 700,
                color: '#1d1d1f',
                letterSpacing: '-0.025em',
              }}
            >
              {view === 'month' ? formatMonthDisplay(selectedDate) : view === 'week' ? formatWeekRange(weekStart) : formatDisplayDate(selectedDate)}
            </Text>
            {view === 'today' && isToday(selectedDate) && (
              <Badge color="blue" variant="filled" size="lg" radius="md">Today</Badge>
            )}
          </Group>
          <Text style={{ fontSize: '1.0625rem', color: '#86868b' }}>
            {view === 'month' ? 'Monthly overview' : view === 'week' ? 'Weekly schedule' : (isToday(selectedDate) ? "Today's rota schedule" : 'Rota schedule')}
          </Text>
        </Box>
        <Group gap="sm">
          {/* Date Navigation */}
          <Group gap={4}>
            <ActionIcon
              variant="light"
              size="lg"
              radius="md"
              onClick={goToPrev}
              aria-label={view === 'month' ? 'Previous month' : view === 'week' ? 'Previous week' : 'Previous day'}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15,18 9,12 15,6"/>
              </svg>
            </ActionIcon>
            <Popover opened={datePickerOpen} onChange={setDatePickerOpen} position="bottom" withArrow shadow="md">
              <Popover.Target>
                <Button
                  variant="light"
                  size="sm"
                  radius="md"
                  onClick={() => setDatePickerOpen((o) => !o)}
                  leftSection={
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                      <line x1="16" y1="2" x2="16" y2="6"/>
                      <line x1="8" y1="2" x2="8" y2="6"/>
                      <line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                  }
                >
                  Pick Date
                </Button>
              </Popover.Target>
              <Popover.Dropdown>
                <DatePicker
                  value={new Date(selectedDate)}
                  onChange={(date) => {
                    if (date) {
                      setSelectedDate(getDateString(date));
                      setDatePickerOpen(false);
                    }
                  }}
                />
              </Popover.Dropdown>
            </Popover>
            <ActionIcon
              variant="light"
              size="lg"
              radius="md"
              onClick={goToNext}
              aria-label={view === 'month' ? 'Next month' : view === 'week' ? 'Next week' : 'Next day'}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9,18 15,12 9,6"/>
              </svg>
            </ActionIcon>
          </Group>
          <Button variant="subtle" size="sm" onClick={goToToday}>
            Go to Today
          </Button>
        </Group>
      </Group>

      {/* View Tabs */}
      <Box mb={24}>
        <SegmentedControl
          value={view}
          onChange={(v) => setView(v as ViewType)}
          data={[
            { label: 'Today', value: 'today' },
            { label: 'Week', value: 'week' },
            { label: 'Month', value: 'month' },
            { label: 'On-Call', value: 'oncall' },
            { label: 'Staff', value: 'staff' },
            { label: 'Leave', value: 'leave' },
          ]}
          styles={{
            root: { backgroundColor: '#f5f5f7' },
          }}
        />
      </Box>

      {/* Loading State */}
      {isLoading && (
        <Box ta="center" py={60}>
          <Loader size="lg" color="#0071e3" />
          <Text mt="md" c="dimmed">Loading schedule...</Text>
        </Box>
      )}

      {/* Today View Content */}
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
              <Text fw={600} size="lg">On-Call Today</Text>
            </Group>
            <Group gap={48}>
              <Box>
                <Text size="sm" style={{ opacity: 0.8 }} mb={4}>Consultant</Text>
                <Text fw={600} size="xl">
                  {oncallQuery.data?.consultant?.name || 'Not assigned'}
                </Text>
              </Box>
              <Box>
                <Text size="sm" style={{ opacity: 0.8 }} mb={4}>Registrar</Text>
                <Text fw={600} size="xl">
                  {oncallQuery.data?.registrar?.name || 'Not assigned'}
                </Text>
              </Box>
            </Group>
          </Box>

          {/* Empty State */}
          {scheduleData.length === 0 && (
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
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
              </Box>
              <Text fw={500} c="#1d1d1f" mb={4}>No clinicians configured</Text>
              <Text c="dimmed" size="sm">Add clinicians in Settings to see the schedule</Text>
            </Box>
          )}

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
                        <Table.Td
                          style={{ textAlign: 'center', cursor: 'pointer' }}
                          onClick={() => openEditModal({
                            clinicianId: row.clinicianId,
                            clinicianName: row.clinicianName,
                            date: selectedDate,
                            session: 'AM',
                            currentEntry: row.amEntry,
                          })}
                        >
                          <Box
                            px={12}
                            py={6}
                            style={{
                              backgroundColor: amDisplay?.bg || 'rgba(0, 0, 0, 0.04)',
                              borderRadius: 8,
                              display: 'inline-block',
                              transition: 'transform 150ms ease',
                            }}
                            className="cell-hover"
                          >
                            <Text fw={500} size="sm" style={{ color: amDisplay?.color || '#86868b' }}>
                              {amDisplay?.text || '—'}
                            </Text>
                          </Box>
                          {row.amEntry?.source === 'manual' && (
                            <Text size="xs" c="#0071e3" mt={2}>Manual</Text>
                          )}
                        </Table.Td>
                        <Table.Td
                          style={{ textAlign: 'center', cursor: 'pointer' }}
                          onClick={() => openEditModal({
                            clinicianId: row.clinicianId,
                            clinicianName: row.clinicianName,
                            date: selectedDate,
                            session: 'PM',
                            currentEntry: row.pmEntry,
                          })}
                        >
                          <Box
                            px={12}
                            py={6}
                            style={{
                              backgroundColor: pmDisplay?.bg || 'rgba(0, 0, 0, 0.04)',
                              borderRadius: 8,
                              display: 'inline-block',
                              transition: 'transform 150ms ease',
                            }}
                            className="cell-hover"
                          >
                            <Text fw={500} size="sm" style={{ color: pmDisplay?.color || '#86868b' }}>
                              {pmDisplay?.text || '—'}
                            </Text>
                          </Box>
                          {row.pmEntry?.source === 'manual' && (
                            <Text size="xs" c="#0071e3" mt={2}>Manual</Text>
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
                        <Table.Td
                          style={{ textAlign: 'center', cursor: 'pointer' }}
                          onClick={() => openEditModal({
                            clinicianId: row.clinicianId,
                            clinicianName: row.clinicianName,
                            date: selectedDate,
                            session: 'AM',
                            currentEntry: row.amEntry,
                          })}
                        >
                          <Box
                            px={12}
                            py={6}
                            style={{
                              backgroundColor: amDisplay?.bg || 'rgba(0, 0, 0, 0.04)',
                              borderRadius: 8,
                              display: 'inline-block',
                              transition: 'transform 150ms ease',
                            }}
                            className="cell-hover"
                          >
                            <Text fw={500} size="sm" style={{ color: amDisplay?.color || '#86868b' }}>
                              {amDisplay?.text || '—'}
                            </Text>
                          </Box>
                          {row.amEntry?.source === 'manual' && (
                            <Text size="xs" c="#0071e3" mt={2}>Manual</Text>
                          )}
                        </Table.Td>
                        <Table.Td
                          style={{ textAlign: 'center', cursor: 'pointer' }}
                          onClick={() => openEditModal({
                            clinicianId: row.clinicianId,
                            clinicianName: row.clinicianName,
                            date: selectedDate,
                            session: 'PM',
                            currentEntry: row.pmEntry,
                          })}
                        >
                          <Box
                            px={12}
                            py={6}
                            style={{
                              backgroundColor: pmDisplay?.bg || 'rgba(0, 0, 0, 0.04)',
                              borderRadius: 8,
                              display: 'inline-block',
                              transition: 'transform 150ms ease',
                            }}
                            className="cell-hover"
                          >
                            <Text fw={500} size="sm" style={{ color: pmDisplay?.color || '#86868b' }}>
                              {pmDisplay?.text || '—'}
                            </Text>
                          </Box>
                          {row.pmEntry?.source === 'manual' && (
                            <Text size="xs" c="#0071e3" mt={2}>Manual</Text>
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

      {/* Week View Content */}
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
                <Table verticalSpacing="sm" horizontalSpacing="sm" style={{ minWidth: 800 }}>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th style={{ width: 150, position: 'sticky', left: 0, backgroundColor: '#fff', zIndex: 1 }}>
                        Clinician
                      </Table.Th>
                      {weekDates.map((date) => {
                        const header = formatWeekDayHeader(date);
                        const isWeekend = ['Sat', 'Sun'].includes(header.day);
                        return (
                          <Table.Th
                            key={date}
                            style={{
                              textAlign: 'center',
                              minWidth: 80,
                              backgroundColor: header.isToday ? 'rgba(0, 113, 227, 0.08)' : isWeekend ? '#fafafa' : 'transparent',
                            }}
                          >
                            <Text size="xs" c={header.isToday ? '#0071e3' : 'dimmed'}>{header.day}</Text>
                            <Text size="sm" fw={header.isToday ? 600 : 400} c={header.isToday ? '#0071e3' : '#1d1d1f'}>
                              {header.date}
                            </Text>
                          </Table.Th>
                        );
                      })}
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
                          const header = formatWeekDayHeader(date);
                          const isWeekend = ['Sat', 'Sun'].includes(header.day);
                          const amDisplay = getCompactDisplay(dayData?.am || null);
                          const pmDisplay = getCompactDisplay(dayData?.pm || null);

                          return (
                            <Table.Td
                              key={date}
                              style={{
                                textAlign: 'center',
                                padding: 4,
                                backgroundColor: header.isToday ? 'rgba(0, 113, 227, 0.04)' : dayData?.isOncall ? 'rgba(255, 149, 0, 0.04)' : isWeekend ? '#fafafa' : 'transparent',
                              }}
                            >
                              <Box style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <Box
                                  px={4}
                                  py={2}
                                  onClick={() => openEditModal({
                                    clinicianId: row.clinicianId,
                                    clinicianName: row.clinicianName,
                                    date: date,
                                    session: 'AM',
                                    currentEntry: dayData?.am || null,
                                  })}
                                  style={{
                                    backgroundColor: amDisplay?.bg || 'rgba(0, 0, 0, 0.04)',
                                    borderRadius: 4,
                                    fontSize: 10,
                                    fontWeight: 500,
                                    color: amDisplay?.color || '#ccc',
                                    cursor: 'pointer',
                                    transition: 'transform 150ms ease',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                  }}
                                  className="cell-hover"
                                  title={amDisplay?.text || 'No duty'}
                                >
                                  {amDisplay?.text || '—'}
                                  {amDisplay?.isManual && <span style={{ color: '#0071e3' }}> *</span>}
                                </Box>
                                <Box
                                  px={4}
                                  py={2}
                                  onClick={() => openEditModal({
                                    clinicianId: row.clinicianId,
                                    clinicianName: row.clinicianName,
                                    date: date,
                                    session: 'PM',
                                    currentEntry: dayData?.pm || null,
                                  })}
                                  style={{
                                    backgroundColor: pmDisplay?.bg || 'rgba(0, 0, 0, 0.04)',
                                    borderRadius: 4,
                                    fontSize: 10,
                                    fontWeight: 500,
                                    color: pmDisplay?.color || '#ccc',
                                    cursor: 'pointer',
                                    transition: 'transform 150ms ease',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                  }}
                                  className="cell-hover"
                                  title={pmDisplay?.text || 'No duty'}
                                >
                                  {pmDisplay?.text || '—'}
                                  {pmDisplay?.isManual && <span style={{ color: '#0071e3' }}> *</span>}
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
                <Table verticalSpacing="sm" horizontalSpacing="sm" style={{ minWidth: 800 }}>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th style={{ width: 150, position: 'sticky', left: 0, backgroundColor: '#fff', zIndex: 1 }}>
                        Clinician
                      </Table.Th>
                      {weekDates.map((date) => {
                        const header = formatWeekDayHeader(date);
                        const isWeekend = ['Sat', 'Sun'].includes(header.day);
                        return (
                          <Table.Th
                            key={date}
                            style={{
                              textAlign: 'center',
                              minWidth: 80,
                              backgroundColor: header.isToday ? 'rgba(0, 113, 227, 0.08)' : isWeekend ? '#fafafa' : 'transparent',
                            }}
                          >
                            <Text size="xs" c={header.isToday ? '#0071e3' : 'dimmed'}>{header.day}</Text>
                            <Text size="sm" fw={header.isToday ? 600 : 400} c={header.isToday ? '#0071e3' : '#1d1d1f'}>
                              {header.date}
                            </Text>
                          </Table.Th>
                        );
                      })}
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
                          const header = formatWeekDayHeader(date);
                          const isWeekend = ['Sat', 'Sun'].includes(header.day);
                          const amDisplay = getCompactDisplay(dayData?.am || null);
                          const pmDisplay = getCompactDisplay(dayData?.pm || null);

                          return (
                            <Table.Td
                              key={date}
                              style={{
                                textAlign: 'center',
                                padding: 4,
                                backgroundColor: header.isToday ? 'rgba(0, 113, 227, 0.04)' : dayData?.isOncall ? 'rgba(255, 149, 0, 0.04)' : isWeekend ? '#fafafa' : 'transparent',
                              }}
                            >
                              <Box style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <Box
                                  px={4}
                                  py={2}
                                  onClick={() => openEditModal({
                                    clinicianId: row.clinicianId,
                                    clinicianName: row.clinicianName,
                                    date: date,
                                    session: 'AM',
                                    currentEntry: dayData?.am || null,
                                  })}
                                  style={{
                                    backgroundColor: amDisplay?.bg || 'rgba(0, 0, 0, 0.04)',
                                    borderRadius: 4,
                                    fontSize: 10,
                                    fontWeight: 500,
                                    color: amDisplay?.color || '#ccc',
                                    cursor: 'pointer',
                                    transition: 'transform 150ms ease',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                  }}
                                  className="cell-hover"
                                  title={amDisplay?.text || 'No duty'}
                                >
                                  {amDisplay?.text || '—'}
                                  {amDisplay?.isManual && <span style={{ color: '#0071e3' }}> *</span>}
                                </Box>
                                <Box
                                  px={4}
                                  py={2}
                                  onClick={() => openEditModal({
                                    clinicianId: row.clinicianId,
                                    clinicianName: row.clinicianName,
                                    date: date,
                                    session: 'PM',
                                    currentEntry: dayData?.pm || null,
                                  })}
                                  style={{
                                    backgroundColor: pmDisplay?.bg || 'rgba(0, 0, 0, 0.04)',
                                    borderRadius: 4,
                                    fontSize: 10,
                                    fontWeight: 500,
                                    color: pmDisplay?.color || '#ccc',
                                    cursor: 'pointer',
                                    transition: 'transform 150ms ease',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                  }}
                                  className="cell-hover"
                                  title={pmDisplay?.text || 'No duty'}
                                >
                                  {pmDisplay?.text || '—'}
                                  {pmDisplay?.isManual && <span style={{ color: '#0071e3' }}> *</span>}
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

          {/* Empty state */}
          {weekConsultants.length === 0 && weekRegistrars.length === 0 && (
            <Box
              ta="center"
              py={60}
              style={{
                backgroundColor: '#ffffff',
                borderRadius: 16,
                border: '1px solid rgba(0, 0, 0, 0.06)',
              }}
            >
              <Text fw={500} c="#1d1d1f" mb={4}>No clinicians configured</Text>
              <Text c="dimmed" size="sm">Add clinicians in Settings to see the schedule</Text>
            </Box>
          )}
        </>
      )}

      {/* Month View Content */}
      {!isLoading && view === 'month' && (
        <Box
          style={{
            backgroundColor: '#ffffff',
            borderRadius: 16,
            overflow: 'hidden',
            border: '1px solid rgba(0, 0, 0, 0.06)',
          }}
        >
          {/* Calendar Header */}
          <Box
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              backgroundColor: '#fafafa',
              borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
            }}
          >
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, idx) => (
              <Box
                key={day}
                py={12}
                style={{
                  textAlign: 'center',
                  backgroundColor: idx >= 5 ? '#f5f5f7' : 'transparent',
                }}
              >
                <Text size="sm" fw={600} c="dimmed">{day}</Text>
              </Box>
            ))}
          </Box>

          {/* Calendar Grid */}
          {monthCalendarWeeks.map((week, weekIdx) => (
            <Box
              key={weekIdx}
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                borderBottom: weekIdx < monthCalendarWeeks.length - 1 ? '1px solid rgba(0, 0, 0, 0.06)' : 'none',
              }}
            >
              {week.map((day, dayIdx) => {
                const dayInfo = monthScheduleLookup.get(day.date);
                const todayCheck = isToday(day.date);
                const isWeekend = dayIdx >= 5;

                return (
                  <Box
                    key={day.date}
                    p={8}
                    style={{
                      minHeight: 90,
                      backgroundColor: todayCheck ? 'rgba(0, 113, 227, 0.05)' : isWeekend ? '#fafafa' : 'transparent',
                      borderRight: dayIdx < 6 ? '1px solid rgba(0, 0, 0, 0.06)' : 'none',
                      opacity: day.isCurrentMonth ? 1 : 0.4,
                      cursor: 'pointer',
                    }}
                    onClick={() => {
                      setSelectedDate(day.date);
                      setView('today');
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

                    {/* On-call info */}
                    {dayInfo?.consultantOncall && (
                      <Box
                        mb={2}
                        px={4}
                        py={2}
                        style={{
                          backgroundColor: 'rgba(255, 149, 0, 0.15)',
                          borderRadius: 4,
                        }}
                        title={`Consultant On-call: ${dayInfo.consultantOncall}`}
                      >
                        <Text size="xs" c="#ff9500" fw={500} lineClamp={1}>
                          C: {getSurname(dayInfo.consultantOncall)}
                        </Text>
                      </Box>
                    )}
                    {dayInfo?.registrarOncall && (
                      <Box
                        mb={2}
                        px={4}
                        py={2}
                        style={{
                          backgroundColor: 'rgba(175, 82, 222, 0.15)',
                          borderRadius: 4,
                        }}
                        title={`Registrar On-call: ${dayInfo.registrarOncall}`}
                      >
                        <Text size="xs" c="#af52de" fw={500} lineClamp={1}>
                          R: {getSurname(dayInfo.registrarOncall)}
                        </Text>
                      </Box>
                    )}
                    {dayInfo?.onLeave && dayInfo.onLeave.slice(0, 2).map((name) => (
                      <Box
                        key={name}
                        mb={2}
                        px={4}
                        py={2}
                        style={{
                          backgroundColor: 'rgba(255, 59, 48, 0.12)',
                          borderRadius: 4,
                        }}
                        title={`On Leave: ${name}`}
                      >
                        <Text size="xs" c="#ff3b30" fw={500} lineClamp={1}>
                          {getSurname(name)}
                        </Text>
                      </Box>
                    ))}
                    {dayInfo?.onLeave && dayInfo.onLeave.length > 2 && (
                      <Text size="xs" c="#ff3b30" px={4}>
                        +{dayInfo.onLeave.length - 2} more
                      </Text>
                    )}
                  </Box>
                );
              })}
            </Box>
          ))}
        </Box>
      )}

      {/* Placeholder for other views */}
      {!isLoading && view !== 'today' && view !== 'week' && view !== 'month' && (
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
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 6v6l4 2"/>
            </svg>
          </Box>
          <Text fw={500} c="#1d1d1f" mb={4}>
            {view.charAt(0).toUpperCase() + view.slice(1)} View
          </Text>
          <Text c="dimmed" size="sm">Coming soon</Text>
        </Box>
      )}

      {/* Edit Override Modal */}
      <Modal
        opened={!!editingCell}
        onClose={() => setEditingCell(null)}
        title={
          <Text fw={600} size="lg">
            Edit {editingCell?.session} Session
          </Text>
        }
        centered
      >
        {editingCell && (
          <Box>
            <Box mb={16} p={12} style={{ backgroundColor: '#f5f5f7', borderRadius: 8 }}>
              <Text size="sm" c="dimmed">Clinician</Text>
              <Text fw={500}>{editingCell.clinicianName}</Text>
              <Text size="sm" c="dimmed" mt={8}>Date</Text>
              <Text fw={500}>{formatDisplayDate(editingCell.date)}</Text>
              <Text size="sm" c="dimmed" mt={8}>Session</Text>
              <Text fw={500}>{editingCell.session}</Text>
            </Box>

            {editingCell.currentEntry?.source === 'manual' && (
              <Box mb={16} p={12} style={{ backgroundColor: 'rgba(0, 113, 227, 0.08)', borderRadius: 8 }}>
                <Text size="sm" c="#0071e3" fw={500}>This is a manual override</Text>
              </Box>
            )}

            <Select
              label="Duty"
              placeholder="Select duty (or leave empty)"
              data={[
                { value: '', label: '— No duty —' },
                ...(dutiesQuery.data || []).map((d) => ({
                  value: d.id.toString(),
                  label: d.name,
                })),
              ]}
              value={editDutyId || ''}
              onChange={(v) => setEditDutyId(v || null)}
              mb={16}
              clearable
            />

            <Switch
              label="On-call"
              description="Mark this clinician as on-call for this session"
              checked={editIsOncall}
              onChange={(e) => setEditIsOncall(e.currentTarget.checked)}
              mb={16}
            />

            <Textarea
              label="Note (optional)"
              placeholder="Add a note about this override..."
              value={editNote}
              onChange={(e) => setEditNote(e.currentTarget.value)}
              mb={24}
            />

            <Group justify="space-between">
              {editingCell.currentEntry?.source === 'manual' ? (
                <Button
                  variant="subtle"
                  color="red"
                  onClick={handleRevertOverride}
                  loading={deleteOverrideMutation.isPending}
                >
                  Revert to Computed
                </Button>
              ) : (
                <Box />
              )}
              <Group>
                <Button variant="subtle" onClick={() => setEditingCell(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveOverride}
                  loading={overrideMutation.isPending}
                >
                  Save Override
                </Button>
              </Group>
            </Group>
          </Box>
        )}
      </Modal>
    </Box>
  );
};
