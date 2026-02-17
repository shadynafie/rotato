import { Box, Loader, Text } from '@mantine/core';
import React from 'react';

interface LoadingSpinnerProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

/**
 * Centered loading spinner with optional message.
 */
export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  message = 'Loading...',
  size = 'lg'
}) => {
  return (
    <Box ta="center" py={60}>
      <Loader size={size} color="#0071e3" />
      {message && (
        <Text mt="md" c="dimmed">
          {message}
        </Text>
      )}
    </Box>
  );
};
