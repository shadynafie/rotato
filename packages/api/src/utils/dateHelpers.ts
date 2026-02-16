/**
 * Shared date utility functions used across the API package.
 * Single source of truth for date calculations.
 */

/**
 * Format a Date object to YYYY-MM-DD string
 */
export function formatDateString(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = `${date.getMonth() + 1}`.padStart(2, '0');
  const dd = `${date.getDate()}`.padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Get the week number within a month (1-5) for a given date.
 * Accounts for which day of the week the month starts on.
 * Used for job plan week matching (Week 1-5 templates).
 */
export function weekOfMonth(date: Date): number {
  const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
  const dayOfMonth = date.getDate();
  const adjusted = dayOfMonth + firstDay.getDay();
  return Math.ceil(adjusted / 7);
}

/**
 * Get the day of week as 1-7 (Monday=1, Sunday=7).
 * Converts from JavaScript's 0=Sunday convention.
 */
export function getDayOfWeek(date: Date): number {
  const jsDay = date.getDay();
  return jsDay === 0 ? 7 : jsDay;
}

/**
 * Check if a date is a weekday (Monday-Friday).
 */
export function isWeekday(date: Date): boolean {
  const day = date.getDay();
  return day >= 1 && day <= 5;
}

/**
 * Generator function to iterate over a date range (inclusive).
 */
export function* dateRange(start: Date, end: Date): Generator<Date> {
  const current = new Date(start);
  current.setHours(0, 0, 0, 0);
  const endDate = new Date(end);
  endDate.setHours(0, 0, 0, 0);

  while (current <= endDate) {
    yield new Date(current);
    current.setDate(current.getDate() + 1);
  }
}

/**
 * Add days to a date, returning a new Date object.
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Get today's date as YYYY-MM-DD string.
 */
export function getTodayString(): string {
  return formatDateString(new Date());
}
