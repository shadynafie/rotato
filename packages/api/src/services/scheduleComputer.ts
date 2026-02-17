import { prisma } from '../prisma.js';
import type { OnCallConfig, OnCallSlot, OnCallPattern, SlotAssignment } from '@prisma/client';
import { formatDateString, dateRange, weekOfMonth, getDayOfWeek } from '../utils/dateHelpers.js';

type Session = 'AM' | 'PM';

interface ScheduleEntry {
  date: string; // YYYY-MM-DD
  clinicianId: number;
  clinicianName: string;
  clinicianRole: 'consultant' | 'registrar';
  session: Session;
  dutyId: number | null;
  dutyName: string | null;
  dutyColor: string | null;
  isOncall: boolean;
  isLeave: boolean;
  leaveType: string | null;
  source: 'jobplan' | 'oncall' | 'leave' | 'manual' | 'rest';
  manualOverrideId: number | null; // RotaEntry id if manually overridden
  isRest: boolean;
  isRestOff: boolean;  // true if OFF (no duty), false if SPA duty
  supportingClinicianId: number | null;
  supportingClinicianName: string | null;
}

// Slot-based on-call data structure
interface SlotBasedData {
  config: OnCallConfig | null;
  slots: OnCallSlot[];
  patterns: OnCallPattern[];
  assignments: SlotAssignment[];
}

// Slot-based on-call clinician picker
function computeOncallClinicianSlotBased(
  date: Date,
  role: 'consultant' | 'registrar',
  data: SlotBasedData
): number | null {
  const { config, slots, patterns, assignments } = data;

  if (!config || slots.length === 0) return null;

  // Use string-based date comparison to avoid timezone issues
  const dateStr = formatDateString(date);
  const startDateStr = formatDateString(config.startDate);

  // Calculate days difference using UTC timestamps of midnight
  const dateMs = Date.parse(dateStr + 'T00:00:00Z');
  const startDateMs = Date.parse(startDateStr + 'T00:00:00Z');
  const daysSinceStart = Math.round((dateMs - startDateMs) / (1000 * 60 * 60 * 24));

  let slotId: number;

  if (role === 'consultant') {
    // Consultants: week N = slot with position N (implicit pattern)
    const weeksSinceStart = Math.floor(daysSinceStart / 7);
    const weekOfCycle = ((weeksSinceStart % config.cycleLength) + config.cycleLength) % config.cycleLength;
    const position = weekOfCycle + 1; // 1-indexed
    const slot = slots.find(s => s.position === position);

    if (!slot) return null;
    slotId = slot.id;
  } else {
    // Registrars: use explicit pattern if available, otherwise implicit round-robin
    const dayOfCycle = ((daysSinceStart % config.cycleLength) + config.cycleLength) % config.cycleLength + 1;

    if (patterns.length > 0) {
      // Explicit pattern configured - use it
      const pattern = patterns.find(p => p.dayOfCycle === dayOfCycle);
      if (!pattern) return null;
      slotId = pattern.slotId;
    } else {
      // No explicit pattern - use implicit round-robin (like consultants but daily)
      const position = ((dayOfCycle - 1) % slots.length) + 1;
      const slot = slots.find(s => s.position === position);
      if (!slot) return null;
      slotId = slot.id;
    }
  }

  // Find active assignment for this slot on this date
  const assignment = assignments.find(a => {
    if (a.slotId !== slotId) return false;

    const fromStr = formatDateString(a.effectiveFrom);
    const toStr = a.effectiveTo ? formatDateString(a.effectiveTo) : '9999-12-31';

    return fromStr <= dateStr && toStr >= dateStr;
  });

  return assignment?.clinicianId ?? null;
}

