import { prisma } from '../prisma.js';
import type { CoverageReason } from '../types/enums.js';
import { weekOfMonth, getDayOfWeek, isWeekday, formatDateString } from '../utils/dateHelpers.js';
import { logAudit } from '../utils/audit.js';

export interface ConsultantCoverageNeed {
  date: Date;
  session: 'AM' | 'PM';
  dutyId: number;
  absentConsultantId: number;
  reason: CoverageReason;
}

export interface FreedRegistrar {
  date: Date;
  session: 'AM' | 'PM';
  registrarId: number;
  registrarName: string;
  dutyId: number;
  dutyName: string;
}

/**
 * Detect impact when a consultant is unavailable (on leave or on-call).
 *
 * When a consultant is unavailable:
 * 1. Find registrars who have duties supporting this consultant
 * 2. Delete their RotaEntry (free them)
 * 3. Return coverage needs for consultant's duties
 *
 * This handles both:
 * - Job plan entries with supportingClinicianId pointing to this consultant
 * - Manual RotaEntry records with supportingClinicianId pointing to this consultant
 */
export async function detectConsultantImpact(
  consultantId: number,
  date: Date,
  session: 'AM' | 'PM' | 'FULL',
  reason: CoverageReason
): Promise<{
  consultantNeeds: ConsultantCoverageNeed[];
  freedRegistrars: FreedRegistrar[];
}> {
  const consultantNeeds: ConsultantCoverageNeed[] = [];
  const freedRegistrars: FreedRegistrar[] = [];
  const sessions = session === 'FULL' ? ['AM', 'PM'] as const : [session] as const;

  // Verify this is a consultant
  const consultant = await prisma.clinician.findUnique({
    where: { id: consultantId }
  });

  if (!consultant || consultant.role !== 'consultant') {
    return { consultantNeeds, freedRegistrars };
  }

  // Get the consultant's job plan for this date to find their duties
  const dateObj = new Date(date);
  dateObj.setHours(0, 0, 0, 0);

  if (!isWeekday(dateObj)) {
    return { consultantNeeds, freedRegistrars };
  }

  const weekNo = weekOfMonth(dateObj);
  const dayOfWeek = getDayOfWeek(dateObj);

  // Get consultant's job plan for this specific day
  const consultantJobPlan = await prisma.jobPlanWeek.findUnique({
    where: {
      clinicianId_weekNo_dayOfWeek: {
        clinicianId: consultantId,
        weekNo,
        dayOfWeek
      }
    },
    include: {
      amDuty: true,
      pmDuty: true
    }
  });

  // Also check for manual entries the consultant might have
  const consultantManualEntries = await prisma.rotaEntry.findMany({
    where: {
      clinicianId: consultantId,
      date: dateObj,
      source: 'manual',
      dutyId: { not: null }
    },
    include: {
      duty: true
    }
  });

  const dateStr = formatDateString(dateObj);

  for (const sess of sessions) {
    // Find the consultant's duty for this session
    let dutyId: number | null = null;

    // Check manual entries first (they take precedence)
    const manualEntry = consultantManualEntries.find(e =>
      e.session === sess || e.session === 'FULL'
    );
    if (manualEntry && manualEntry.dutyId) {
      dutyId = manualEntry.dutyId;
    } else if (consultantJobPlan) {
      dutyId = sess === 'AM' ? consultantJobPlan.amDutyId : consultantJobPlan.pmDutyId;
    }

    // Only create coverage request if consultant has a duty that requires coverage
    if (dutyId) {
      const duty = await prisma.duty.findUnique({ where: { id: dutyId } });
      if (duty?.requiresCoverage !== false) {
        consultantNeeds.push({
          date: dateObj,
          session: sess,
          dutyId,
          absentConsultantId: consultantId,
          reason
        });
      }
    }

    // Find registrars supporting this consultant (from job plans)
    const registrarJobPlans = await prisma.jobPlanWeek.findMany({
      where: {
        weekNo,
        dayOfWeek,
        clinician: { role: 'registrar', active: true },
        OR: sess === 'AM'
          ? [{ amSupportingClinicianId: consultantId }]
          : [{ pmSupportingClinicianId: consultantId }]
      },
      include: {
        clinician: true,
        amDuty: true,
        pmDuty: true
      }
    });

    // Find registrars supporting this consultant (from manual entries)
    const registrarManualEntries = await prisma.rotaEntry.findMany({
      where: {
        date: dateObj,
        session: sess,
        source: 'manual',
        supportingClinicianId: consultantId,
        clinician: { role: 'registrar', active: true }
      },
      include: {
        clinician: true,
        duty: true
      }
    });

    // Track registrars we've already processed to avoid duplicates
    const processedRegistrars = new Set<number>();

    // Process manual entries first (they take precedence)
    for (const entry of registrarManualEntries) {
      if (processedRegistrars.has(entry.clinicianId)) continue;
      processedRegistrars.add(entry.clinicianId);

      if (entry.duty) {
        freedRegistrars.push({
          date: dateObj,
          session: sess,
          registrarId: entry.clinicianId,
          registrarName: entry.clinician.name,
          dutyId: entry.duty.id,
          dutyName: entry.duty.name
        });
      }

      // Delete the registrar's RotaEntry (free them)
      await prisma.rotaEntry.delete({
        where: { id: entry.id }
      });

      // Log audit for the deletion
      await logAudit({
        action: 'delete',
        entity: 'rotaEntry',
        entityId: entry.id,
        before: entry
      });
    }

    // Process job plan entries
    for (const plan of registrarJobPlans) {
      if (processedRegistrars.has(plan.clinicianId)) continue;
      processedRegistrars.add(plan.clinicianId);

      const registrarDuty = sess === 'AM' ? plan.amDuty : plan.pmDuty;
      if (registrarDuty) {
        freedRegistrars.push({
          date: dateObj,
          session: sess,
          registrarId: plan.clinicianId,
          registrarName: plan.clinician.name,
          dutyId: registrarDuty.id,
          dutyName: registrarDuty.name
        });
      }

      // Find and delete any existing RotaEntry for this registrar
      const entriesToDelete = await prisma.rotaEntry.findMany({
        where: {
          clinicianId: plan.clinicianId,
          date: dateObj,
          session: sess,
          source: { in: ['jobplan', 'oncall'] }  // Don't delete manual, leave, or rest entries
        }
      });

      if (entriesToDelete.length > 0) {
        await prisma.rotaEntry.deleteMany({
          where: {
            id: { in: entriesToDelete.map(e => e.id) }
          }
        });

        // Log audit for each deletion
        for (const entry of entriesToDelete) {
          await logAudit({
            action: 'delete',
            entity: 'rotaEntry',
            entityId: entry.id,
            before: entry
          });
        }
      }
    }
  }

  return { consultantNeeds, freedRegistrars };
}

