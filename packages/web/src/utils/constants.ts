/**
 * Shared constants for consistent values across the app
 */

/**
 * Leave type options for select dropdowns
 */
export const LEAVE_TYPES = [
  { value: 'annual', label: 'Annual Leave' },
  { value: 'study', label: 'Study Leave' },
  { value: 'sick', label: 'Sick Leave' },
  { value: 'professional', label: 'Professional Leave' },
] as const;

/**
 * Session options for select dropdowns
 */
export const SESSIONS = [
  { value: 'FULL', label: 'Full Day' },
  { value: 'AM', label: 'Morning (AM)' },
  { value: 'PM', label: 'Afternoon (PM)' },
] as const;

/**
 * Semantic colors used throughout the app
 */
export const COLORS = {
  // Primary
  primary: '#0071e3',

  // Text
  textPrimary: '#1d1d1f',
  textSecondary: '#86868b',

  // Status colors
  oncall: '#ff9500',
  oncallBg: 'rgba(255, 149, 0, 0.1)',
  leave: '#ff3b30',
  leaveBg: 'rgba(255, 59, 48, 0.1)',
  restOff: '#ff3b30',  // Same as leave
  restOffBg: 'rgba(255, 59, 48, 0.1)',  // Same as leave
  success: '#34c759',

  // Backgrounds
  bgLight: '#f5f5f7',
  border: 'rgba(0, 0, 0, 0.06)',
  borderStrong: 'rgba(0, 0, 0, 0.08)',
} as const;

/**
 * Get background color with opacity for a given color
 */
export function getColorWithOpacity(color: string, opacity: number): string {
  return `${color}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`;
}