export async function computeSchedule(from: Date, to: Date): Promise<ScheduleEntry[]> {
  // Fetch all required data including slot-based on-call data
  const [
    clinicians,
    jobPlans,
    leaves,
    manualOverrides,
    duties,
    coverageAssignments,
    // Slot-based on-call data
    oncallConfigs,
    oncallSlots,
    oncallPatterns,
    oncallAssignments
  ] = await Promise.all([
    prisma.clinician.findMany({ where: { active: true }, orderBy: [{ role: 'asc' }, { name: 'asc' }] }),
    prisma.jobPlanWeek.findMany({ include: { amDuty: true, pmDuty: true } }),
    prisma.leave.findMany({
      where: {
        date: { gte: from, lte: to }
      }
    }),
    prisma.rotaEntry.findMany({
      where: {
        date: { gte: from, lte: to },
        source: { in: ['manual', 'rest'] }
      },
      include: { duty: true }
    }),
    prisma.duty.findMany(),
    // Fetch coverage assignments for registrars
    prisma.coverageRequest.findMany({
      where: {
        date: { gte: from, lte: to },
        status: 'assigned',
        assignedRegistrarId: { not: null }
      },
      include: { duty: true, consultant: true }
    }),
    // Slot-based on-call data
    prisma.onCallConfig.findMany(),
    prisma.onCallSlot.findMany({ where: { active: true } }),
    prisma.onCallPattern.findMany({ where: { role: 'registrar' } }),
    prisma.slotAssignment.findMany({
      where: {
        effectiveFrom: { lte: to },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: from } }]
      }
    })
  ]);

  // Build slot-based data structures
  const consultantConfig = oncallConfigs.find(c => c.role === 'consultant') ?? null;
  const registrarConfig = oncallConfigs.find(c => c.role === 'registrar') ?? null;
  const consultantSlots = oncallSlots.filter(s => s.role === 'consultant');
  const registrarSlots = oncallSlots.filter(s => s.role === 'registrar');
  const consultantAssignments = oncallAssignments.filter(a =>
    consultantSlots.some(s => s.id === a.slotId)
  );
  const registrarAssignments = oncallAssignments.filter(a =>
    registrarSlots.some(s => s.id === a.slotId)
  );

  const consultantData: SlotBasedData = {
    config: consultantConfig,
    slots: consultantSlots,
    patterns: [], // Consultants don't use patterns
    assignments: consultantAssignments
  };

  const registrarData: SlotBasedData = {
    config: registrarConfig,
    slots: registrarSlots,
    patterns: oncallPatterns,
    assignments: registrarAssignments
  };

  // Build clinician lookup for names
  const clinicianMap = new Map<number, { name: string; role: string }>();
  clinicians.forEach((c) => clinicianMap.set(c.id, { name: c.name, role: c.role }));

  // Build lookup maps
  const jobPlanMap = new Map<string, {
    amDutyId: number | null;
    pmDutyId: number | null;
    amDuty: any;
    pmDuty: any;
    amSupportingClinicianId: number | null;
    pmSupportingClinicianId: number | null;
  }>();
  jobPlans.forEach((jp) => {
    const key = `${jp.clinicianId}-${jp.weekNo}-${jp.dayOfWeek}`;
    jobPlanMap.set(key, {
      amDutyId: jp.amDutyId,
      pmDutyId: jp.pmDutyId,
      amDuty: jp.amDuty,
      pmDuty: jp.pmDuty,
      amSupportingClinicianId: jp.amSupportingClinicianId,
      pmSupportingClinicianId: jp.pmSupportingClinicianId
    });
  });

  // Helper function to compute on-call for a specific date and role (slot-based only)
  const getOncallClinicianId = (date: Date, role: 'consultant' | 'registrar'): number | null => {
    const isConsultant = role === 'consultant';
    return computeOncallClinicianSlotBased(
      date,
      role,
      isConsultant ? consultantData : registrarData
    );
  };

  // Leave lookup: clinicianId-date -> Leave
  const leaveMap = new Map<string, { session: string; type: string }>();
  leaves.forEach((l) => {
    const dateStr = formatDateString(new Date(l.date));
    const key = `${l.clinicianId}-${dateStr}`;
    leaveMap.set(key, { session: l.session, type: l.type });
  });

  // Manual override lookup: clinicianId-date-session -> RotaEntry
  const manualMap = new Map<string, any>();
  // Rest entries lookup: clinicianId-date-session -> RotaEntry
  const restMap = new Map<string, any>();
  manualOverrides.forEach((m) => {
    const dateStr = formatDateString(new Date(m.date));
    const key = `${m.clinicianId}-${dateStr}-${m.session}`;
    if (m.source === 'rest') {
      restMap.set(key, m);
    } else {
      manualMap.set(key, m);
    }
  });

  const dutyMap = new Map<number, { name: string; color: string | null }>();
  duties.forEach((d) => dutyMap.set(d.id, { name: d.name, color: d.color }));

  // Coverage assignment lookup: registrarId-date-session -> coverage info
  const coverageMap = new Map<string, {
    dutyId: number;
    dutyName: string;
    dutyColor: string | null;
    consultantId: number | null;
    consultantName: string | null;
  }>();
  coverageAssignments.forEach((c) => {
    const dateStr = formatDateString(new Date(c.date));
    const key = `${c.assignedRegistrarId}-${dateStr}-${c.session}`;
    coverageMap.set(key, {
      dutyId: c.dutyId,
      dutyName: c.duty.name,
      dutyColor: c.duty.color,
      consultantId: c.consultantId,
      consultantName: c.consultant?.name ?? null
    });
  });

  const result: ScheduleEntry[] = [];

  for (const date of dateRange(from, to)) {
    const dateStr = formatDateString(date);
    const weekNo = Math.min(5, Math.max(1, weekOfMonth(date)));
    const dayOfWeek = getDayOfWeek(date);
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;

    // Calculate who's on-call today (uses slot-based if available, otherwise old cycles)
    const oncallConsultantId = getOncallClinicianId(date, 'consultant');
    const oncallRegistrarId = getOncallClinicianId(date, 'registrar');

    for (const clinician of clinicians) {
      const sessions: Session[] = ['AM', 'PM'];
      const leaveKey = `${clinician.id}-${dateStr}`;
      const leave = leaveMap.get(leaveKey);

      const isOncall = clinician.role === 'consultant'
        ? oncallConsultantId === clinician.id
        : oncallRegistrarId === clinician.id;

      for (const session of sessions) {
        const manualKey = `${clinician.id}-${dateStr}-${session}`;
        const manual = manualMap.get(manualKey);
        const restKey = `${clinician.id}-${dateStr}-${session}`;
        const rest = restMap.get(restKey);
        const coverageKey = `${clinician.id}-${dateStr}-${session}`;
        const coverage = coverageMap.get(coverageKey);

        // Priority: Leave > Manual override > Rest (registrar recovery) > Coverage assignment > On-call > Job plan
        // Leave always takes precedence for display (coverage requests are created separately)
        let entry: ScheduleEntry;

        if (leave && (leave.session === 'FULL' || leave.session === session)) {
          // Leave takes precedence for display
          entry = {
            date: dateStr,
            clinicianId: clinician.id,
            clinicianName: clinician.name,
            clinicianRole: clinician.role as 'consultant' | 'registrar',
            session,
            dutyId: null,
            dutyName: null,
            dutyColor: null,
            isOncall: false,
            isLeave: true,
            leaveType: leave.type,
            source: 'leave',
            manualOverrideId: null,
            supportingClinicianId: null,
            supportingClinicianName: null,
            isRest: false,
            isRestOff: false
          };
        } else if (manual) {
          // Manual override
          const duty = manual.dutyId ? dutyMap.get(manual.dutyId) : null;
          const manualSupportingClinicianId = manual.supportingClinicianId ?? null;
          const manualSupportingClinician = manualSupportingClinicianId ? clinicianMap.get(manualSupportingClinicianId) : null;
          entry = {
            date: dateStr,
            clinicianId: clinician.id,
            clinicianName: clinician.name,
            clinicianRole: clinician.role as 'consultant' | 'registrar',
            session,
            dutyId: manual.dutyId,
            dutyName: duty?.name ?? null,
            dutyColor: duty?.color ?? null,
            isOncall: manual.isOncall,
            isLeave: false,
            leaveType: null,
            source: 'manual',
            manualOverrideId: manual.id,
            supportingClinicianId: manualSupportingClinicianId,
            supportingClinicianName: manualSupportingClinician?.name ?? null,
            isRest: false,
            isRestOff: false
          };
        } else if (rest && clinician.role === 'registrar') {
          // Rest day for registrar (from on-call recovery)
          const duty = rest.dutyId ? dutyMap.get(rest.dutyId) : null;
          const isOff = rest.dutyId === null;  // No duty = OFF
          entry = {
            date: dateStr,
            clinicianId: clinician.id,
            clinicianName: clinician.name,
            clinicianRole: clinician.role as 'consultant' | 'registrar',
            session,
            dutyId: rest.dutyId,
            dutyName: duty?.name ?? (isOff ? 'OFF' : null),
            dutyColor: duty?.color ?? null,
            isOncall: false,
            isLeave: false,
            leaveType: null,
            source: 'rest',
            manualOverrideId: null,
            supportingClinicianId: null,
            supportingClinicianName: null,
            isRest: true,
            isRestOff: isOff
          };
        } else if (coverage) {
          // Coverage assignment - registrar covering for a consultant
          entry = {
            date: dateStr,
            clinicianId: clinician.id,
            clinicianName: clinician.name,
            clinicianRole: clinician.role as 'consultant' | 'registrar',
            session,
            dutyId: coverage.dutyId,
            dutyName: coverage.dutyName,
            dutyColor: coverage.dutyColor,
            isOncall: false,
            isLeave: false,
            leaveType: null,
            source: 'manual', // Show as manual since it's an explicit assignment
            manualOverrideId: null,
            supportingClinicianId: coverage.consultantId,
            supportingClinicianName: coverage.consultantName,
            isRest: false,
            isRestOff: false
          };
        } else if (isOncall) {
          // On-call
          entry = {
            date: dateStr,
            clinicianId: clinician.id,
            clinicianName: clinician.name,
            clinicianRole: clinician.role as 'consultant' | 'registrar',
            session,
            dutyId: null,
            dutyName: null,
            dutyColor: null,
            isOncall: true,
            isLeave: false,
            leaveType: null,
            source: 'oncall',
            manualOverrideId: null,
            supportingClinicianId: null,
            supportingClinicianName: null,
            isRest: false,
            isRestOff: false
          };
        } else if (isWeekday) {
          // Job plan (weekdays only)
          const planKey = `${clinician.id}-${weekNo}-${dayOfWeek}`;
          const plan = jobPlanMap.get(planKey);
          const dutyId = session === 'AM' ? plan?.amDutyId : plan?.pmDutyId;
          const duty = dutyId ? dutyMap.get(dutyId) : null;
          const supportingClinicianId = session === 'AM' ? plan?.amSupportingClinicianId : plan?.pmSupportingClinicianId;
          const supportingClinician = supportingClinicianId ? clinicianMap.get(supportingClinicianId) : null;

          entry = {
            date: dateStr,
            clinicianId: clinician.id,
            clinicianName: clinician.name,
            clinicianRole: clinician.role as 'consultant' | 'registrar',
            session,
            dutyId: dutyId ?? null,
            dutyName: duty?.name ?? null,
            dutyColor: duty?.color ?? null,
            isOncall: false,
            isLeave: false,
            leaveType: null,
            source: 'jobplan',
            manualOverrideId: null,
            supportingClinicianId: supportingClinicianId ?? null,
            supportingClinicianName: supportingClinician?.name ?? null,
            isRest: false,
            isRestOff: false
          };
        } else {
          // Weekend with no on-call - empty entry
          entry = {
            date: dateStr,
            clinicianId: clinician.id,
            clinicianName: clinician.name,
            clinicianRole: clinician.role as 'consultant' | 'registrar',
            session,
            dutyId: null,
            dutyName: null,
            dutyColor: null,
            isOncall: false,
            isLeave: false,
            leaveType: null,
            source: 'jobplan',
            manualOverrideId: null,
            supportingClinicianId: null,
            supportingClinicianName: null,
            isRest: false,
            isRestOff: false
          };
        }

        result.push(entry);
      }
    }
  }

  return result;
}