/**
 * Detect consultant impact for a date range.
 * Used when a consultant takes leave for multiple days.
 */
export async function detectConsultantImpactForRange(
  consultantId: number,
  from: Date,
  to: Date,
  session: 'AM' | 'PM' | 'FULL',
  reason: CoverageReason
): Promise<{
  consultantNeeds: ConsultantCoverageNeed[];
  freedRegistrars: FreedRegistrar[];
}> {
  const allNeeds: ConsultantCoverageNeed[] = [];
  const allFreed: FreedRegistrar[] = [];

  const current = new Date(from);
  current.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);

  while (current <= end) {
    const { consultantNeeds, freedRegistrars } = await detectConsultantImpact(
      consultantId,
      new Date(current),
      session,
      reason
    );
    allNeeds.push(...consultantNeeds);
    allFreed.push(...freedRegistrars);
    current.setDate(current.getDate() + 1);
  }

  return {
    consultantNeeds: allNeeds,
    freedRegistrars: allFreed
  };
}

/**
 * Create consultant coverage requests for detected needs.
 * Skips if a request already exists.
 */
export async function createConsultantCoverageRequests(
  needs: ConsultantCoverageNeed[]
): Promise<number> {
  let created = 0;

  for (const need of needs) {
    // Check if request already exists
    const existing = await prisma.coverageRequest.findFirst({
      where: {
        date: need.date,
        session: need.session,
        dutyId: need.dutyId,
        absentConsultantId: need.absentConsultantId,
        type: 'consultant'
      }
    });

    if (!existing) {
      await prisma.coverageRequest.create({
        data: {
          date: need.date,
          session: need.session,
          type: 'consultant',
          consultantId: null,  // Not applicable for consultant coverage
          dutyId: need.dutyId,
          reason: need.reason,
          status: 'pending',
          absentConsultantId: need.absentConsultantId,
          absentRegistrarId: null
        }
      });
      created++;
    }
  }

  return created;
}

/**
 * Cancel consultant coverage requests when leave is deleted.
 */
export async function cancelConsultantCoverageRequestsForLeave(
  consultantId: number,
  date: Date,
  session: 'AM' | 'PM' | 'FULL'
): Promise<number> {
  const sessions = session === 'FULL' ? ['AM', 'PM'] : [session];

  const dateObj = new Date(date);
  dateObj.setHours(0, 0, 0, 0);

  const result = await prisma.coverageRequest.deleteMany({
    where: {
      absentConsultantId: consultantId,
      date: dateObj,
      session: { in: sessions },
      type: 'consultant',
      reason: 'leave',
      status: 'pending'
    }
  });

  return result.count;
}

/**
 * Restore registrar entries when consultant leave is cancelled.
 * This regenerates the registrar's job plan entry for the affected dates.
 */
export async function restoreRegistrarEntriesForConsultant(
  consultantId: number,
  date: Date,
  session: 'AM' | 'PM' | 'FULL'
): Promise<number> {
  const sessions = session === 'FULL' ? ['AM', 'PM'] as const : [session] as const;
  let restored = 0;

  const dateObj = new Date(date);
  dateObj.setHours(0, 0, 0, 0);

  if (!isWeekday(dateObj)) {
    return 0;
  }

  const weekNo = weekOfMonth(dateObj);
  const dayOfWeek = getDayOfWeek(dateObj);

  for (const sess of sessions) {
    // Find registrars who should be supporting this consultant
    const registrarJobPlans = await prisma.jobPlanWeek.findMany({
      where: {
        weekNo,
        dayOfWeek,
        clinician: { role: 'registrar', active: true },
        OR: sess === 'AM'
          ? [{ amSupportingClinicianId: consultantId }]
          : [{ pmSupportingClinicianId: consultantId }]
      },
      include: {
        clinician: true,
        amDuty: true,
        pmDuty: true
      }
    });

    for (const plan of registrarJobPlans) {
      const dutyId = sess === 'AM' ? plan.amDutyId : plan.pmDutyId;
      const supportingClinicianId = sess === 'AM'
        ? plan.amSupportingClinicianId
        : plan.pmSupportingClinicianId;

      // Check if entry already exists
      const existing = await prisma.rotaEntry.findUnique({
        where: {
          date_clinicianId_session: {
            date: dateObj,
            clinicianId: plan.clinicianId,
            session: sess
          }
        }
      });

      if (!existing) {
        // Create the entry from job plan
        await prisma.rotaEntry.create({
          data: {
            date: dateObj,
            clinicianId: plan.clinicianId,
            session: sess,
            dutyId,
            supportingClinicianId,
            source: 'jobplan',
            isOncall: false
          }
        });
        restored++;
      }
    }
  }

  return restored;
}
