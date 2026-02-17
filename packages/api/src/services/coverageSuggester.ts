import { prisma } from '../prisma.js';
import { formatDateString } from '../utils/dateHelpers.js';
import { computeSchedule } from './scheduleComputer.js';

type Session = 'AM' | 'PM';

type UnavailabilityReason = 'leave' | 'rest_day' | 'on_call' | 'already_assigned';

interface SuggestedRegistrar {
  clinicianId: number;
  clinicianName: string;
  grade: string | null;
  score: number;
  reasons: string[];
  workloadCount: number;
  lastAssignedDate: string | null;
}

interface UnavailableRegistrar {
  clinicianId: number;
  clinicianName: string;
  grade: string | null;
  unavailabilityReason: UnavailabilityReason;
  unavailabilityLabel: string;
}

interface SuggestionResult {
  available: SuggestedRegistrar[];
  unavailable: UnavailableRegistrar[];
}

interface SuggestionRequest {
  date: Date;
  session: Session;
  excludeClinicianIds?: number[];
}

const unavailabilityLabels: Record<UnavailabilityReason, string> = {
  leave: 'On Leave',
  rest_day: 'Rest Day',
  on_call: 'On-Call',
  already_assigned: 'Already Assigned'
};

/**
 * Get smart suggestions for registrar coverage assignment.
 *
 * Scoring (0-100 scale):
 * - Workload: 0-50 points (fewer assignments in last 30 days = higher)
 * - Recency: 0-30 points (longer since last assignment = higher)
 * - First-timer bonus: +20 points (never assigned before)
 *
 * Also returns unavailable registrars with reasons.
 */
export async function getSuggestedRegistrars(
  request: SuggestionRequest
): Promise<SuggestionResult> {
  const { date, session, excludeClinicianIds = [] } = request;
  const dateStr = formatDateString(date);

  // Get date boundaries for workload calculation (last 30 days)
  const thirtyDaysAgo = new Date(date);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Fetch all active registrars
  const registrars = await prisma.clinician.findMany({
    where: {
      role: 'registrar',
      active: true,
      id: { notIn: excludeClinicianIds }
    }
  });

  if (registrars.length === 0) {
    return { available: [], unavailable: [] };
  }

  const registrarIds = registrars.map(r => r.id);

  // Use computeSchedule to check rest days and on-call
  const schedule = await computeSchedule(date, date);
  const registrarSchedule = new Map<number, { isOnCall: boolean; isRest: boolean; isLeave: boolean }>();

  for (const entry of schedule) {
    if (entry.clinicianRole !== 'registrar') continue;
    // Check if this entry applies to the requested session (or is FULL day)
    const entrySession = entry.session as string;
    if (entrySession !== session && entrySession !== 'FULL') continue;

    const existing = registrarSchedule.get(entry.clinicianId) || { isOnCall: false, isRest: false, isLeave: false };

    if (entry.isOncall) existing.isOnCall = true;
    if (entry.isRest || entry.isRestOff) existing.isRest = true;
    if (entry.isLeave) existing.isLeave = true;

    registrarSchedule.set(entry.clinicianId, existing);
  }

  // Check who's already assigned to coverage on this date/session
  const existingAssignments = await prisma.coverageRequest.findMany({
    where: {
      assignedRegistrarId: { in: registrarIds },
      date: date,
      session: session,
      status: 'assigned'
    }
  });
  const alreadyAssignedIds = new Set(existingAssignments.map(a => a.assignedRegistrarId!));

  // Get workload counts (coverage assignments in last 30 days)
  const workloadCounts = await prisma.coverageRequest.groupBy({
    by: ['assignedRegistrarId'],
    where: {
      assignedRegistrarId: { in: registrarIds },
      status: 'assigned',
      date: { gte: thirtyDaysAgo, lte: date }
    },
    _count: { id: true }
  });
  const workloadMap = new Map(
    workloadCounts.map(w => [w.assignedRegistrarId!, w._count.id])
  );

  // Get last assignment date for each registrar
  const lastAssignments = await prisma.coverageRequest.findMany({
    where: {
      assignedRegistrarId: { in: registrarIds },
      status: 'assigned'
    },
    orderBy: { date: 'desc' },
    distinct: ['assignedRegistrarId'],
    select: {
      assignedRegistrarId: true,
      date: true
    }
  });
  const lastAssignmentMap = new Map(
    lastAssignments.map(a => [a.assignedRegistrarId!, a.date])
  );

  // Calculate max workload for normalization (minimum 1 to avoid division by zero)
  const maxWorkload = Math.max(1, ...Array.from(workloadMap.values()));

  const available: SuggestedRegistrar[] = [];
  const unavailable: UnavailableRegistrar[] = [];

  for (const registrar of registrars) {
    const scheduleInfo = registrarSchedule.get(registrar.id);

    // Check unavailability (priority order)
    if (scheduleInfo?.isLeave) {
      unavailable.push({
        clinicianId: registrar.id,
        clinicianName: registrar.name,
        grade: registrar.grade,
        unavailabilityReason: 'leave',
        unavailabilityLabel: unavailabilityLabels.leave
      });
      continue;
    }

    if (scheduleInfo?.isRest) {
      unavailable.push({
        clinicianId: registrar.id,
        clinicianName: registrar.name,
        grade: registrar.grade,
        unavailabilityReason: 'rest_day',
        unavailabilityLabel: unavailabilityLabels.rest_day
      });
      continue;
    }

    if (scheduleInfo?.isOnCall) {
      unavailable.push({
        clinicianId: registrar.id,
        clinicianName: registrar.name,
        grade: registrar.grade,
        unavailabilityReason: 'on_call',
        unavailabilityLabel: unavailabilityLabels.on_call
      });
      continue;
    }

    if (alreadyAssignedIds.has(registrar.id)) {
      unavailable.push({
        clinicianId: registrar.id,
        clinicianName: registrar.name,
        grade: registrar.grade,
        unavailabilityReason: 'already_assigned',
        unavailabilityLabel: unavailabilityLabels.already_assigned
      });
      continue;
    }

    // Calculate score (0-100 scale)
    const workloadCount = workloadMap.get(registrar.id) || 0;
    const lastAssigned = lastAssignmentMap.get(registrar.id);
    const reasons: string[] = [];

    // Workload score: 0-50 points (fewer assignments = higher)
    const workloadScore = Math.round(50 * (1 - workloadCount / maxWorkload));

    if (workloadCount === 0) {
      reasons.push('No recent assignments');
    } else if (workloadCount <= 2) {
      reasons.push(`Light workload (${workloadCount} in 30 days)`);
    } else {
      reasons.push(`${workloadCount} assignments in 30 days`);
    }

    // Recency score: 0-30 points (longer since last = higher, cap at 15 days)
    let recencyScore = 0;
    if (lastAssigned) {
      const daysSinceAssignment = Math.floor(
        (date.getTime() - new Date(lastAssigned).getTime()) / (1000 * 60 * 60 * 24)
      );
      recencyScore = Math.min(30, daysSinceAssignment * 2);

      if (daysSinceAssignment >= 14) {
        reasons.push(`${daysSinceAssignment} days since last`);
      }
    }

    // First-timer bonus: +20 points
    let bonusScore = 0;
    if (!lastAssigned) {
      bonusScore = 20;
      reasons.push('Never assigned before');
    }

    // Total score (cap at 100)
    const score = Math.min(100, workloadScore + recencyScore + bonusScore);

    available.push({
      clinicianId: registrar.id,
      clinicianName: registrar.name,
      grade: registrar.grade,
      score,
      reasons,
      workloadCount,
      lastAssignedDate: lastAssigned ? formatDateString(new Date(lastAssigned)) : null
    });
  }

  // Sort available by score descending
  available.sort((a, b) => b.score - a.score);

  return { available, unavailable };
}

