import { prisma } from '../prisma.js';
import type { Session, RotaSource } from '../types/enums.js';

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
      const oncallClinicianId = pickOncallSlot(
        date,
        clinician.role as 'consultant' | 'registrar',
        clinician.role === 'consultant' ? consultantCycle : registrarCycle
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
