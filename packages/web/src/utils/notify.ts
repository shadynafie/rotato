import { notifications } from '@mantine/notifications';

export function showSuccess(message: string) {
  notifications.show({ color: 'green', title: 'Success', message, autoClose: 3000 });
}

export function showError(message: string) {
  notifications.show({ color: 'red', title: 'Error', message, autoClose: 5000 });
}

export function showInfo(message: string) {
  notifications.show({ color: 'blue', title: 'Info', message, autoClose: 3000 });
}