// Convenience function to get today's on-call
export async function getTodayOncall(): Promise<{
  consultant: { id: number; name: string } | null;
  registrar: { id: number; name: string } | null;
}> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    clinicians,
    oncallConfigs,
    oncallSlots,
    oncallPatterns,
    oncallAssignments
  ] = await Promise.all([
    prisma.clinician.findMany({ where: { active: true }, orderBy: [{ role: 'asc' }, { name: 'asc' }] }),
    prisma.onCallConfig.findMany(),
    prisma.onCallSlot.findMany({ where: { active: true } }),
    prisma.onCallPattern.findMany({ where: { role: 'registrar' } }),
    prisma.slotAssignment.findMany({
      where: {
        effectiveFrom: { lte: today },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }]
      }
    })
  ]);

  // Build slot-based data structures
  const consultantConfig = oncallConfigs.find(c => c.role === 'consultant') ?? null;
  const registrarConfig = oncallConfigs.find(c => c.role === 'registrar') ?? null;
  const consultantSlots = oncallSlots.filter(s => s.role === 'consultant');
  const registrarSlots = oncallSlots.filter(s => s.role === 'registrar');
  const consultantAssignments = oncallAssignments.filter(a =>
    consultantSlots.some(s => s.id === a.slotId)
  );
  const registrarAssignments = oncallAssignments.filter(a =>
    registrarSlots.some(s => s.id === a.slotId)
  );

  const consultantData: SlotBasedData = {
    config: consultantConfig,
    slots: consultantSlots,
    patterns: [],
    assignments: consultantAssignments
  };

  const registrarData: SlotBasedData = {
    config: registrarConfig,
    slots: registrarSlots,
    patterns: oncallPatterns,
    assignments: registrarAssignments
  };

  // Calculate on-call IDs using slot-based system
  const oncallConsultantId = computeOncallClinicianSlotBased(today, 'consultant', consultantData);
  const oncallRegistrarId = computeOncallClinicianSlotBased(today, 'registrar', registrarData);

  const consultant = clinicians.find((c) => c.id === oncallConsultantId);
  const registrar = clinicians.find((c) => c.id === oncallRegistrarId);

  return {
    consultant: consultant ? { id: consultant.id, name: consultant.name } : null,
    registrar: registrar ? { id: registrar.id, name: registrar.name } : null
  };
}
