import { Box, Text } from '@mantine/core';
import React from 'react';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  message: string;
  action?: React.ReactNode;
}

/**
 * Empty state display with icon, title, message, and optional action.
 * Used when tables/lists have no data to display.
 */
export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, message, action }) => {
  return (
    <Box
      ta="center"
      py={60}
      style={{
        backgroundColor: '#ffffff',
        borderRadius: 16,
        border: '1px solid rgba(0, 0, 0, 0.06)',
      }}
    >
      <Box
        style={{
          width: 64,
          height: 64,
          backgroundColor: '#f5f5f7',
          borderRadius: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 16px',
        }}
      >
        {icon}
      </Box>
      <Text fw={500} c="#1d1d1f" mb={4}>
        {title}
      </Text>
      <Text c="dimmed" size="sm">
        {message}
      </Text>
      {action && <Box mt={16}>{action}</Box>}
    </Box>
  );
};
