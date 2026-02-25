import { FastifyInstance } from 'fastify';
import { prisma } from '../prisma.js';
import { requireAuth } from '../utils/auth.js';
import { z } from 'zod';
import { generateRota } from '../services/rotaGenerator.js';
import { RotaSources } from '../types/enums.js';
import { logAudit } from '../utils/audit.js';
import { sendChangeNotification } from '../utils/notifications.js';
import { detectCoverageNeeds, createCoverageRequests } from '../services/coverageDetector.js';

export async function rotaRoutes(app: FastifyInstance) {
  app.get('/api/rota', { preHandler: requireAuth }, async (request) => {
    const query = z
      .object({
        from: z.string().optional(),
        to: z.string().optional(),
        clinicianId: z.string().optional(),
        role: z.enum(['consultant', 'registrar']).optional()
      })
      .parse(request.query);

    const where: any = {};
    if (query.from || query.to) {
      where.date = {};
      if (query.from) where.date.gte = new Date(query.from);
      if (query.to) where.date.lte = new Date(query.to);
    }
    if (query.clinicianId) where.clinicianId = Number(query.clinicianId);
    if (query.role) where.clinician = { role: query.role };

    return prisma.rotaEntry.findMany({
      where,
      include: { clinician: true, duty: true },
      orderBy: [{ date: 'asc' }, { clinicianId: 'asc' }, { session: 'asc' }]
    });
  });

  app.post('/api/rota/generate', { preHandler: requireAuth }, async (request) => {
    const body = z
      .object({ from: z.coerce.date(), to: z.coerce.date() })
      .parse(request.body);

    await generateRota(body.from, body.to);

    // After rota generation, detect and create coverage requests for existing leaves
    const coverageNeeds = await detectCoverageNeeds(body.from, body.to);
    const created = await createCoverageRequests(coverageNeeds);

    return { ok: true, coverageRequestsCreated: created };
  });

  // Create or update a manual override
  app.post('/api/rota/override', { preHandler: requireAuth }, async (request) => {
    const body = z
      .object({
        clinicianId: z.number(),
        date: z.coerce.date(),
        session: z.enum(['AM', 'PM']),
        dutyId: z.number().nullable().optional(),
        isOncall: z.boolean().optional(),
        note: z.string().nullable().optional(),
        supportingClinicianId: z.number().nullable().optional()
      })
      .parse(request.body);

    // Check if an entry already exists for this clinician/date/session
    const existing = await prisma.rotaEntry.findUnique({
      where: {
        date_clinicianId_session: {
          date: body.date,
          clinicianId: body.clinicianId,
          session: body.session
        }
      }
    });

    let result;
    if (existing) {
      // Update existing entry
      const before = existing;
      result = await prisma.rotaEntry.update({
        where: { id: existing.id },
        data: {
          dutyId: body.dutyId ?? null,
          isOncall: body.isOncall ?? false,
          note: body.note ?? null,
          supportingClinicianId: body.supportingClinicianId ?? null,
          source: 'manual',
          updatedBy: request.user?.sub
        }
      });
      await logAudit({
        actorUserId: request.user?.sub,
        action: 'update',
        entity: 'rotaEntry',
        entityId: existing.id,
        before,
        after: result
      });
    } else {
      // Create new entry
      result = await prisma.rotaEntry.create({
        data: {
          clinicianId: body.clinicianId,
          date: body.date,
          session: body.session,
          dutyId: body.dutyId ?? null,
          isOncall: body.isOncall ?? false,
          note: body.note ?? null,
          supportingClinicianId: body.supportingClinicianId ?? null,
          source: 'manual',
          createdBy: request.user?.sub
        }
      });
      await logAudit({
        actorUserId: request.user?.sub,
        action: 'create',
        entity: 'rotaEntry',
        entityId: result.id,
        after: result
      });
    }

    if (result?.clinicianId) {
      await sendChangeNotification(result.clinicianId, { rotaEntryId: result.id, date: result.date });
    }
    return result;
  });

  // Delete a manual override (revert to computed schedule)
  app.delete('/api/rota/override', { preHandler: requireAuth }, async (request) => {
    const query = z
      .object({
        clinicianId: z.coerce.number(),
        date: z.string(),
        session: z.enum(['AM', 'PM'])
      })
      .parse(request.query);

    const existing = await prisma.rotaEntry.findUnique({
      where: {
        date_clinicianId_session: {
          date: new Date(query.date),
          clinicianId: query.clinicianId,
          session: query.session
        }
      }
    });

    if (existing && existing.source === 'manual') {
      await prisma.rotaEntry.delete({ where: { id: existing.id } });
      await logAudit({
        actorUserId: request.user?.sub,
        action: 'delete',
        entity: 'rotaEntry',
        entityId: existing.id,
        before: existing
      });
      return { ok: true, deleted: true };
    }

    return { ok: true, deleted: false };
  });

  app.patch('/api/rota/:id', { preHandler: requireAuth }, async (request) => {
    const id = Number((request.params as { id: string }).id);
    const body = z
      .object({
        dutyId: z.number().nullable().optional(),
        isOncall: z.boolean().optional(),
        source: z.enum(RotaSources).optional(),
        note: z.string().nullable().optional()
      })
      .parse(request.body);

    const updateData: any = { ...body };
    if (body.dutyId === undefined) delete updateData.dutyId;
    if (body.note === undefined) delete updateData.note;

    const before = await prisma.rotaEntry.findUnique({ where: { id } });
    const updated = await prisma.rotaEntry.update({ where: { id }, data: updateData });
    await logAudit({
      actorUserId: request.user?.sub,
      action: 'update',
      entity: 'rotaEntry',
      entityId: id,
      before,
      after: updated
    });
    if (updated?.clinicianId) {
      await sendChangeNotification(updated.clinicianId, { rotaEntryId: updated.id, date: updated.date });
    }
    return updated;
  });
}
