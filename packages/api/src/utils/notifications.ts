import { prisma } from '../prisma.js';

interface NotificationInput {
  clinicianId: number;
  channel: string;
  type: string;
  payload?: string;
  status: string;
  sentAt?: Date;
}

async function recordNotification(data: NotificationInput) {
  return prisma.notification.create({
    data: {
      clinician: { connect: { id: data.clinicianId } },
      channel: data.channel,
      type: data.type,
      payload: data.payload,
      status: data.status,
      sentAt: data.sentAt
    }
  });
}

export async function sendChangeNotification(clinicianId: number, payload: unknown) {
  const payloadStr = JSON.stringify(payload);

  // Email stub
  await recordNotification({
    clinicianId,
    channel: 'email',
    type: 'change',
    payload: payloadStr,
    status: 'sent',
    sentAt: new Date()
  });

  // WhatsApp stub (no-op besides logging)
  await recordNotification({
    clinicianId,
    channel: 'whatsapp_stub',
    type: 'change',
    payload: payloadStr,
    status: 'sent',
    sentAt: new Date()
  });
}

export async function testNotification(clinicianId: number) {
  return sendChangeNotification(clinicianId, { test: true });
}
