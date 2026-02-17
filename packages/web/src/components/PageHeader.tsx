import { Box, Group, Text } from '@mantine/core';
import React from 'react';

interface PageHeaderProps {
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
}

/**
 * Consistent page header with title, subtitle, and optional action buttons.
 * Used across all Settings pages for visual consistency.
 */
export const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, actions }) => {
  return (
    <Group justify="space-between" mb={32}>
      <Box>
        <Text
          style={{
            fontSize: '2rem',
            fontWeight: 700,
            color: '#1d1d1f',
            letterSpacing: '-0.025em',
            marginBottom: 8,
          }}
        >
          {title}
        </Text>
        <Text style={{ fontSize: '1.0625rem', color: '#86868b' }}>
          {subtitle}
        </Text>
      </Box>
      {actions && <Box>{actions}</Box>}
    </Group>
  );
};
