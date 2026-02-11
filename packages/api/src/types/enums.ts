// Type definitions for SQLite string-based enums
// These mirror what would be Prisma enums with PostgreSQL

export type ClinicianRole = 'consultant' | 'registrar';
export type Session = 'AM' | 'PM' | 'FULL';
export type RotaSource = 'jobplan' | 'oncall' | 'manual' | 'leave';
export type LeaveType = 'annual' | 'study' | 'sick' | 'professional';
export type NotificationChannel = 'email' | 'whatsapp_stub';
export type NotificationType = 'change' | 'digest' | 'test';
export type NotificationStatus = 'pending' | 'sent' | 'failed';

// Constants for use in code
export const ClinicianRoles = ['consultant', 'registrar'] as const;
export const Sessions = ['AM', 'PM', 'FULL'] as const;
export const RotaSources = ['jobplan', 'oncall', 'manual', 'leave'] as const;
export const LeaveTypes = ['annual', 'study', 'sick', 'professional'] as const;
export const NotificationChannels = ['email', 'whatsapp_stub'] as const;
export const NotificationTypes = ['change', 'digest', 'test'] as const;
export const NotificationStatuses = ['pending', 'sent', 'failed'] as const;
