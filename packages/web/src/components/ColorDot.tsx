import { Box } from '@mantine/core';
import React from 'react';

interface ColorDotProps {
  color?: string | null;
  size?: number;
}

/**
 * Small colored dot indicator, typically used for duty colors.
 */
export const ColorDot: React.FC<ColorDotProps> = ({ color, size = 10 }) => {
  if (!color) return null;

  return (
    <Box
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: color,
        flexShrink: 0,
      }}
    />
  );
};
