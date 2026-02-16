import { prisma } from '../prisma.js';
import type { Session, RotaSource } from '../types/enums.js';
import type { OnCallConfig, OnCallSlot, OnCallPattern, SlotAssignment } from '@prisma/client';

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

// Slot-based on-call clinician picker
interface SlotBasedData {
  config: OnCallConfig | null;
  slots: OnCallSlot[];
  patterns: OnCallPattern[];  // Only for registrars
  assignments: SlotAssignment[];
}

// Helper to extract YYYY-MM-DD from a Date object (timezone-safe)
function toDateString(d: Date): string {
  return d.toISOString().split('T')[0];
}

function pickOncallClinicianSlotBased(
  date: Date,
  role: 'consultant' | 'registrar',
  data: SlotBasedData
): number | null {
  const { config, slots, patterns, assignments } = data;

  if (!config || slots.length === 0) return null;

  // Use string-based date comparison to avoid timezone issues
  const dateStr = toDateString(date);
  const startDateStr = toDateString(config.startDate);

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
      if (!pattern) {
        // Log missing pattern for debugging
        console.log(`[Registrar] No pattern found for dayOfCycle=${dayOfCycle}, date=${dateStr}`);
        return null;
      }
      slotId = pattern.slotId;
    } else {
      // No explicit pattern - use implicit round-robin (like consultants but daily)
      // Day N of cycle = slot ((N-1) mod numSlots) + 1
      const position = ((dayOfCycle - 1) % slots.length) + 1;
      const slot = slots.find(s => s.position === position);
      if (!slot) return null;
      slotId = slot.id;
    }
  }

  // Find active assignment for this slot on this date - use string comparison
  const assignment = assignments.find(a => {
    if (a.slotId !== slotId) return false;

    const fromStr = toDateString(a.effectiveFrom);
    const toStr = a.effectiveTo ? toDateString(a.effectiveTo) : '9999-12-31';

    return fromStr <= dateStr && toStr >= dateStr;
  });

  // Debug log for first day of each month (to avoid flooding)
  if (role === 'registrar' && date.getDate() === 1) {
    console.log(`[Registrar] Date ${dateStr}: daysSinceStart=${daysSinceStart}, slotId=${slotId}, assignment=${assignment ? `clinician ${assignment.clinicianId}` : 'NONE'}`);
  }

  return assignment?.clinicianId ?? null;
}

