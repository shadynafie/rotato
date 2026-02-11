import { FastifyInstance } from 'fastify';
import { requireAuth } from '../utils/auth.js';
import { computeSchedule, getTodayOncall } from '../services/scheduleComputer.js';
import { z } from 'zod';

export async function scheduleRoutes(app: FastifyInstance) {
  // Get computed schedule for a date range
  app.get('/api/schedule', { preHandler: requireAuth }, async (request) => {
    const query = z
      .object({
        from: z.string(),
        to: z.string()
      })
      .parse(request.query);

    const from = new Date(query.from);
    const to = new Date(query.to);

    // Set times to start/end of day
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);

    const schedule = await computeSchedule(from, to);
    return schedule;
  });

  // Get today's on-call (quick lookup)
  app.get('/api/schedule/oncall-today', { preHandler: requireAuth }, async () => {
    return getTodayOncall();
  });
}
