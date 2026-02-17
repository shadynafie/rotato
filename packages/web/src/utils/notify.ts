import { notifications, NotificationData } from '@mantine/notifications';
import React from 'react';

// App icon component for notifications
const AppIcon = React.createElement('img', {
  src: '/icon-192.png',
  alt: '',
  width: 20,
  height: 20,
  style: { borderRadius: 4 }
});

/**
 * Wrapper around Mantine notifications that auto-adds the app icon.
 * Use this instead of importing directly from @mantine/notifications.
 */
export const notify = {
  show: (data: NotificationData) => {
    notifications.show({
      ...data,
      icon: data.icon ?? AppIcon,
    });
  },
};

// Convenience helpers
export function showSuccess(message: string, title = 'Success') {
  notify.show({ color: 'green', title, message, autoClose: 3000 });
}

export function showError(message: string, title = 'Error') {
  notify.show({ color: 'red', title, message, autoClose: 5000 });
}

export function showInfo(message: string, title = 'Info') {
  notify.show({ color: 'blue', title, message, autoClose: 3000 });
}