export async function generateRota(from: Date, to: Date) {
  const clinicians = await prisma.clinician.findMany({ where: { active: true }, include: { jobPlanWeeks: true } });

  // Build job plan lookup: clinicianId -> "weekNo-dayOfWeek" -> { amDutyId, pmDutyId }
  const jobPlanByClinician = new Map<number, Map<string, { amDutyId: number | null; pmDutyId: number | null }>>();
  clinicians.forEach((c) => {
    const map = new Map<string, { amDutyId: number | null; pmDutyId: number | null }>();
    c.jobPlanWeeks.forEach((w) => {
      const key = `${w.weekNo}-${w.dayOfWeek}`;
      map.set(key, { amDutyId: w.amDutyId ?? null, pmDutyId: w.pmDutyId ?? null });
    });
    jobPlanByClinician.set(c.id, map);
  });

  // ============================================
  // NEW: Fetch slot-based on-call data
  // ============================================
  const configs = await prisma.onCallConfig.findMany();
  const consultantConfig = configs.find(c => c.role === 'consultant') ?? null;
  const registrarConfig = configs.find(c => c.role === 'registrar') ?? null;

  const allSlots = await prisma.onCallSlot.findMany({ where: { active: true } });
  const consultantSlots = allSlots.filter(s => s.role === 'consultant');
  const registrarSlots = allSlots.filter(s => s.role === 'registrar');

  const registrarPatterns = await prisma.onCallPattern.findMany({ where: { role: 'registrar' } });

  const allAssignments = await prisma.slotAssignment.findMany({
    where: {
      effectiveFrom: { lte: to },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: from } }]
    }
  });
  const consultantAssignments = allAssignments.filter(a =>
    consultantSlots.some(s => s.id === a.slotId)
  );
  const registrarAssignments = allAssignments.filter(a =>
    registrarSlots.some(s => s.id === a.slotId)
  );

  const consultantData: SlotBasedData = {
    config: consultantConfig,
    slots: consultantSlots,
    patterns: [],  // Consultants don't use patterns
    assignments: consultantAssignments
  };

  const registrarData: SlotBasedData = {
    config: registrarConfig,
    slots: registrarSlots,
    patterns: registrarPatterns,
    assignments: registrarAssignments
  };

  // Debug logging for troubleshooting
  console.log('=== ROTA GENERATOR DEBUG ===');
  console.log('Registrar setup:');
  console.log('  - Slots:', registrarSlots.length, registrarSlots.map(s => `Slot ${s.position} (id=${s.id})`).join(', '));
  console.log('  - Patterns:', registrarPatterns.length, registrarPatterns.length > 0 ? `(days 1-${Math.max(...registrarPatterns.map(p => p.dayOfCycle))})` : '(using implicit)');
  console.log('  - Assignments:', registrarAssignments.length);
  registrarAssignments.forEach(a => {
    console.log(`    - Slot ${a.slotId} -> Clinician ${a.clinicianId} (${a.effectiveFrom.toISOString().split('T')[0]} to ${a.effectiveTo?.toISOString().split('T')[0] ?? 'ongoing'})`);
  });
  console.log('  - Config start date:', registrarConfig?.startDate?.toISOString().split('T')[0] ?? 'NOT SET');
  console.log('  - Cycle length:', registrarConfig?.cycleLength ?? 'NOT SET');
  console.log('===========================');

  for (const date of dateRange(from, to)) {
    const weekNo = Math.min(5, Math.max(1, weekOfMonth(date)));
    const dayOfWeek = getDayOfWeek(date);
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;

    const leaves = await prisma.leave.findMany({ where: { date } });
    for (const clinician of clinicians) {
      const leave = leaves.find((l) => l.clinicianId === clinician.id);
      const sessions: Session[] = ['AM', 'PM'];

      // Determine on-call clinician using slot-based system
      const isConsultant = clinician.role === 'consultant';
      const oncallClinicianId = pickOncallClinicianSlotBased(
        date,
        clinician.role as 'consultant' | 'registrar',
        isConsultant ? consultantData : registrarData
      );

      for (const session of sessions) {
        const existing = await prisma.rotaEntry.findUnique({
          where: { date_clinicianId_session: { date, clinicianId: clinician.id, session } }
        });
        if (existing && (existing.source === 'manual' || existing.source === 'leave')) {
          continue;
        }
        // leave overrides everything
        if (leave) {
          const leaveMatches = leave.session === 'FULL' || leave.session === session;
          if (leaveMatches) {
            if (!existing) {
              await prisma.rotaEntry.create({
                data: {
                  date,
                  clinicianId: clinician.id,
                  session,
                  source: 'leave',
                  isOncall: false
                }
              });
            } else {
              await prisma.rotaEntry.update({
                where: { id: existing.id },
                data: { source: 'leave', dutyId: null, isOncall: false }
              });
            }
            continue;
          }
        }

        // on-call overrides duty when this clinician is scheduled for on-call
        if (oncallClinicianId === clinician.id) {
          const payload = {
            date,
            clinicianId: clinician.id,
            session,
            source: 'oncall' as RotaSource,
            isOncall: true,
            dutyId: null
          };
          if (existing) {
            await prisma.rotaEntry.update({ where: { id: existing.id }, data: payload });
          } else {
            await prisma.rotaEntry.create({ data: payload });
          }
          continue;
        }

        // Only apply job plan on weekdays (Mon-Fri)
        if (isWeekday) {
          const planKey = `${weekNo}-${dayOfWeek}`;
          const plan = jobPlanByClinician.get(clinician.id)?.get(planKey);
          const dutyId = session === 'AM' ? plan?.amDutyId ?? null : plan?.pmDutyId ?? null;
          if (dutyId || plan) {
            const payload = {
              date,
              clinicianId: clinician.id,
              session,
              dutyId,
              source: 'jobplan' as RotaSource,
              isOncall: false
            };
            if (existing) {
              await prisma.rotaEntry.update({ where: { id: existing.id }, data: payload });
            } else {
              await prisma.rotaEntry.create({ data: payload });
            }
          }
        }
      }
    }
  }
}
