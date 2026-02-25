// Type definitions for SQLite string-based enums
// These mirror what would be Prisma enums with PostgreSQL

export type ClinicianRole = 'consultant' | 'registrar';
export type RegistrarGrade = 'junior' | 'senior';
export type Session = 'AM' | 'PM' | 'FULL';
export type RotaSource = 'jobplan' | 'oncall' | 'manual' | 'leave' | 'rest';
export type LeaveType = 'annual' | 'study' | 'sick' | 'professional';
export type CoverageReason = 'leave' | 'oncall_conflict' | 'manual';
export type CoverageStatus = 'pending' | 'assigned' | 'cancelled';
export type CoverageType = 'registrar' | 'consultant';
export type NotificationChannel = 'email' | 'whatsapp_stub';
export type NotificationType = 'change' | 'digest' | 'test';
export type NotificationStatus = 'pending' | 'sent' | 'failed';

// Constants for use in code
export const ClinicianRoles = ['consultant', 'registrar'] as const;
export const RegistrarGrades = ['junior', 'senior'] as const;
export const Sessions = ['AM', 'PM', 'FULL'] as const;
export const RotaSources = ['jobplan', 'oncall', 'manual', 'leave', 'rest'] as const;
export const LeaveTypes = ['annual', 'study', 'sick', 'professional'] as const;
export const CoverageReasons = ['leave', 'oncall_conflict', 'manual'] as const;
export const CoverageStatuses = ['pending', 'assigned', 'cancelled'] as const;
export const CoverageTypes = ['registrar', 'consultant'] as const;
export const NotificationChannels = ['email', 'whatsapp_stub'] as const;
export const NotificationTypes = ['change', 'digest', 'test'] as const;
export const NotificationStatuses = ['pending', 'sent', 'failed'] as const;
