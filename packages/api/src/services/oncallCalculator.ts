import type { OnCallConfig, OnCallSlot, OnCallPattern, SlotAssignment } from '@prisma/client';
import { formatDateString } from '../utils/dateHelpers.js';

/**
 * Shared on-call calculation data structure.
 * Used by both rotaGenerator and scheduleComputer.
 */
export interface SlotBasedData {
  config: OnCallConfig | null;
  slots: OnCallSlot[];
  patterns: OnCallPattern[];  // Only used for registrars
  assignments: SlotAssignment[];
}

/**
 * Determine which clinician is on-call for a given date and role.
 *
 * For consultants:
 * - Uses week-based cycling through slots
 * - Week N of cycle = slot with position N (1-indexed)
 *
 * For registrars:
 * - If explicit patterns exist, uses dayOfCycle to lookup slotId
 * - Otherwise, uses implicit daily round-robin through slots
 *
 * Then finds the active slot assignment for that date.
 *
 * @param date - The date to check
 * @param role - 'consultant' or 'registrar'
 * @param data - Slot-based on-call configuration data
 * @returns clinicianId of the on-call person, or null if not found
 */
export function getOncallClinicianForDate(
  date: Date,
  role: 'consultant' | 'registrar',
  data: SlotBasedData
): number | null {
  const { config, slots, patterns, assignments } = data;

  if (!config || slots.length === 0) return null;

  // Use string-based date comparison to avoid timezone issues
  const dateStr = formatDateString(date);
  const startDateStr = formatDateString(config.startDate);

  // Calculate days difference using UTC timestamps of midnight
  const dateMs = Date.parse(dateStr + 'T00:00:00Z');
  const startDateMs = Date.parse(startDateStr + 'T00:00:00Z');
  const daysSinceStart = Math.round((dateMs - startDateMs) / (1000 * 60 * 60 * 24));

  let slotId: number;

  if (role === 'consultant') {
    // Consultants: week N = slot with position N (implicit pattern)
    const weeksSinceStart = Math.floor(daysSinceStart / 7);
    const weekOfCycle = ((weeksSinceStart % config.cycleLength) + config.cycleLength) % config.cycleLength;
    const position = weekOfCycle + 1; // 1-indexed
    const slot = slots.find(s => s.position === position);

    if (!slot) return null;
    slotId = slot.id;
  } else {
    // Registrars: use explicit pattern if available, otherwise implicit round-robin
    const dayOfCycle = ((daysSinceStart % config.cycleLength) + config.cycleLength) % config.cycleLength + 1;

    if (patterns.length > 0) {
      // Explicit pattern configured - use it
      const pattern = patterns.find(p => p.dayOfCycle === dayOfCycle);
      if (!pattern) return null;
      slotId = pattern.slotId;
    } else {
      // No explicit pattern - use implicit round-robin (like consultants but daily)
      // Day N of cycle = slot ((N-1) mod numSlots) + 1
      const position = ((dayOfCycle - 1) % slots.length) + 1;
      const slot = slots.find(s => s.position === position);
      if (!slot) return null;
      slotId = slot.id;
    }
  }

  // Find active assignment for this slot on this date - use string comparison
  const assignment = assignments.find(a => {
    if (a.slotId !== slotId) return false;

    const fromStr = formatDateString(a.effectiveFrom);
    const toStr = a.effectiveTo ? formatDateString(a.effectiveTo) : '9999-12-31';

    return fromStr <= dateStr && toStr >= dateStr;
  });

  return assignment?.clinicianId ?? null;
}
