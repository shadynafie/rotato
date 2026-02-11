import { FastifyInstance } from 'fastify';
import { requireAuth } from '../utils/auth.js';
import { z } from 'zod';
import { testNotification } from '../utils/notifications.js';

export async function notificationRoutes(app: FastifyInstance) {
  app.post('/api/notifications/test', { preHandler: requireAuth }, async (request) => {
    const body = z.object({ clinicianId: z.number() }).parse(request.body);
    await testNotification(body.clinicianId);
    return { ok: true };
  });
}
