import { prisma } from '../prisma.js';
import type { CoverageReason, Session } from '../types/enums.js';
import { weekOfMonth, getDayOfWeek, isWeekday } from '../utils/dateHelpers.js';

export interface CoverageNeed {
  date: Date;
  session: 'AM' | 'PM';
  consultantId: number | null;  // null for independent registrar duties
  dutyId: number;
  reason: CoverageReason;
  // The registrar who is on leave (for tracking purposes)
  absentRegistrarId?: number;
}

/**
 * Detect coverage needs for a date range.
 *
 * Coverage is triggered when a REGISTRAR is on leave and they have:
 * 1. A job plan entry with a duty (with or without supportingClinicianId)
 * 2. A manual RotaEntry with a duty (with or without supportingClinicianId)
 *
 * Two types of coverage needs:
 * - Consultant-supporting: registrar was supporting a consultant's clinic
 * - Independent: registrar had an independent duty (e.g., TULA)
 *
 * When a consultant is on leave, no coverage is needed because:
 * - Clinic: registrar can continue independently
 * - Theatre: list is cancelled, registrar is freed
 */
export async function detectCoverageNeeds(from: Date, to: Date): Promise<CoverageNeed[]> {
  // Use the per-clinician detection for each registrar with leave
  const leaves = await prisma.leave.findMany({
    where: {
      date: { gte: from, lte: to },
      clinician: { role: 'registrar', active: true }
    },
    select: { clinicianId: true }
  });

  // Get unique clinician IDs
  const clinicianIds = [...new Set(leaves.map(l => l.clinicianId))];

  // Detect needs for each clinician
  const allNeeds: CoverageNeed[] = [];
  for (const clinicianId of clinicianIds) {
    const clinicianNeeds = await detectCoverageNeedsForClinician(clinicianId, from, to);
    allNeeds.push(...clinicianNeeds);
  }

  return allNeeds;
}

/**
 * Detect coverage needs for a specific clinician in a date range.
 * Now handles registrars - finds duties from BOTH job plans AND manual entries.
 *
 * Coverage is created for:
 * 1. Job plan entries with supportingClinicianId (consultant-supporting duty)
 * 2. Manual RotaEntry records with supportingClinicianId (consultant-supporting duty)
 * 3. Manual RotaEntry records with dutyId but no supportingClinicianId (independent duty)
 */
