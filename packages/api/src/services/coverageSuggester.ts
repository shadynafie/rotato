import { prisma } from '../prisma.js';

type Session = 'AM' | 'PM';

interface SuggestedRegistrar {
  clinicianId: number;
  clinicianName: string;
  grade: string | null;
  score: number;
  reasons: string[];
  workloadCount: number;
  lastAssignedDate: string | null;
}

interface SuggestionRequest {
  date: Date;
  session: Session;
  excludeClinicianIds?: number[];
}

/**
 * Get smart suggestions for registrar coverage assignment.
 * Ranks available registrars by:
 * 1. Availability (must be free)
 * 2. Workload balance (fewer assignments in last 30 days = higher score)
 * 3. Recency (longer since last assignment = higher score)
 */
export async function getSuggestedRegistrars(
  request: SuggestionRequest
): Promise<SuggestedRegistrar[]> {
  const { date, session, excludeClinicianIds = [] } = request;

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
    return [];
  }

  const registrarIds = registrars.map(r => r.id);

  // Check who's on leave on this date/session
  const leaves = await prisma.leave.findMany({
    where: {
      clinicianId: { in: registrarIds },
      date: date,
      OR: [
        { session: 'FULL' },
        { session: session }
      ]
    }
  });
  const onLeaveIds = new Set(leaves.map(l => l.clinicianId));

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

  // Calculate max workload for normalization
  const maxWorkload = Math.max(1, ...Array.from(workloadMap.values()));

  // Score each available registrar
  const suggestions: SuggestedRegistrar[] = [];

  for (const registrar of registrars) {
    // Skip unavailable registrars
    if (onLeaveIds.has(registrar.id)) continue;
    if (alreadyAssignedIds.has(registrar.id)) continue;

    const workloadCount = workloadMap.get(registrar.id) || 0;
    const lastAssigned = lastAssignmentMap.get(registrar.id);
    const reasons: string[] = [];

    // Base score starts at 100
    let score = 100;

    // Workload score: fewer assignments = higher score (0-40 points)
    const workloadScore = 40 * (1 - workloadCount / maxWorkload);
    score += workloadScore;

    if (workloadCount === 0) {
      reasons.push('No recent coverage assignments');
    } else if (workloadCount <= 2) {
      reasons.push(`Light workload (${workloadCount} in last 30 days)`);
    }

    // Recency score: longer since last assignment = higher score (0-30 points)
    if (lastAssigned) {
      const daysSinceAssignment = Math.floor(
        (date.getTime() - new Date(lastAssigned).getTime()) / (1000 * 60 * 60 * 24)
      );
      const recencyScore = Math.min(30, daysSinceAssignment * 2);
      score += recencyScore;

      if (daysSinceAssignment > 14) {
        reasons.push(`${daysSinceAssignment} days since last assignment`);
      }
    } else {
      // Never assigned = bonus
      score += 30;
      reasons.push('Never assigned coverage before');
    }

    // Availability bonus (already filtered, but add reason)
    reasons.push('Available for this slot');

    suggestions.push({
      clinicianId: registrar.id,
      clinicianName: registrar.name,
      grade: registrar.grade,
      score: Math.round(score),
      reasons,
      workloadCount,
      lastAssignedDate: lastAssigned ? formatDateString(new Date(lastAssigned)) : null
    });
  }

  // Sort by score descending
  suggestions.sort((a, b) => b.score - a.score);

  return suggestions;
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

  const suggestions = await getSuggestedRegistrars({
    date: new Date(request.date),
    session: request.session as Session
  });

  if (suggestions.length === 0) {
    return { success: false, error: 'No available registrars' };
  }

  const bestMatch = suggestions[0];

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

function formatDateString(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = `${date.getMonth() + 1}`.padStart(2, '0');
  const dd = `${date.getDate()}`.padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