/**
 * Auto-assign the best available registrar to a coverage request.
 * Returns the assigned registrar or null if none available.
 */
export async function autoAssignCoverage(
  coverageRequestId: number
): Promise<{ success: boolean; assignedTo?: SuggestedRegistrar; error?: string }> {
  const request = await prisma.coverageRequest.findUnique({
    where: { id: coverageRequestId }
  });

  if (!request) {
    return { success: false, error: 'Coverage request not found' };
  }

  if (request.status !== 'pending') {
    return { success: false, error: 'Coverage request is not pending' };
  }

  const result = await getSuggestedRegistrars({
    date: new Date(request.date),
    session: request.session as Session
  });

  if (result.available.length === 0) {
    return { success: false, error: 'No available registrars' };
  }

  const bestMatch = result.available[0];

  await prisma.coverageRequest.update({
    where: { id: coverageRequestId },
    data: {
      assignedRegistrarId: bestMatch.clinicianId,
      status: 'assigned',
      assignedAt: new Date()
    }
  });

  return { success: true, assignedTo: bestMatch };
}

/**
 * Bulk auto-assign all pending coverage requests.
 * Returns summary of assignments.
 */
export async function bulkAutoAssign(): Promise<{
  assigned: number;
  failed: number;
  details: { requestId: number; success: boolean; assignedTo?: string; error?: string }[];
}> {
  const pendingRequests = await prisma.coverageRequest.findMany({
    where: { status: 'pending' },
    orderBy: { date: 'asc' }
  });

  const details: { requestId: number; success: boolean; assignedTo?: string; error?: string }[] = [];
  let assigned = 0;
  let failed = 0;

  for (const request of pendingRequests) {
    const result = await autoAssignCoverage(request.id);

    if (result.success) {
      assigned++;
      details.push({
        requestId: request.id,
        success: true,
        assignedTo: result.assignedTo?.clinicianName
      });
    } else {
      failed++;
      details.push({
        requestId: request.id,
        success: false,
        error: result.error
      });
    }
  }

  return { assigned, failed, details };
}
