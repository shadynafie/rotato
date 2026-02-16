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

// DEPRECATED: Old on-call slot picker - keeping for backwards compatibility during migration
function pickOncallSlot(
  date: Date,
  role: 'consultant' | 'registrar',
  cycle: { cycleLength: number; clinicianId: number; position: number; startDate: Date | null }[]
) {
  if (!cycle.length) return null;
  const anchor = cycle[0].startDate ?? new Date('2024-01-01');
  const unitDays = role === 'consultant' ? 7 : 1; // consultants rotate weekly, registrars daily
  const diffUnits = Math.floor((date.getTime() - anchor.getTime()) / (1000 * 60 * 60 * 24 * unitDays));
  const length = cycle[0].cycleLength;
  const idx = ((diffUnits % length) + length) % length; // handle negatives
  const slot = cycle.find((s) => s.position === idx + 1);
  return slot?.clinicianId ?? null;
}

// NEW: Slot-based on-call clinician picker
interface SlotBasedData {
  config: OnCallConfig | null;
  slots: OnCallSlot[];
  patterns: OnCallPattern[];  // Only for registrars
  assignments: SlotAssignment[];
}

function pickOncallClinicianSlotBased(
  date: Date,
  role: 'consultant' | 'registrar',
  data: SlotBasedData
): number | null {
  const { config, slots, patterns, assignments } = data;

  if (!config || slots.length === 0) return null;

  // Calculate days since start date
  const daysSinceStart = Math.floor(
    (date.getTime() - config.startDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  let slotId: number;

  if (role === 'consultant') {
    // Consultants: week N = slot with position N
    const weeksSinceStart = Math.floor(daysSinceStart / 7);
    const weekOfCycle = ((weeksSinceStart % config.cycleLength) + config.cycleLength) % config.cycleLength;
    const position = weekOfCycle + 1; // 1-indexed
    const slot = slots.find(s => s.position === position);
    if (!slot) return null;
    slotId = slot.id;
  } else {
    // Registrars: look up explicit pattern
    const dayOfCycle = ((daysSinceStart % config.cycleLength) + config.cycleLength) % config.cycleLength + 1;
    const pattern = patterns.find(p => p.dayOfCycle === dayOfCycle);
    if (!pattern) return null;
    slotId = pattern.slotId;
  }

  // Find active assignment for this slot on this date
  const assignment = assignments.find(a =>
    a.slotId === slotId &&
    a.effectiveFrom <= date &&
    (a.effectiveTo === null || a.effectiveTo >= date)
  );

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

  // Check if slot-based system is set up PER ROLE
  // Consultants: use slot-based if consultant slots exist (implicit pattern: week N = slot N)
  // Registrars: use slot-based only if registrar slots AND patterns exist (explicit pattern required)
  const useSlotBasedConsultants = consultantSlots.length > 0 && consultantConfig !== null;
  const useSlotBasedRegistrars = registrarSlots.length > 0 && registrarPatterns.length > 0 && registrarConfig !== null;

  // DEPRECATED: Old system fallback (used when slot-based not configured for a role)
  const cycles = await prisma.oncallCycle.findMany();
  const consultantCycle = cycles.filter((c) => c.role === 'consultant');
  const registrarCycle = cycles.filter((c) => c.role === 'registrar');

  for (const date of dateRange(from, to)) {
    const weekNo = Math.min(5, Math.max(1, weekOfMonth(date)));
    const dayOfWeek = getDayOfWeek(date);
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;

    const leaves = await prisma.leave.findMany({ where: { date } });
    for (const clinician of clinicians) {
      const leave = leaves.find((l) => l.clinicianId === clinician.id);
      const sessions: Session[] = ['AM', 'PM'];

      // Determine on-call clinician using slot-based or old system (per-role decision)
      let oncallClinicianId: number | null;
      const isConsultant = clinician.role === 'consultant';
      const useSlotBased = isConsultant ? useSlotBasedConsultants : useSlotBasedRegistrars;

      if (useSlotBased) {
        // NEW: Use slot-based system
        oncallClinicianId = pickOncallClinicianSlotBased(
          date,
          clinician.role as 'consultant' | 'registrar',
          isConsultant ? consultantData : registrarData
        );
      } else {
        // DEPRECATED: Fall back to old system
        oncallClinicianId = pickOncallSlot(
          date,
          clinician.role as 'consultant' | 'registrar',
          isConsultant ? consultantCycle : registrarCycle
        );
      }

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
