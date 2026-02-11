import { prisma } from '../prisma.js';

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
  source: 'jobplan' | 'oncall' | 'leave' | 'manual';
  manualOverrideId: number | null; // RotaEntry id if manually overridden
}

function formatDateString(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = `${date.getMonth() + 1}`.padStart(2, '0');
  const dd = `${date.getDate()}`.padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function* dateRange(start: Date, end: Date) {
  const current = new Date(start);
  while (current <= end) {
    yield new Date(current);
    current.setDate(current.getDate() + 1);
  }
}

function weekOfMonth(date: Date): number {
  const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
  const dayOfMonth = date.getDate();
  const adjusted = dayOfMonth + firstDay.getDay();
  return Math.ceil(adjusted / 7);
}

// Get day of week: 1=Monday, 2=Tuesday, ..., 5=Friday, 6=Saturday, 7=Sunday
function getDayOfWeek(date: Date): number {
  const jsDay = date.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
  return jsDay === 0 ? 7 : jsDay;
}

function computeOncallClinicianId(
  date: Date,
  role: 'consultant' | 'registrar',
  cycles: { cycleLength: number; clinicianId: number; position: number; startDate: Date | null }[]
): number | null {
  if (!cycles.length) return null;
  const anchor = cycles[0].startDate ?? new Date('2024-01-01');
  const unitDays = role === 'consultant' ? 7 : 1; // consultants rotate weekly, registrars daily
  const diffMs = date.getTime() - anchor.getTime();
  const diffUnits = Math.floor(diffMs / (1000 * 60 * 60 * 24 * unitDays));
  const length = cycles[0].cycleLength;
  const idx = ((diffUnits % length) + length) % length; // handle negatives
  const slot = cycles.find((s) => s.position === idx + 1);
  return slot?.clinicianId ?? null;
}

export async function computeSchedule(from: Date, to: Date): Promise<ScheduleEntry[]> {
  // Fetch all required data
  const [clinicians, jobPlans, oncallCycles, leaves, manualOverrides, duties] = await Promise.all([
    prisma.clinician.findMany({ where: { active: true } }),
    prisma.jobPlanWeek.findMany({ include: { amDuty: true, pmDuty: true } }),
    prisma.oncallCycle.findMany(),
    prisma.leave.findMany({
      where: {
        date: { gte: from, lte: to }
      }
    }),
    prisma.rotaEntry.findMany({
      where: {
        date: { gte: from, lte: to },
        source: 'manual'
      },
      include: { duty: true }
    }),
    prisma.duty.findMany()
  ]);

  // Build lookup maps
  const jobPlanMap = new Map<string, { amDutyId: number | null; pmDutyId: number | null; amDuty: any; pmDuty: any }>();
  jobPlans.forEach((jp) => {
    const key = `${jp.clinicianId}-${jp.weekNo}-${jp.dayOfWeek}`;
    jobPlanMap.set(key, {
      amDutyId: jp.amDutyId,
      pmDutyId: jp.pmDutyId,
      amDuty: jp.amDuty,
      pmDuty: jp.pmDuty
    });
  });

  const consultantCycles = oncallCycles.filter((c) => c.role === 'consultant');
  const registrarCycles = oncallCycles.filter((c) => c.role === 'registrar');

  // Leave lookup: clinicianId-date -> Leave
  const leaveMap = new Map<string, { session: string; type: string }>();
  leaves.forEach((l) => {
    const dateStr = formatDateString(new Date(l.date));
    const key = `${l.clinicianId}-${dateStr}`;
    leaveMap.set(key, { session: l.session, type: l.type });
  });

  // Manual override lookup: clinicianId-date-session -> RotaEntry
  const manualMap = new Map<string, any>();
  manualOverrides.forEach((m) => {
    const dateStr = formatDateString(new Date(m.date));
    const key = `${m.clinicianId}-${dateStr}-${m.session}`;
    manualMap.set(key, m);
  });

  const dutyMap = new Map<number, { name: string; color: string | null }>();
  duties.forEach((d) => dutyMap.set(d.id, { name: d.name, color: d.color }));

  const result: ScheduleEntry[] = [];

  for (const date of dateRange(from, to)) {
    const dateStr = formatDateString(date);
    const weekNo = Math.min(5, Math.max(1, weekOfMonth(date)));
    const dayOfWeek = getDayOfWeek(date);
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;

    // Calculate who's on-call today
    const oncallConsultantId = computeOncallClinicianId(date, 'consultant', consultantCycles);
    const oncallRegistrarId = computeOncallClinicianId(date, 'registrar', registrarCycles);

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

        // Priority: Manual override > Leave > On-call > Job plan
        let entry: ScheduleEntry;

        if (manual) {
          // Manual override takes precedence
          const duty = manual.dutyId ? dutyMap.get(manual.dutyId) : null;
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
            manualOverrideId: manual.id
          };
        } else if (leave && (leave.session === 'FULL' || leave.session === session)) {
          // Leave
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
            manualOverrideId: null
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
            manualOverrideId: null
          };
        } else if (isWeekday) {
          // Job plan (weekdays only)
          const planKey = `${clinician.id}-${weekNo}-${dayOfWeek}`;
          const plan = jobPlanMap.get(planKey);
          const dutyId = session === 'AM' ? plan?.amDutyId : plan?.pmDutyId;
          const duty = dutyId ? dutyMap.get(dutyId) : null;

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
            manualOverrideId: null
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
            manualOverrideId: null
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

  const [oncallCycles, clinicians] = await Promise.all([
    prisma.oncallCycle.findMany(),
    prisma.clinician.findMany({ where: { active: true } })
  ]);

  const consultantCycles = oncallCycles.filter((c) => c.role === 'consultant');
  const registrarCycles = oncallCycles.filter((c) => c.role === 'registrar');

  const oncallConsultantId = computeOncallClinicianId(today, 'consultant', consultantCycles);
  const oncallRegistrarId = computeOncallClinicianId(today, 'registrar', registrarCycles);

  const consultant = clinicians.find((c) => c.id === oncallConsultantId);
  const registrar = clinicians.find((c) => c.id === oncallRegistrarId);

  return {
    consultant: consultant ? { id: consultant.id, name: consultant.name } : null,
    registrar: registrar ? { id: registrar.id, name: registrar.name } : null
  };
}
