import { prisma } from '../prisma.js';
import { formatDateString } from '../utils/dateHelpers.js';
import { computeSchedule } from './scheduleComputer.js';

type Session = 'AM' | 'PM';

type UnavailabilityReason = 'leave' | 'rest_day' | 'on_call' | 'already_assigned';

// Scoring constants - unit pricing model
const SCORING = {
  // Points per unit (positive = better availability)
  DAYS_SINCE_COVERAGE: 2,    // +2 per day since last coverage (cap at 30 days = +60 max)
  DAYS_SINCE_ONCALL: 1,      // +1 per day since last on-call (cap at 30 days = +30 max)
  PER_ONCALL: -8,            // -8 per on-call in last 30 days
  PER_DUTY: -3,              // -3 per duty in last 30 days
  PER_COVERAGE: -5,          // -5 per coverage in last 30 days
  RECENT_3_DAYS_PENALTY: -15, // penalty if covered in last 3 days
  YESTERDAY_PENALTY: -10,     // additional penalty if covered yesterday

  // Normalization bounds (based on typical scenarios)
  // MAX_RAW = 90 (forgotten registrar: 30 days * 2 + 30 days * 1 = 90)
  // MIN_RAW = -150 (extremely busy: 6 on-calls * -8 + 20 duties * -3 + 4 coverages * -5 + penalties)
  MAX_RAW: 90,
  MIN_RAW: -150,
  RANGE: 240
};

interface SuggestedRegistrar {
  clinicianId: number;
  clinicianName: string;
  grade: string | null;
  score: number;
  reasons: string[];
  // Detailed metrics for transparency
  dutiesIn30Days: number;
  oncallsIn30Days: number;
  coveragesIn30Days: number;
  daysSinceCoverage: number | null;
  daysSinceOncall: number | null;
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
 * Scoring uses a unit pricing model normalized to 0-100:
 *
 * Positive factors (higher = more available):
 * - Days since last coverage: +2 pts/day (cap 30 days = +60 max)
 * - Days since last on-call: +1 pt/day (cap 30 days = +30 max)
 *
 * Negative factors (busier = lower score):
 * - On-calls in 30 days: -8 pts each
 * - Duties in 30 days: -3 pts each
 * - Coverages in 30 days: -5 pts each
 * - Covered in last 3 days: -15 pts
 * - Covered yesterday: additional -10 pts
 *
 * Normalization: rawScore mapped from [-150, +90] to [0, 100] with clamping.
 * - Forgotten registrar (no activity): ~100
 * - Extremely busy registrar: ~0
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

  // Get coverage counts in last 30 days
  const coverageCounts = await prisma.coverageRequest.groupBy({
    by: ['assignedRegistrarId'],
    where: {
      assignedRegistrarId: { in: registrarIds },
      status: 'assigned',
      date: { gte: thirtyDaysAgo, lte: date }
    },
    _count: { id: true }
  });
  const coverageMap = new Map(
    coverageCounts.map(w => [w.assignedRegistrarId!, w._count.id])
  );

  // Get last coverage assignment date for each registrar (only past dates)
  const lastCoverages = await prisma.coverageRequest.findMany({
    where: {
      assignedRegistrarId: { in: registrarIds },
      status: 'assigned',
      date: { lt: date }  // Only past dates, not today or future
    },
    orderBy: { date: 'desc' },
    distinct: ['assignedRegistrarId'],
    select: {
      assignedRegistrarId: true,
      date: true
    }
  });
  const lastCoverageMap = new Map(
    lastCoverages.map(a => [a.assignedRegistrarId!, a.date])
  );

  // Get duty counts in last 30 days (from RotaEntry)
  const dutyCounts = await prisma.rotaEntry.groupBy({
    by: ['clinicianId'],
    where: {
      clinicianId: { in: registrarIds },
      date: { gte: thirtyDaysAgo, lte: date },
      dutyId: { not: null }
    },
    _count: { id: true }
  });
  const dutyMap = new Map(
    dutyCounts.map(d => [d.clinicianId, d._count.id])
  );

