/**
 * Shared formatting utilities for consistent display across the API
 */

/**
 * Extract surname from a full name
 * "John Smith" -> "Smith"
 * "John" -> "John" (returns full name if only one part)
 */
export function getSurname(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : fullName;
}

/**
 * Format a leave type for display
 * "annual" -> "Annual Leave"
 * "study" -> "Study Leave"
 * null/undefined -> "Leave"
 */
export function formatLeaveLabel(leaveType: string | null | undefined): string {
  if (!leaveType) return 'Leave';
  return leaveType.charAt(0).toUpperCase() + leaveType.slice(1) + ' Leave';
}

/**
 * Format duty display text, adding consultant surname prefix for registrars
 * For registrars covering a consultant: "Smith Clinic"
 * For consultants or registrars without coverage: "Clinic"
 */
export function formatDutyDisplay(
  dutyName: string,
  supportingClinicianName: string | null | undefined
): string {
  if (supportingClinicianName) {
    const surname = getSurname(supportingClinicianName);
    return `${surname} ${dutyName}`;
  }
  return dutyName;
}
