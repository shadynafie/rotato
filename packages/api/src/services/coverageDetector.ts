import { prisma } from '../prisma.js';
import type { CoverageReason, Session } from '../types/enums.js';

export interface CoverageNeed {
  date: Date;
  session: 'AM' | 'PM';
  consultantId: number;
  dutyId: number;
  reason: CoverageReason;
}

/**
 * Get the week number of the month (1-5) for a given date
 */
function weekOfMonth(date: Date): number {
  const dayOfMonth = date.getDate();
  return Math.min(5, Math.ceil(dayOfMonth / 7));
}

/**
 * Get the day of week (1=Monday, 5=Friday) for a given date
 */
function getDayOfWeek(date: Date): number {
  const day = date.getDay();
  // Convert from 0=Sunday to 1=Monday
  return day === 0 ? 7 : day;
}

/**
 * Check if a date is a weekday (Monday-Friday)
 */
function isWeekday(date: Date): boolean {
  const day = date.getDay();
  return day >= 1 && day <= 5;
}

/**
 * Detect coverage needs for a date range.
 * Finds consultant activities that:
 * 1. Have requiresRegistrar=true on the duty
 * 2. The consultant is on leave for that date/session
 */
export async function detectCoverageNeeds(from: Date, to: Date): Promise<CoverageNeed[]> {
  const needs: CoverageNeed[] = [];

  // Get all consultants
  const consultants = await prisma.clinician.findMany({
    where: { role: 'consultant', active: true }
  });

  // Get all job plans with duties that require registrar
  const jobPlans = await prisma.jobPlanWeek.findMany({
    where: {
      clinician: { role: 'consultant', active: true },
      OR: [
        { amDuty: { requiresRegistrar: true } },
        { pmDuty: { requiresRegistrar: true } }
      ]
    },
    include: {
      clinician: true,
      amDuty: true,
      pmDuty: true
    }
  });

  // Create a lookup map: clinicianId -> weekNo -> dayOfWeek -> { amDutyId, pmDutyId }
  const planLookup = new Map<string, { amDutyId: number | null; pmDutyId: number | null; amRequires: boolean; pmRequires: boolean }>();
  for (const plan of jobPlans) {
    const key = `${plan.clinicianId}-${plan.weekNo}-${plan.dayOfWeek}`;
    planLookup.set(key, {
      amDutyId: plan.amDutyId,
      pmDutyId: plan.pmDutyId,
      amRequires: plan.amDuty?.requiresRegistrar || false,
      pmRequires: plan.pmDuty?.requiresRegistrar || false
    });
  }

  // Get all leaves in the date range for consultants
  const leaves = await prisma.leave.findMany({
    where: {
      date: { gte: from, lte: to },
      clinician: { role: 'consultant', active: true }
    },
    include: { clinician: true }
  });

  // For each leave, check if the consultant has a duty requiring registrar
  for (const leave of leaves) {
    const leaveDate = new Date(leave.date);

    // Skip weekends
    if (!isWeekday(leaveDate)) continue;

    const weekNo = weekOfMonth(leaveDate);
    const dayOfWeek = getDayOfWeek(leaveDate);
    const planKey = `${leave.clinicianId}-${weekNo}-${dayOfWeek}`;
    const plan = planLookup.get(planKey);

    if (!plan) continue;

    // Check AM session
    if ((leave.session === 'AM' || leave.session === 'FULL') && plan.amRequires && plan.amDutyId) {
      needs.push({
        date: leaveDate,
        session: 'AM',
        consultantId: leave.clinicianId,
        dutyId: plan.amDutyId,
        reason: 'leave'
      });
    }

    // Check PM session
    if ((leave.session === 'PM' || leave.session === 'FULL') && plan.pmRequires && plan.pmDutyId) {
      needs.push({
        date: leaveDate,
        session: 'PM',
        consultantId: leave.clinicianId,
        dutyId: plan.pmDutyId,
        reason: 'leave'
      });
    }
  }

  return needs;
}

/**
 * Detect coverage needs for a specific clinician in a date range.
 * Used when creating leave for a consultant.
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

  // Only consultants can have coverage needs
  if (!clinician || clinician.role !== 'consultant') {
    return needs;
  }

  // Get job plans for this clinician with duties requiring registrar
  const jobPlans = await prisma.jobPlanWeek.findMany({
    where: {
      clinicianId,
      OR: [
        { amDuty: { requiresRegistrar: true } },
        { pmDuty: { requiresRegistrar: true } }
      ]
    },
    include: {
      amDuty: true,
      pmDuty: true
    }
  });

  // Create lookup
  const planLookup = new Map<string, { amDutyId: number | null; pmDutyId: number | null; amRequires: boolean; pmRequires: boolean }>();
  for (const plan of jobPlans) {
    const key = `${plan.weekNo}-${plan.dayOfWeek}`;
    planLookup.set(key, {
      amDutyId: plan.amDutyId,
      pmDutyId: plan.pmDutyId,
      amRequires: plan.amDuty?.requiresRegistrar || false,
      pmRequires: plan.pmDuty?.requiresRegistrar || false
    });
  }

  // Get leaves for this clinician in the date range
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

    if ((leave.session === 'AM' || leave.session === 'FULL') && plan.amRequires && plan.amDutyId) {
      needs.push({
        date: leaveDate,
        session: 'AM',
        consultantId: clinicianId,
        dutyId: plan.amDutyId,
        reason: 'leave'
      });
    }

    if ((leave.session === 'PM' || leave.session === 'FULL') && plan.pmRequires && plan.pmDutyId) {
      needs.push({
        date: leaveDate,
        session: 'PM',
        consultantId: clinicianId,
        dutyId: plan.pmDutyId,
        reason: 'leave'
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
          status: 'pending'
        }
      });
      created++;
    }
  }

  return created;
}

/**
 * Cancel coverage requests for a specific leave entry.
 * Called when a leave is deleted.
 */
export async function cancelCoverageRequestsForLeave(
  clinicianId: number,
  date: Date,
  session: Session
): Promise<number> {
  const sessions = session === 'FULL' ? ['AM', 'PM'] : [session];

  const result = await prisma.coverageRequest.updateMany({
    where: {
      consultantId: clinicianId,
      date,
      session: { in: sessions },
      reason: 'leave',
      status: 'pending' // Only cancel pending requests
    },
    data: {
      status: 'cancelled'
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