export async function detectCoverageNeedsForClinician(
  clinicianId: number,
  from: Date,
  to: Date
): Promise<CoverageNeed[]> {
  const needs: CoverageNeed[] = [];

  // Get the clinician
  const clinician = await prisma.clinician.findUnique({
    where: { id: clinicianId }
  });

  // Only registrars trigger coverage needs (when they go on leave)
  if (!clinician || clinician.role !== 'registrar') {
    return needs;
  }

  // Get job plans for this registrar (with duties assigned)
  const jobPlans = await prisma.jobPlanWeek.findMany({
    where: {
      clinicianId,
      OR: [
        { amDutyId: { not: null } },
        { pmDutyId: { not: null } }
      ]
    },
    include: {
      amDuty: true,
      pmDuty: true
    }
  });

  // Create job plan lookup
  const planLookup = new Map<string, {
    amDutyId: number | null;
    pmDutyId: number | null;
    amSupportingClinicianId: number | null;
    pmSupportingClinicianId: number | null;
  }>();

  for (const plan of jobPlans) {
    const key = `${plan.weekNo}-${plan.dayOfWeek}`;
    planLookup.set(key, {
      amDutyId: plan.amDutyId,
      pmDutyId: plan.pmDutyId,
      amSupportingClinicianId: plan.amSupportingClinicianId,
      pmSupportingClinicianId: plan.pmSupportingClinicianId
    });
  }

  // Get manual RotaEntry records for this registrar in the date range
  const manualEntries = await prisma.rotaEntry.findMany({
    where: {
      clinicianId,
      date: { gte: from, lte: to },
      source: 'manual',
      dutyId: { not: null }
    }
  });

  // Create manual entry lookup: dateStr-session -> entry
  const manualLookup = new Map<string, {
    dutyId: number;
    supportingClinicianId: number | null;
  }>();

  for (const entry of manualEntries) {
    const dateStr = new Date(entry.date).toISOString().split('T')[0];
    // Handle FULL session as both AM and PM
    if (entry.session === 'FULL') {
      manualLookup.set(`${dateStr}-AM`, {
        dutyId: entry.dutyId!,
        supportingClinicianId: entry.supportingClinicianId
      });
      manualLookup.set(`${dateStr}-PM`, {
        dutyId: entry.dutyId!,
        supportingClinicianId: entry.supportingClinicianId
      });
    } else {
      manualLookup.set(`${dateStr}-${entry.session}`, {
        dutyId: entry.dutyId!,
        supportingClinicianId: entry.supportingClinicianId
      });
    }
  }

  // Get leaves for this registrar in the date range
  const leaves = await prisma.leave.findMany({
    where: {
      clinicianId,
      date: { gte: from, lte: to }
    }
  });

  // Track which needs we've already added to avoid duplicates
  const addedNeeds = new Set<string>();

  for (const leave of leaves) {
    const leaveDate = new Date(leave.date);

    if (!isWeekday(leaveDate)) continue;

    const dateStr = leaveDate.toISOString().split('T')[0];
    const weekNo = weekOfMonth(leaveDate);
    const dayOfWeek = getDayOfWeek(leaveDate);
    const planKey = `${weekNo}-${dayOfWeek}`;
    const plan = planLookup.get(planKey);

    // Process AM session
    if (leave.session === 'AM' || leave.session === 'FULL') {
      const manualAm = manualLookup.get(`${dateStr}-AM`);

      // Priority: Manual entry takes precedence over job plan
      if (manualAm) {
        const needKey = `${dateStr}-AM-${manualAm.dutyId}-${manualAm.supportingClinicianId || 'independent'}`;
        if (!addedNeeds.has(needKey)) {
          needs.push({
            date: leaveDate,
            session: 'AM',
            consultantId: manualAm.supportingClinicianId,  // null for independent duties
            dutyId: manualAm.dutyId,
            reason: 'leave',
            absentRegistrarId: clinicianId
          });
          addedNeeds.add(needKey);
        }
      } else if (plan?.amDutyId) {
        // Fall back to job plan
        const needKey = `${dateStr}-AM-${plan.amDutyId}-${plan.amSupportingClinicianId || 'independent'}`;
        if (!addedNeeds.has(needKey)) {
          needs.push({
            date: leaveDate,
            session: 'AM',
            consultantId: plan.amSupportingClinicianId,  // null for independent duties
            dutyId: plan.amDutyId,
            reason: 'leave',
            absentRegistrarId: clinicianId
          });
          addedNeeds.add(needKey);
        }
      }
    }

    // Process PM session
    if (leave.session === 'PM' || leave.session === 'FULL') {
      const manualPm = manualLookup.get(`${dateStr}-PM`);

      // Priority: Manual entry takes precedence over job plan
      if (manualPm) {
        const needKey = `${dateStr}-PM-${manualPm.dutyId}-${manualPm.supportingClinicianId || 'independent'}`;
        if (!addedNeeds.has(needKey)) {
          needs.push({
            date: leaveDate,
            session: 'PM',
            consultantId: manualPm.supportingClinicianId,  // null for independent duties
            dutyId: manualPm.dutyId,
            reason: 'leave',
            absentRegistrarId: clinicianId
          });
          addedNeeds.add(needKey);
        }
      } else if (plan?.pmDutyId) {
        // Fall back to job plan
        const needKey = `${dateStr}-PM-${plan.pmDutyId}-${plan.pmSupportingClinicianId || 'independent'}`;
        if (!addedNeeds.has(needKey)) {
          needs.push({
            date: leaveDate,
            session: 'PM',
            consultantId: plan.pmSupportingClinicianId,  // null for independent duties
            dutyId: plan.pmDutyId,
            reason: 'leave',
            absentRegistrarId: clinicianId
          });
          addedNeeds.add(needKey);
        }
      }
    }
  }

  return needs;
}

/**
 * Create coverage requests for detected needs.
 * Skips if a request already exists for the same date/session/duty/absentRegistrar.
 */
export async function createCoverageRequests(needs: CoverageNeed[]): Promise<number> {
  let created = 0;

  for (const need of needs) {
    // Check if request already exists
    const existing = await prisma.coverageRequest.findFirst({
      where: {
        date: need.date,
        session: need.session,
        dutyId: need.dutyId,
        absentRegistrarId: need.absentRegistrarId ?? null
      }
    });

    if (!existing) {
      await prisma.coverageRequest.create({
        data: {
          date: need.date,
          session: need.session,
          consultantId: need.consultantId,  // can be null for independent duties
          dutyId: need.dutyId,
          reason: need.reason,
          status: 'pending',
          absentRegistrarId: need.absentRegistrarId ?? null
        }
      });
      created++;
    }
  }

  return created;
}

/**
 * Delete coverage requests for a specific leave entry.
 * Called when a leave is deleted.
 * Uses absentRegistrarId for direct lookup.
 */
export async function cancelCoverageRequestsForLeave(
  clinicianId: number,
  date: Date,
  session: Session
): Promise<number> {
  const sessions = session === 'FULL' ? ['AM', 'PM'] : [session];

  // Normalize the date to start of day for consistent comparison
  const dateObj = new Date(date);
  dateObj.setHours(0, 0, 0, 0);

  const result = await prisma.coverageRequest.deleteMany({
    where: {
      absentRegistrarId: clinicianId,
      date: dateObj,
      session: { in: sessions },
      reason: 'leave',
      status: 'pending'
    }
  });

  return result.count;
}

/**
 * Get pending coverage requests count
 */
export async function getPendingCoverageCount(): Promise<number> {
  return prisma.coverageRequest.count({
    where: { status: 'pending' }
  });
}
