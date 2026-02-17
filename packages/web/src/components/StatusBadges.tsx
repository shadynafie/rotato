import { Badge } from '@mantine/core';
import React from 'react';
import type { ClinicianRole, RegistrarGrade, CoverageStatus } from '../types/entities';

/**
 * Role badge for consultant/registrar display.
 */
export const RoleBadge: React.FC<{ role: ClinicianRole }> = ({ role }) => (
  <Badge
    variant="light"
    color={role === 'consultant' ? 'blue' : 'grape'}
    radius="md"
    tt="capitalize"
  >
    {role}
  </Badge>
);

/**
 * Grade badge for junior/senior registrar display.
 */
export const GradeBadge: React.FC<{ grade: RegistrarGrade | null | undefined }> = ({ grade }) => {
  if (!grade) return null;

  return (
    <Badge variant="outline" color="grape" radius="md" size="sm" tt="capitalize">
      {grade}
    </Badge>
  );
};

/**
 * Coverage status badge with appropriate coloring.
 */
const statusColors: Record<CoverageStatus, string> = {
  pending: 'orange',
  assigned: 'green',
  cancelled: 'gray',
};

export const CoverageStatusBadge: React.FC<{ status: CoverageStatus }> = ({ status }) => (
  <Badge
    variant="light"
    color={statusColors[status]}
    radius="md"
    tt="capitalize"
  >
    {status}
  </Badge>
);

/**
 * Session badge (AM/PM).
 */
export const SessionBadge: React.FC<{ session: 'AM' | 'PM' | 'FULL' }> = ({ session }) => (
  <Badge variant="light" color="blue" radius="md">
    {session}
  </Badge>
);

/**
 * Active/Inactive status badge.
 */
export const ActiveBadge: React.FC<{ active: boolean }> = ({ active }) => (
  <Badge
    variant="light"
    color={active ? 'green' : 'gray'}
    radius="md"
  >
    {active ? 'Active' : 'Inactive'}
  </Badge>
);
