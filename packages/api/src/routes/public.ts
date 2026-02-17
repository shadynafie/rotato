import { FastifyInstance } from 'fastify';
import { prisma } from '../prisma.js';
import { computeSchedule } from '../services/scheduleComputer.js';
import { z } from 'zod';
import ics from 'ics';
import { formatLeaveLabel, formatDutyDisplay } from '../utils/formatters.js';

// Helper to get or create the default subscribe token
async function getSubscribeToken(): Promise<string> {
  const existing = await prisma.shareToken.findFirst({
    where: { description: 'Personal Calendar Subscriptions', active: true }
  });
  if (existing) return existing.token;

  // Create a dedicated token for personal subscriptions
  const token = crypto.randomUUID().replace(/-/g, '');
  await prisma.shareToken.create({
    data: {
      token,
      description: 'Personal Calendar Subscriptions',
      active: true
    }
  });
  return token;
}

async function validateToken(token: string) {
  // Find token by unique field, then verify it's active
  const record = await prisma.shareToken.findUnique({ where: { token } });
  if (!record || !record.active) return null;
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

    const events: ics.EventAttributes[] = [];

    for (const entry of filteredSchedule) {
      // Skip empty entries (no duty, not on-call, not on leave)
      if (!entry.dutyName && !entry.isOncall && !entry.isLeave) continue;

      const [year, month, day] = entry.date.split('-').map(Number);
      const isAM = entry.session === 'AM';

      // Determine title
      let title: string;
      if (entry.isLeave) {
        const leaveLabel = formatLeaveLabel(entry.leaveType);
        title = clinicianId ? leaveLabel : `${entry.clinicianName} - ${leaveLabel}`;
      } else if (entry.isOncall) {
        title = clinicianId ? 'On-call' : `${entry.clinicianName} - On-call`;
      } else {
        // For duties, show supporting consultant surname if present (e.g., "Nafie Clinic")
        const dutyLabel = formatDutyDisplay(entry.dutyName || 'Duty', entry.supportingClinicianName);
        title = clinicianId ? dutyLabel : `${entry.clinicianName} - ${dutyLabel}`;
      }

      if (entry.isOncall || entry.isLeave) {
        // On-call and leave: create all-day event (but only once per day)
        // Skip PM to avoid duplicate all-day events
        if (isAM) {
          events.push({
            title,
            start: [year, month, day],
            end: [year, month, day + 1],
            description: clinicianId ? undefined : entry.clinicianName
          });
        }
      } else {
        // Always create separate AM and PM events
        const startHour = isAM ? 9 : 13;
        events.push({
          title,
          start: [year, month, day, startHour, 0],
          startInputType: 'local',
          startOutputType: 'local',
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
    reply.header('Content-Type', 'text/calendar; charset=utf-8');
    reply.header('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
    reply.header('Pragma', 'no-cache');
    reply.header('Expires', '0');
    reply.send(value);
  });

  // ============================================
  // SUBSCRIBE FLOW (QR Code Onboarding)
  // ============================================

  // Get active clinicians grouped by role (no auth required)
  app.get('/subscribe/clinicians', async () => {
    const clinicians = await prisma.clinician.findMany({
      where: { active: true },
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' }
    });

    const consultants = clinicians.filter(c => c.role === 'consultant');
    const registrars = clinicians.filter(c => c.role === 'registrar');

    return { consultants, registrars };
  });

  // Get a specific clinician by ID (for subscribe page)
  app.get('/subscribe/clinicians/:id', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const clinician = await prisma.clinician.findUnique({
      where: { id, active: true },
      select: { id: true, name: true, role: true }
    });

    if (!clinician) {
      return reply.notFound('Clinician not found');
    }

    return clinician;
  });

  // Get the share token for personal calendar subscriptions
  // URL is built client-side using window.location.origin
  app.get('/subscribe/token', async () => {
    const token = await getSubscribeToken();
    return { token };
  });
}
