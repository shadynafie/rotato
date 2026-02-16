import { prisma } from '../prisma.js';
import type { CoverageReason, Session } from '../types/enums.js';
import { weekOfMonth, getDayOfWeek, isWeekday } from '../utils/dateHelpers.js';

export interface CoverageNeed {
  date: Date;
  session: 'AM' | 'PM';
  consultantId: number;
  dutyId: number;
  reason: CoverageReason;
  // The registrar who is on leave (for tracking purposes)
  absentRegistrarId?: number;
}

/**
 * Detect coverage needs for a date range.
 *
 * Coverage is triggered when a REGISTRAR is on leave and they were:
 * 1. Assigned to support a consultant for a duty (via supportingClinicianId)
 * 2. That duty requires registrar support
 *
 * When a consultant is on leave, no coverage is needed because:
 * - Clinic: registrar can continue independently
 * - Theatre: list is cancelled, registrar is freed
 */
export async function detectCoverageNeeds(from: Date, to: Date): Promise<CoverageNeed[]> {
  const needs: CoverageNeed[] = [];

  // Get registrar job plans where they support a consultant
  const registrarJobPlans = await prisma.jobPlanWeek.findMany({
    where: {
      clinician: { role: 'registrar', active: true },
      OR: [
        { amSupportingClinicianId: { not: null } },
        { pmSupportingClinicianId: { not: null } }
      ]
    },
    include: {
      clinician: true,
      amDuty: true,
      pmDuty: true
    }
  });

  // Create a lookup: registrarId -> weekNo -> dayOfWeek -> job plan entry
  const planLookup = new Map<string, {
    amDutyId: number | null;
    pmDutyId: number | null;
    amSupportingClinicianId: number | null;
    pmSupportingClinicianId: number | null;
    amRequiresRegistrar: boolean;
    pmRequiresRegistrar: boolean;
  }>();

  for (const plan of registrarJobPlans) {
    const key = `${plan.clinicianId}-${plan.weekNo}-${plan.dayOfWeek}`;
    planLookup.set(key, {
      amDutyId: plan.amDutyId,
      pmDutyId: plan.pmDutyId,
      amSupportingClinicianId: plan.amSupportingClinicianId,
      pmSupportingClinicianId: plan.pmSupportingClinicianId,
      amRequiresRegistrar: plan.amDuty?.requiresRegistrar || false,
      pmRequiresRegistrar: plan.pmDuty?.requiresRegistrar || false
    });
  }

  // Get all leaves in the date range for REGISTRARS
  const leaves = await prisma.leave.findMany({
    where: {
      date: { gte: from, lte: to },
      clinician: { role: 'registrar', active: true }
    },
    include: { clinician: true }
  });

  // For each registrar leave, check if they were supporting a consultant
  for (const leave of leaves) {
    const leaveDate = new Date(leave.date);

    // Skip weekends
    if (!isWeekday(leaveDate)) continue;

    const weekNo = weekOfMonth(leaveDate);
    const dayOfWeek = getDayOfWeek(leaveDate);
    const planKey = `${leave.clinicianId}-${weekNo}-${dayOfWeek}`;
    const plan = planLookup.get(planKey);

    if (!plan) continue;

    // Check AM session - if registrar was supporting a consultant
    if ((leave.session === 'AM' || leave.session === 'FULL') &&
        plan.amSupportingClinicianId &&
        plan.amDutyId) {
      needs.push({
        date: leaveDate,
        session: 'AM',
        consultantId: plan.amSupportingClinicianId,
        dutyId: plan.amDutyId,
        reason: 'leave',
        absentRegistrarId: leave.clinicianId
      });
    }

    // Check PM session
    if ((leave.session === 'PM' || leave.session === 'FULL') &&
        plan.pmSupportingClinicianId &&
        plan.pmDutyId) {
      needs.push({
        date: leaveDate,
        session: 'PM',
        consultantId: plan.pmSupportingClinicianId,
        dutyId: plan.pmDutyId,
        reason: 'leave',
        absentRegistrarId: leave.clinicianId
      });
    }
  }

  return needs;
}

/**
 * Detect coverage needs for a specific clinician in a date range.
 * Now handles registrars - finds duties they were supporting.
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

  // Get job plans for this registrar where they support a consultant
  const jobPlans = await prisma.jobPlanWeek.findMany({
    where: {
      clinicianId,
      OR: [
        { amSupportingClinicianId: { not: null } },
        { pmSupportingClinicianId: { not: null } }
      ]
    },
    include: {
      amDuty: true,
      pmDuty: true
    }
  });

  // Create lookup
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

  // Get leaves for this registrar in the date range
  const leaves = await prisma.leave.findMany({
    where: {
      clinicianId,
      date: { gte: from, lte: to }
    }
  });

  for (const leave of leaves) {
    const leaveDate = new Date(leave.date);

    if (!isWeekday(leaveDate)) continue;

    const weekNo = weekOfMonth(leaveDate);
    const dayOfWeek = getDayOfWeek(leaveDate);
    const planKey = `${weekNo}-${dayOfWeek}`;
    const plan = planLookup.get(planKey);

    if (!plan) continue;

    // AM session coverage
    if ((leave.session === 'AM' || leave.session === 'FULL') &&
        plan.amSupportingClinicianId &&
        plan.amDutyId) {
      needs.push({
        date: leaveDate,
        session: 'AM',
        consultantId: plan.amSupportingClinicianId,
        dutyId: plan.amDutyId,
        reason: 'leave',
        absentRegistrarId: clinicianId
      });
    }

    // PM session coverage
    if ((leave.session === 'PM' || leave.session === 'FULL') &&
        plan.pmSupportingClinicianId &&
        plan.pmDutyId) {
      needs.push({
        date: leaveDate,
        session: 'PM',
        consultantId: plan.pmSupportingClinicianId,
        dutyId: plan.pmDutyId,
        reason: 'leave',
        absentRegistrarId: clinicianId
      });
    }
  }

  return needs;
}

/**
 * Create coverage requests for detected needs.
 * Skips if a request already exists for the same date/session/consultant/duty.
 */
export async function createCoverageRequests(needs: CoverageNeed[]): Promise<number> {
  let created = 0;

  for (const need of needs) {
    // Check if request already exists
    const existing = await prisma.coverageRequest.findUnique({
      where: {
        date_session_consultantId_dutyId: {
          date: need.date,
          session: need.session,
          consultantId: need.consultantId,
          dutyId: need.dutyId
        }
      }
    });

    if (!existing) {
      await prisma.coverageRequest.create({
        data: {
          date: need.date,
          session: need.session,
          consultantId: need.consultantId,
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
