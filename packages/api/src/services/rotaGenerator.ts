import { prisma } from '../prisma.js';
import type { Session, RotaSource } from '../types/enums.js';
import type { Duty } from '@prisma/client';
import { formatDateString, dateRange, weekOfMonth, getDayOfWeek, isWeekday } from '../utils/dateHelpers.js';
import { getOncallClinicianForDate, type SlotBasedData } from './oncallCalculator.js';
import {
  detectConsultantImpact,
  createConsultantCoverageRequests
} from './consultantImpactDetector.js';

// Rest day entry type
interface RestDayEntry {
  date: Date;
  clinicianId: number;
  session: Session;
  dutyId: number | null;  // null = OFF, non-null = SPA duty
  isOff: boolean;
}

// Compute rest days for registrars based on on-call assignments
// Rules:
// - Weekend on-call (Saturday): Friday OFF, Monday OFF, Tuesday OFF
// - Weekday on-call (Mon-Thu): Next day AM = SPA, PM = OFF
// - Friday on-call: No rest day (weekend is rest)
function computeRestDaysForRegistrars(
  from: Date,
  to: Date,
  registrarData: SlotBasedData,
  registrarClinicianIds: number[],
  spaDuty: Duty | null
): RestDayEntry[] {
  const restDays: RestDayEntry[] = [];
  const restDayKey = (date: Date, clinicianId: number, session: Session) =>
    `${formatDateString(date)}-${clinicianId}-${session}`;
  const addedKeys = new Set<string>();

  // Extend date range to check for on-calls that might generate rest days within our range
  // Need to look 3 days before (Tuesday on-call -> generates rest day 1 day before)
  // And 3 days after (Saturday on-call -> generates rest day for Tuesday, 3 days after)
  const extendedFrom = new Date(from);
  extendedFrom.setDate(extendedFrom.getDate() - 3);
  const extendedTo = new Date(to);
  extendedTo.setDate(extendedTo.getDate() + 3);

  for (const date of dateRange(extendedFrom, extendedTo)) {
    const dayOfWeek = getDayOfWeek(date); // 1=Mon, 2=Tue, ..., 5=Fri, 6=Sat, 7=Sun

    for (const clinicianId of registrarClinicianIds) {
      const oncallId = getOncallClinicianForDate(date, 'registrar', registrarData);
      if (oncallId !== clinicianId) continue;

      // This registrar is on-call on this date
      if (dayOfWeek === 6) {
        // Saturday on-call -> Friday OFF, Monday OFF, Tuesday OFF
        const friday = new Date(date);
        friday.setDate(friday.getDate() - 1);
        const monday = new Date(date);
        monday.setDate(monday.getDate() + 2);
        const tuesday = new Date(date);
        tuesday.setDate(tuesday.getDate() + 3);

        for (const restDate of [friday, monday, tuesday]) {
          // Only add if within our actual requested range
          if (restDate >= from && restDate <= to) {
            for (const session of ['AM', 'PM'] as Session[]) {
              const key = restDayKey(restDate, clinicianId, session);
              if (!addedKeys.has(key)) {
                addedKeys.add(key);
                restDays.push({
                  date: new Date(restDate),
                  clinicianId,
                  session,
                  dutyId: null,  // OFF
                  isOff: true
                });
              }
            }
          }
        }
      } else if (dayOfWeek >= 1 && dayOfWeek <= 4) {
        // Mon-Thu on-call -> Next day AM = SPA, PM = OFF
        const nextDay = new Date(date);
        nextDay.setDate(nextDay.getDate() + 1);

        if (nextDay >= from && nextDay <= to) {
          // AM session = SPA duty
          const amKey = restDayKey(nextDay, clinicianId, 'AM');
          if (!addedKeys.has(amKey)) {
            addedKeys.add(amKey);
            restDays.push({
              date: new Date(nextDay),
              clinicianId,
              session: 'AM',
              dutyId: spaDuty?.id ?? null,
              isOff: false  // SPA is not OFF, it's a duty
            });
          }

          // PM session = OFF
          const pmKey = restDayKey(nextDay, clinicianId, 'PM');
          if (!addedKeys.has(pmKey)) {
            addedKeys.add(pmKey);
            restDays.push({
              date: new Date(nextDay),
              clinicianId,
              session: 'PM',
              dutyId: null,
              isOff: true
            });
          }
        }
      }
      // Friday (dayOfWeek === 5) or Sunday (dayOfWeek === 7): No rest day needed
    }
  }

  return restDays;
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

  // ============================================
  // Compute rest days for registrars
  // ============================================
  const spaDuty = await prisma.duty.findFirst({
    where: { name: { contains: 'SPA' }, active: true }
  });
  const registrarClinicianIds = clinicians
    .filter(c => c.role === 'registrar')
    .map(c => c.id);

  const restDays = computeRestDaysForRegistrars(
    from, to, registrarData, registrarClinicianIds, spaDuty
  );

  // Build rest day lookup map: "YYYY-MM-DD-clinicianId-session" -> RestDayEntry
  const restDayLookup = new Map<string, RestDayEntry>();
  for (const restDay of restDays) {
    const key = `${formatDateString(restDay.date)}-${restDay.clinicianId}-${restDay.session}`;
    restDayLookup.set(key, restDay);
  }

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
      const oncallClinicianId = getOncallClinicianForDate(
        date,
        clinician.role as 'consultant' | 'registrar',
        isConsultant ? consultantData : registrarData
      );

      for (const session of sessions) {
        const existing = await prisma.rotaEntry.findUnique({
          where: { date_clinicianId_session: { date, clinicianId: clinician.id, session } }
        });
        if (existing && (existing.source === 'manual' || existing.source === 'leave' || existing.source === 'rest')) {
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

        // Rest days for registrars (from on-call recovery)
        const restKey = `${formatDateString(date)}-${clinician.id}-${session}`;
        const restEntry = restDayLookup.get(restKey);
        if (restEntry && clinician.role === 'registrar') {
          const payload = {
            date,
            clinicianId: clinician.id,
            session,
            source: 'rest' as RotaSource,
            isOncall: false,
            dutyId: restEntry.dutyId  // SPA duty for AM after weekday on-call, null for OFF
          };
          if (existing) {
            await prisma.rotaEntry.update({ where: { id: existing.id }, data: payload });
          } else {
            await prisma.rotaEntry.create({ data: payload });
          }
          continue;
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

  // ============================================
  // Detect consultant on-call impact:
  // Free registrars and create consultant coverage requests
  // This runs AFTER job plan generation so entries exist to be deleted
  // ============================================
  const processedConsultantOncall = new Set<string>();

  for (const date of dateRange(from, to)) {
    // Only process weekdays for on-call impact
    if (!isWeekday(date)) continue;

    const oncallConsultantId = getOncallClinicianForDate(date, 'consultant', consultantData);
    if (oncallConsultantId) {
      const dateStr = formatDateString(date);
      const key = `${dateStr}-${oncallConsultantId}`;

      if (!processedConsultantOncall.has(key)) {
        processedConsultantOncall.add(key);

        // Detect impact for FULL day (consultant on-call is full day)
        const { consultantNeeds } = await detectConsultantImpact(
          oncallConsultantId,
          date,
          'FULL',
          'oncall_conflict'
        );

        if (consultantNeeds.length > 0) {
          await createConsultantCoverageRequests(consultantNeeds);
        }
      }
    }
  }
}
