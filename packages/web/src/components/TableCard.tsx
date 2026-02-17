import { Badge, Box } from '@mantine/core';
import React from 'react';

interface TableCardProps {
  children: React.ReactNode;
  headerLabel?: string;
  headerColor?: 'blue' | 'grape' | 'gray' | 'green' | 'orange';
}

/**
 * Card wrapper for tables with consistent styling and optional header badge.
 */
export const TableCard: React.FC<TableCardProps> = ({ children, headerLabel, headerColor = 'blue' }) => {
  return (
    <Box
      style={{
        backgroundColor: '#ffffff',
        borderRadius: 16,
        overflow: 'hidden',
        border: '1px solid rgba(0, 0, 0, 0.06)',
      }}
    >
      {headerLabel && (
        <Box
          px={24}
          py={16}
          style={{
            backgroundColor: '#fafafa',
            borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
          }}
        >
          <Badge variant="light" color={headerColor} size="lg" radius="md">
            {headerLabel}
          </Badge>
        </Box>
      )}
      {children}
    </Box>
  );
};
