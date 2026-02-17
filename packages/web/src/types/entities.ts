/**
 * Shared entity types used across the application.
 * Single source of truth for all domain models.
 */

// ============================================================================
// Core Entities
// ============================================================================

export type ClinicianRole = 'consultant' | 'registrar';
export type RegistrarGrade = 'junior' | 'senior';
export type Session = 'AM' | 'PM' | 'FULL';
export type LeaveType = 'annual' | 'study' | 'sick' | 'professional';
export type CoverageReason = 'leave' | 'oncall_conflict' | 'manual';
export type CoverageStatus = 'pending' | 'assigned' | 'cancelled';

export interface Clinician {
  id: number;
  name: string;
  role: ClinicianRole;
  grade?: RegistrarGrade | null;
  email?: string | null;
  active?: boolean;
  notifyEmail?: boolean;
  notifyWhatsapp?: boolean;
}

export interface Duty {
  id: number;
  name: string;
  color?: string | null;
  requiresRegistrar?: boolean;
}

export interface User {
  id: number;
  email: string;
  role: string;
  createdAt: string;
}

export interface Leave {
  id: number;
  clinicianId: number;
  clinician?: Clinician;
  date: string;
  session: Session;
  type: LeaveType;
  note?: string | null;
}

export interface CoverageRequest {
  id: number;
  date: string;
  session: 'AM' | 'PM';
  consultantId?: number | null;
  consultant?: Clinician | null;
  dutyId: number;
  duty: Duty;
  reason: CoverageReason;
  status: CoverageStatus;
  absentRegistrarId?: number | null;
  absentRegistrar?: Clinician | null;
  assignedRegistrarId?: number | null;
  assignedRegistrar?: Clinician | null;
  assignedAt?: string | null;
  note?: string | null;
}

export interface SuggestedRegistrar {
  clinicianId: number;
  clinicianName: string;
  grade: string | null;
  score: number;
  reasons: string[];
  dutiesIn30Days: number;
  oncallsIn30Days: number;
  coveragesIn30Days: number;
  daysSinceCoverage: number | null;
  daysSinceOncall: number | null;
}

export interface UnavailableRegistrar {
  clinicianId: number;
  clinicianName: string;
  grade: string | null;
  unavailabilityReason: string;
  unavailabilityLabel: string;
}

export interface SuggestionResult {
  available: SuggestedRegistrar[];
  unavailable: UnavailableRegistrar[];
}

// ============================================================================
// Schedule Types
// ============================================================================

export interface ScheduleEntry {
  date: string;
  clinicianId: number;
  clinicianName: string;
  clinicianRole: ClinicianRole;
  session: 'AM' | 'PM';
  dutyId: number | null;
  dutyName: string | null;
  dutyColor: string | null;
  isOncall: boolean;
  isLeave: boolean;
  leaveType: LeaveType | null;
  source: string;
  manualOverrideId: number | null;
  supportingClinicianId?: number | null;
  supportingClinicianName?: string | null;
  isRest?: boolean;
  isRestOff?: boolean;
}

export interface OncallToday {
  consultant: { id: number; name: string } | null;
  registrar: { id: number; name: string } | null;
}

// ============================================================================
// On-Call Slot Types
// ============================================================================

export interface OnCallSlot {
  id: number;
  role: ClinicianRole;
  position: number;
  label: string;
  active: boolean;
  assignments?: SlotAssignment[];
}

export interface SlotAssignment {
  id: number;
  slotId: number;
  clinicianId: number;
  clinician?: Clinician;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface OnCallConfig {
  id: number;
  role: ClinicianRole;
  cycleLength: number;
  startDate: string;
  unitType: 'day' | 'week';
}

export interface OnCallPattern {
  id: number;
  role: ClinicianRole;
  dayIndex: number;
  slotPosition: number;
}

// ============================================================================
// Share Token Types
// ============================================================================

export interface ShareToken {
  id: number;
  token: string;
  label: string;
  clinicianId: number | null;
  clinician?: Clinician | null;
  type: 'all' | 'clinician' | 'oncall';
  active: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

// ============================================================================
// Job Plan Types
// ============================================================================

export interface JobPlanWeek {
  id: number;
  clinicianId: number;
  clinician?: Clinician;
  weekNo: number;
  dayOfWeek: number;
  amDutyId: number | null;
  amDuty?: Duty | null;
  pmDutyId: number | null;
  pmDuty?: Duty | null;
  amSupportingClinicianId?: number | null;
  amSupportingClinician?: Clinician | null;
  pmSupportingClinicianId?: number | null;
  pmSupportingClinician?: Clinician | null;
}
