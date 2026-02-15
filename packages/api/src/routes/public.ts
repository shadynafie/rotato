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

    // Parse optional clinician filter and date range
    const query = z
      .object({
        clinician: z.string().optional(),
        from: z.string().optional(),
        to: z.string().optional()
      })
      .parse(request.query);

    // Default to 3 months back and 6 months forward
    const today = new Date();
    const from = query.from
      ? new Date(query.from)
      : new Date(today.getFullYear(), today.getMonth() - 3, 1);
    const to = query.to
      ? new Date(query.to)
      : new Date(today.getFullYear(), today.getMonth() + 6, 0);

    // Normalize times
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);

    // Use computeSchedule for consistent data with UI
    const schedule = await computeSchedule(from, to);

    // Filter by clinician if specified
    const clinicianId = query.clinician ? parseInt(query.clinician, 10) : null;
    const filteredSchedule = clinicianId
      ? schedule.filter(e => e.clinicianId === clinicianId)
      : schedule;

    // Group entries by clinician+date to handle AM/PM sessions properly
    // For on-call, combine AM+PM into single all-day event
    const eventMap = new Map<string, {
      clinicianName: string;
      date: string;
      isOncall: boolean;
      isLeave: boolean;
      leaveType: string | null;
      dutyName: string | null;
      supportingClinicianName: string | null;
      sessions: string[];
    }>();

    for (const entry of filteredSchedule) {
      // Skip empty entries (no duty, not on-call, not on leave)
      if (!entry.dutyName && !entry.isOncall && !entry.isLeave) continue;

      const key = `${entry.clinicianId}-${entry.date}-${entry.isOncall}-${entry.isLeave}-${entry.dutyName || 'none'}-${entry.supportingClinicianName || 'none'}`;

      if (eventMap.has(key)) {
        eventMap.get(key)!.sessions.push(entry.session);
      } else {
        eventMap.set(key, {
          clinicianName: entry.clinicianName,
          date: entry.date,
          isOncall: entry.isOncall,
          isLeave: entry.isLeave,
          leaveType: entry.leaveType,
          dutyName: entry.dutyName,
          supportingClinicianName: entry.supportingClinicianName,
          sessions: [entry.session]
        });
      }
    }

    const events: ics.EventAttributes[] = [];

    for (const entry of eventMap.values()) {
      const [year, month, day] = entry.date.split('-').map(Number);
      const hasAM = entry.sessions.includes('AM');
      const hasPM = entry.sessions.includes('PM');
      const isFullDay = hasAM && hasPM;

      // Determine title
      let title: string;
      if (entry.isLeave) {
        const leaveLabel = entry.leaveType
          ? entry.leaveType.charAt(0).toUpperCase() + entry.leaveType.slice(1) + ' Leave'
          : 'Leave';
        title = clinicianId ? leaveLabel : `${entry.clinicianName} - ${leaveLabel}`;
      } else if (entry.isOncall) {
        title = clinicianId ? 'On-call' : `${entry.clinicianName} - On-call`;
      } else {
        // For duties, show supporting consultant name if present (e.g., "Nafie's Clinic")
        let dutyLabel = entry.dutyName || 'Duty';
        if (entry.supportingClinicianName) {
          dutyLabel = `${entry.supportingClinicianName}'s ${dutyLabel}`;
        }
        title = clinicianId ? dutyLabel : `${entry.clinicianName} - ${dutyLabel}`;
      }

      if (entry.isOncall || entry.isLeave) {
        // On-call and leave: create all-day event
        events.push({
          title,
          start: [year, month, day],
          end: [year, month, day + 1],
          description: clinicianId ? undefined : entry.clinicianName
        });
      } else if (isFullDay) {
        // Full day duty: 9:00-17:00
        events.push({
          title,
          start: [year, month, day, 9, 0],
          duration: { hours: 8 },
          description: clinicianId ? undefined : entry.clinicianName
        });
      } else {
        // Half day
        const startHour = hasAM ? 9 : 13;
        events.push({
          title: clinicianId ? title : `${title} (${hasAM ? 'AM' : 'PM'})`,
          start: [year, month, day, startHour, 0],
          duration: { hours: 4 },
          description: clinicianId ? undefined : entry.clinicianName
        });
      }
    }

    const { error, value } = ics.createEvents(events);
    if (error) {
      app.log.error(error);
      return reply.internalServerError();
    }
    reply.header('Content-Type', 'text/calendar');
    reply.send(value);
  });
}