  // Get on-call counts in last 30 days (count unique DATES, not entries)
  // On-call spans full day but may have AM+PM entries, so we count distinct dates
  const oncallEntries = await prisma.rotaEntry.findMany({
    where: {
      clinicianId: { in: registrarIds },
      date: { gte: thirtyDaysAgo, lte: date },
      source: 'oncall'
    },
    distinct: ['clinicianId', 'date'],
    select: {
      clinicianId: true,
      date: true
    }
  });
  // Count unique dates per clinician
  const oncallMap = new Map<number, number>();
  for (const entry of oncallEntries) {
    oncallMap.set(entry.clinicianId, (oncallMap.get(entry.clinicianId) || 0) + 1);
  }

  // Get last on-call date for each registrar (only past dates)
  const lastOncalls = await prisma.rotaEntry.findMany({
    where: {
      clinicianId: { in: registrarIds },
      source: 'oncall',
      date: { lt: date }  // Only past dates, not today or future
    },
    orderBy: { date: 'desc' },
    distinct: ['clinicianId'],
    select: {
      clinicianId: true,
      date: true
    }
  });
  const lastOncallMap = new Map(
    lastOncalls.map(o => [o.clinicianId, o.date])
  );

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

    // Gather metrics for scoring
    const coveragesIn30Days = coverageMap.get(registrar.id) || 0;
    const dutiesIn30Days = dutyMap.get(registrar.id) || 0;
    const oncallsIn30Days = oncallMap.get(registrar.id) || 0;
    const lastCoverage = lastCoverageMap.get(registrar.id);
    const lastOncall = lastOncallMap.get(registrar.id);

    // Calculate days since last coverage
    let daysSinceCoverage: number | null = null;
    if (lastCoverage) {
      daysSinceCoverage = Math.floor(
        (date.getTime() - new Date(lastCoverage).getTime()) / (1000 * 60 * 60 * 24)
      );
    }

    // Calculate days since last on-call
    let daysSinceOncall: number | null = null;
    if (lastOncall) {
      daysSinceOncall = Math.floor(
        (date.getTime() - new Date(lastOncall).getTime()) / (1000 * 60 * 60 * 24)
      );
    }

    // Check if covered in last 3 days or yesterday
    const coveredInLast3Days = daysSinceCoverage !== null && daysSinceCoverage <= 3;
    const coveredYesterday = daysSinceCoverage !== null && daysSinceCoverage <= 1;

    // Calculate raw score using unit pricing
    let rawScore = 0;

    // Days since last coverage: +2 per day (cap at 30 days = +60 max)
    // If never covered, treat as 30+ days (maximum benefit)
    const effectiveDaysSinceCoverage = daysSinceCoverage === null ? 30 : Math.min(daysSinceCoverage, 30);
    rawScore += effectiveDaysSinceCoverage * SCORING.DAYS_SINCE_COVERAGE;

    // Days since last on-call: +1 per day (cap at 30 days = +30 max)
    // If never on-call, treat as 30+ days (maximum benefit)
    const effectiveDaysSinceOncall = daysSinceOncall === null ? 30 : Math.min(daysSinceOncall, 30);
    rawScore += effectiveDaysSinceOncall * SCORING.DAYS_SINCE_ONCALL;

    // On-calls in 30 days: -8 per on-call
    rawScore += oncallsIn30Days * SCORING.PER_ONCALL;

    // Duties in 30 days: -3 per duty
    rawScore += dutiesIn30Days * SCORING.PER_DUTY;

    // Coverages in 30 days: -5 per coverage
    rawScore += coveragesIn30Days * SCORING.PER_COVERAGE;

    // Recent coverage penalties
    if (coveredInLast3Days) {
      rawScore += SCORING.RECENT_3_DAYS_PENALTY;
    }
    if (coveredYesterday) {
      rawScore += SCORING.YESTERDAY_PENALTY;
    }

    // Normalize to 0-100 scale with clamping
    const normalizedScore = Math.round(
      Math.max(0, Math.min(100,
        ((rawScore - SCORING.MIN_RAW) / SCORING.RANGE) * 100
      ))
    );

    // Build reasons array for transparency
    const reasons: string[] = [];

    if (coveragesIn30Days === 0 && dutiesIn30Days === 0 && oncallsIn30Days === 0) {
      reasons.push('No recent activity');
    } else {
      if (coveragesIn30Days > 0) {
        reasons.push(`${coveragesIn30Days} coverage${coveragesIn30Days > 1 ? 's' : ''} in 30d`);
      }
      if (oncallsIn30Days > 0) {
        reasons.push(`${oncallsIn30Days} on-call${oncallsIn30Days > 1 ? 's' : ''} in 30d`);
      }
      if (dutiesIn30Days > 0) {
        reasons.push(`${dutiesIn30Days} ${dutiesIn30Days === 1 ? 'duty' : 'duties'} in 30d`);
      }
    }

