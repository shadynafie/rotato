import { FastifyInstance } from 'fastify';
import { prisma } from '../prisma.js';
import { computeSchedule } from '../services/scheduleComputer.js';
import { z } from 'zod';
import ics from 'ics';

async function validateToken(token: string) {
  const record = await prisma.shareToken.findUnique({ where: { token, active: true } });
  if (!record) return null;
  await prisma.shareToken.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } });
  return record;
}

export async function publicRoutes(app: FastifyInstance) {
  // Get computed schedule for public view
  app.get('/public/:token/schedule', async (request, reply) => {
    const token = (request.params as { token: string }).token;
    const valid = await validateToken(token);
    if (!valid) return reply.unauthorized();

    const query = z
      .object({
        from: z.string().optional(),
        to: z.string().optional()
      })
      .parse(request.query);

    // Default to current month if no dates provided
    const today = new Date();
    const from = query.from ? new Date(query.from) : new Date(today.getFullYear(), today.getMonth(), 1);
    const to = query.to ? new Date(query.to) : new Date(today.getFullYear(), today.getMonth() + 1, 0);

    const schedule = await computeSchedule(from, to);
    return schedule;
  });

  // Get today's on-call for public view
  app.get('/public/:token/oncall-today', async (request, reply) => {
    const token = (request.params as { token: string }).token;
    const valid = await validateToken(token);
    if (!valid) return reply.unauthorized();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const schedule = await computeSchedule(today, today);

    const consultant = schedule.find((e) => e.clinicianRole === 'consultant' && e.isOncall);
    const registrar = schedule.find((e) => e.clinicianRole === 'registrar' && e.isOncall);

    return {
      consultant: consultant ? { id: consultant.clinicianId, name: consultant.clinicianName } : null,
      registrar: registrar ? { id: registrar.clinicianId, name: registrar.clinicianName } : null
    };
  });

  // Legacy endpoint - kept for backward compatibility
  app.get('/public/:token/calendar', async (request, reply) => {
    const token = (request.params as { token: string }).token;
    const valid = await validateToken(token);
    if (!valid) return reply.unauthorized();

    const entries = await prisma.rotaEntry.findMany({
      include: { clinician: true, duty: true },
      orderBy: [{ date: 'asc' }, { clinicianId: 'asc' }, { session: 'asc' }]
    });
    return entries;
  });

  app.get('/public/:token/ical', async (request, reply) => {
    const token = (request.params as { token: string }).token;
    const valid = await validateToken(token);
    if (!valid) return reply.unauthorized();

    const entries = await prisma.rotaEntry.findMany({ include: { clinician: true, duty: true } });
    const events = entries.map((e) => {
      const dateObj = new Date(e.date);
      const start: [number, number, number, number, number] = [
        dateObj.getFullYear(),
        dateObj.getMonth() + 1,
        dateObj.getDate(),
        9,
        0
      ];
      const title = `${e.clinician.name} - ${e.isOncall ? 'On-call' : e.duty?.name || 'Duty'}`;
      return {
        title,
        start,
        duration: { hours: 3 },
        description: `Session: ${e.session}`
      };
    });

    const { error, value } = ics.createEvents(events as ics.EventAttributes[]);
    if (error) {
      app.log.error(error);
      return reply.internalServerError();
    }
    reply.header('Content-Type', 'text/calendar');
    reply.send(value);
  });
}
