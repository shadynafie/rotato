/**
 * Shared date utility functions used across the Web package.
 * Single source of truth for date calculations in the frontend.
 *
 * Functions that work with date strings (YYYY-MM-DD) avoid timezone issues.
 */

// ============================================
// Core string-based functions (timezone-safe)
// ============================================

/**
 * Format a Date object to YYYY-MM-DD string
 */
export function getDateString(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = `${date.getMonth() + 1}`.padStart(2, '0');
  const dd = `${date.getDate()}`.padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Get today's date as YYYY-MM-DD string.
 */
export function getTodayString(): string {
  return getDateString(new Date());
}

/**
 * Check if a date string is today.
 */
export function isToday(dateStr: string): boolean {
  return dateStr === getTodayString();
}

/**
 * Add days to a date string, returning a new date string.
 */
export function addDaysStr(dateStr: string, days: number): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return getDateString(date);
}

/**
 * Add months to a date string, returning a new date string.
 */
export function addMonthsStr(dateStr: string, months: number): string {
  const date = new Date(dateStr);
  date.setMonth(date.getMonth() + months);
  return getDateString(date);
}

/**
 * Get the Monday of the week containing the given date string.
 */
export function getWeekStartStr(dateStr: string): string {
  const date = new Date(dateStr);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(date.setDate(diff));
  return getDateString(monday);
}

/**
 * Get the Sunday of the week containing the given date string.
 */
export function getWeekEndStr(dateStr: string): string {
  return addDaysStr(getWeekStartStr(dateStr), 6);
}

/**
 * Get all date strings for a week starting from Monday.
 */
export function getWeekDatesStr(weekStartStr: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysStr(weekStartStr, i));
}

/**
 * Get the first day of the month as a date string.
 */
export function getMonthStartStr(dateStr: string): string {
  const date = new Date(dateStr);
  return getDateString(new Date(date.getFullYear(), date.getMonth(), 1));
}

/**
 * Get the last day of the month as a date string.
 */
export function getMonthEndStr(dateStr: string): string {
  const date = new Date(dateStr);
  return getDateString(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

/**
 * Get all days in the month as date strings.
 */
export function getMonthDaysStr(dateStr: string): string[] {
  const date = new Date(dateStr);
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const days: string[] = [];
  const current = new Date(start);
  while (current <= end) {
    days.push(getDateString(current));
    current.setDate(current.getDate() + 1);
  }
  return days;
}

// ============================================
// Week of month calculation (for job plans)
// ============================================

/**
 * Get the week number of the month (1-5).
 * Used for job plan matching.
 */
export function weekOfMonth(date: Date): number {
  const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
  const dayOfMonth = date.getDate();
  const adjusted = dayOfMonth + firstDay.getDay();
  return Math.ceil(adjusted / 7);
}

/**
 * Get the week of month from a date string.
 */
export function weekOfMonthStr(dateStr: string): number {
  return weekOfMonth(new Date(dateStr));
}

// ============================================
// Formatting functions
// ============================================

/**
 * Format week day header info.
 */
export function formatWeekDayHeader(dateStr: string): { day: string; date: number; isToday: boolean } {
  const date = new Date(dateStr);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return {
    day: days[date.getDay()],
    date: date.getDate(),
    isToday: isToday(dateStr),
  };
}

/**
 * Format date for display (e.g., "Mon 15").
 */
export function formatDayWithWeekday(dateStr: string): string {
  const date = new Date(dateStr);
  const weekday = date.toLocaleDateString('en-GB', { weekday: 'short' });
  return `${weekday} ${date.getDate()}`;
}

// ============================================
// Date object-based functions (when needed)
// ============================================

/**
 * Add days to a Date object, returning a new Date.
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Add months to a Date object, returning a new Date.
 */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

/**
 * Get the Monday of the week containing the given Date.
 */
export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Get all days in the month containing the given Date.
 */
export function getMonthDays(date: Date): Date[] {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const days: Date[] = [];
  const current = new Date(start);
  while (current <= end) {
    days.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return days;
}