    if (coveredYesterday) {
      reasons.push('Covered yesterday');
    } else if (coveredInLast3Days) {
      reasons.push('Covered recently');
    } else if (daysSinceCoverage !== null && daysSinceCoverage >= 14) {
      reasons.push(`${daysSinceCoverage}d since last coverage`);
    }

    available.push({
      clinicianId: registrar.id,
      clinicianName: registrar.name,
      grade: registrar.grade,
      score: normalizedScore,
      reasons,
      dutiesIn30Days,
      oncallsIn30Days,
      coveragesIn30Days,
      daysSinceCoverage,
      daysSinceOncall
    });
  }

  // Sort available by score descending
  available.sort((a, b) => b.score - a.score);

  return { available, unavailable };
}

interface SuggestedConsultant {
  clinicianId: number;
  clinicianName: string;
  score: number;
  reasons: string[];
  dutiesIn30Days: number;
  oncallsIn30Days: number;
  coveragesIn30Days: number;
}

interface UnavailableConsultant {
  clinicianId: number;
  clinicianName: string;
  unavailabilityReason: UnavailabilityReason;
  unavailabilityLabel: string;
}

interface ConsultantSuggestionResult {
  available: SuggestedConsultant[];
  unavailable: UnavailableConsultant[];
}

/**
 * Get smart suggestions for consultant coverage assignment.
 *
 * Similar scoring to registrar coverage but simpler - focuses on:
 * - Days since last coverage
 * - On-call activity
 * - General workload
 */
export async function getSuggestedConsultants(
  request: SuggestionRequest
): Promise<ConsultantSuggestionResult> {
  const { date, session, excludeClinicianIds = [] } = request;

  // Get date boundaries for workload calculation (last 30 days)
  const thirtyDaysAgo = new Date(date);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Fetch all active consultants
  const consultants = await prisma.clinician.findMany({
    where: {
      role: 'consultant',
      active: true,
      id: { notIn: excludeClinicianIds }
    }
  });

  if (consultants.length === 0) {
    return { available: [], unavailable: [] };
  }

  const consultantIds = consultants.map(c => c.id);

  // Use computeSchedule to check on-call and leave
  const schedule = await computeSchedule(date, date);
  const consultantSchedule = new Map<number, { isOnCall: boolean; isLeave: boolean }>();

  for (const entry of schedule) {
    if (entry.clinicianRole !== 'consultant') continue;
    const entrySession = entry.session as string;
    if (entrySession !== session && entrySession !== 'FULL') continue;

    const existing = consultantSchedule.get(entry.clinicianId) || { isOnCall: false, isLeave: false };

    if (entry.isOncall) existing.isOnCall = true;
    if (entry.isLeave) existing.isLeave = true;

    consultantSchedule.set(entry.clinicianId, existing);
  }

  // Check who's already assigned to consultant coverage on this date/session
  const existingAssignments = await prisma.coverageRequest.findMany({
    where: {
      assignedConsultantId: { in: consultantIds },
      date: date,
      session: session,
      status: 'assigned',
      type: 'consultant'
    }
  });
  const alreadyAssignedIds = new Set(existingAssignments.map(a => a.assignedConsultantId!));

  // Get consultant coverage counts in last 30 days
  const coverageCounts = await prisma.coverageRequest.groupBy({
    by: ['assignedConsultantId'],
    where: {
      assignedConsultantId: { in: consultantIds },
      status: 'assigned',
      type: 'consultant',
      date: { gte: thirtyDaysAgo, lte: date }
    },
    _count: { id: true }
  });
  const coverageMap = new Map(
    coverageCounts.map(w => [w.assignedConsultantId!, w._count.id])
  );

  // Get duty counts in last 30 days
  const dutyCounts = await prisma.rotaEntry.groupBy({
    by: ['clinicianId'],
    where: {
      clinicianId: { in: consultantIds },
      date: { gte: thirtyDaysAgo, lte: date },
      dutyId: { not: null }
    },
    _count: { id: true }
  });
  const dutyMap = new Map(
    dutyCounts.map(d => [d.clinicianId, d._count.id])
  );

  // Get on-call counts in last 30 days
  const oncallEntries = await prisma.rotaEntry.findMany({
    where: {
      clinicianId: { in: consultantIds },
      date: { gte: thirtyDaysAgo, lte: date },
      source: 'oncall'
    },
    distinct: ['clinicianId', 'date'],
    select: {
      clinicianId: true,
      date: true
    }
  });
  const oncallMap = new Map<number, number>();
  for (const entry of oncallEntries) {
    oncallMap.set(entry.clinicianId, (oncallMap.get(entry.clinicianId) || 0) + 1);
  }

  const available: SuggestedConsultant[] = [];
  const unavailable: UnavailableConsultant[] = [];

  for (const consultant of consultants) {
    const scheduleInfo = consultantSchedule.get(consultant.id);

    // Check unavailability
    if (scheduleInfo?.isLeave) {
      unavailable.push({
        clinicianId: consultant.id,
        clinicianName: consultant.name,
        unavailabilityReason: 'leave',
        unavailabilityLabel: unavailabilityLabels.leave
      });
      continue;
    }

    if (scheduleInfo?.isOnCall) {
      unavailable.push({
        clinicianId: consultant.id,
        clinicianName: consultant.name,
        unavailabilityReason: 'on_call',
        unavailabilityLabel: unavailabilityLabels.on_call
      });
      continue;
    }

    if (alreadyAssignedIds.has(consultant.id)) {
      unavailable.push({
        clinicianId: consultant.id,
        clinicianName: consultant.name,
        unavailabilityReason: 'already_assigned',
        unavailabilityLabel: unavailabilityLabels.already_assigned
      });
      continue;
    }

    // Calculate simple score based on workload
    const coveragesIn30Days = coverageMap.get(consultant.id) || 0;
    const dutiesIn30Days = dutyMap.get(consultant.id) || 0;
    const oncallsIn30Days = oncallMap.get(consultant.id) || 0;

    // Simple scoring: lower workload = higher score
    let rawScore = 60;  // Base score
    rawScore -= coveragesIn30Days * 10;  // Heavy penalty for recent coverages
    rawScore -= oncallsIn30Days * 5;
    rawScore -= dutiesIn30Days * 2;

    // Normalize to 0-100
    const score = Math.max(0, Math.min(100, rawScore));

    // Build reasons
    const reasons: string[] = [];
    if (coveragesIn30Days === 0 && oncallsIn30Days === 0) {
      reasons.push('Light workload');
    } else {
      if (coveragesIn30Days > 0) {
        reasons.push(`${coveragesIn30Days} coverage${coveragesIn30Days > 1 ? 's' : ''} in 30d`);
      }
      if (oncallsIn30Days > 0) {
        reasons.push(`${oncallsIn30Days} on-call${oncallsIn30Days > 1 ? 's' : ''} in 30d`);
      }
    }

    available.push({
      clinicianId: consultant.id,
      clinicianName: consultant.name,
      score,
      reasons,
      dutiesIn30Days,
      oncallsIn30Days,
      coveragesIn30Days
    });
  }

  // Sort by score descending
  available.sort((a, b) => b.score - a.score);

  return { available, unavailable };
}

/**
 * Auto-assign the best available clinician to a coverage request.
 * For registrar coverage: assigns best registrar
 * For consultant coverage: assigns best consultant
 */
export async function autoAssignCoverage(
  coverageRequestId: number
): Promise<{ success: boolean; assignedTo?: SuggestedRegistrar | SuggestedConsultant; error?: string }> {
  const request = await prisma.coverageRequest.findUnique({
    where: { id: coverageRequestId }
  });

  if (!request) {
    return { success: false, error: 'Coverage request not found' };
  }

  if (request.status !== 'pending') {
    return { success: false, error: 'Coverage request is not pending' };
  }

  if (request.type === 'consultant') {
    // Consultant coverage - find best consultant
    const result = await getSuggestedConsultants({
      date: new Date(request.date),
      session: request.session as Session,
      excludeClinicianIds: request.absentConsultantId ? [request.absentConsultantId] : []
    });

    if (result.available.length === 0) {
      return { success: false, error: 'No available consultants' };
    }

    const bestMatch = result.available[0];

    await prisma.coverageRequest.update({
      where: { id: coverageRequestId },
      data: {
        assignedConsultantId: bestMatch.clinicianId,
        status: 'assigned',
        assignedAt: new Date()
      }
    });

    return { success: true, assignedTo: bestMatch };
  } else {
    // Registrar coverage - find best registrar
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
