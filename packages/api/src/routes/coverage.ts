import { FastifyInstance } from 'fastify';
import { prisma } from '../prisma.js';
import { requireAuth } from '../utils/auth.js';
import { logAudit } from '../utils/audit.js';
import { z } from 'zod';
import {
  detectCoverageNeeds,
  createCoverageRequests,
  getPendingCoverageCount
} from '../services/coverageDetector.js';
import {
  getSuggestedRegistrars,
  autoAssignCoverage,
  bulkAutoAssign
} from '../services/coverageSuggester.js';

const coverageCreateSchema = z.object({
  date: z.string().transform((s) => new Date(s)),
  session: z.enum(['AM', 'PM']),
  consultantId: z.number(),
  dutyId: z.number(),
  reason: z.enum(['leave', 'oncall_conflict', 'manual']),
  note: z.string().optional()
});

const coverageUpdateSchema = z.object({
  status: z.enum(['pending', 'assigned', 'cancelled']).optional(),
  assignedRegistrarId: z.number().nullable().optional(),
  note: z.string().optional()
});

const dateRangeSchema = z.object({
  from: z.string().transform((s) => new Date(s)),
  to: z.string().transform((s) => new Date(s))
});

export async function coverageRoutes(app: FastifyInstance) {
  // Get coverage requests with optional filters
  app.get('/api/coverage', { preHandler: requireAuth }, async (request) => {
    const query = z.object({
      from: z.string().optional(),
      to: z.string().optional(),
      status: z.enum(['pending', 'assigned', 'cancelled']).optional(),
      consultantId: z.string().optional(),
      registrarId: z.string().optional()
    }).parse(request.query);

    const where: any = {};

    if (query.from || query.to) {
      where.date = {};
      if (query.from) where.date.gte = new Date(query.from);
      if (query.to) where.date.lte = new Date(query.to);
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.consultantId) {
      where.consultantId = parseInt(query.consultantId, 10);
    }

    if (query.registrarId) {
      where.assignedRegistrarId = parseInt(query.registrarId, 10);
    }

    return prisma.coverageRequest.findMany({
      where,
      include: {
        consultant: true,
        duty: true,
        assignedRegistrar: true
      },
      orderBy: [{ date: 'asc' }, { session: 'asc' }]
    });
  });

  // Get pending coverage count (for badge in nav)
  app.get('/api/coverage/pending-count', { preHandler: requireAuth }, async () => {
    const count = await getPendingCoverageCount();
    return { count };
  });

  // Get available registrars for a specific date/session
  app.get('/api/coverage/available-registrars', { preHandler: requireAuth }, async (request) => {
    const query = z.object({
      date: z.string(),
      session: z.enum(['AM', 'PM'])
    }).parse(request.query);

    const date = new Date(query.date);

    // Get all active registrars
    const registrars = await prisma.clinician.findMany({
      where: { role: 'registrar', active: true },
      orderBy: { name: 'asc' }
    });

    // Get registrars who are on leave for this date/session
    const onLeave = await prisma.leave.findMany({
      where: {
        date,
        OR: [
          { session: query.session },
          { session: 'FULL' }
        ],
        clinician: { role: 'registrar' }
      },
      select: { clinicianId: true }
    });
    const onLeaveIds = new Set(onLeave.map(l => l.clinicianId));

    // Get registrars already assigned to other coverage on this date/session
    const alreadyAssigned = await prisma.coverageRequest.findMany({
      where: {
        date,
        session: query.session,
        status: 'assigned',
        assignedRegistrarId: { not: null }
      },
      select: { assignedRegistrarId: true }
    });
    const assignedIds = new Set(alreadyAssigned.map(a => a.assignedRegistrarId));

    // Filter to available registrars
    const available = registrars.filter(r => !onLeaveIds.has(r.id) && !assignedIds.has(r.id));

    return available;
  });

  // Create a manual coverage request
  app.post('/api/coverage', { preHandler: requireAuth }, async (request) => {
    const body = coverageCreateSchema.parse(request.body);

    const created = await prisma.coverageRequest.create({
      data: {
        ...body,
        status: 'pending'
      },
      include: {
        consultant: true,
        duty: true
      }
    });

    await logAudit({
      actorUserId: request.user?.sub,
      action: 'create',
      entity: 'coverageRequest',
      entityId: created.id,
      after: created
    });

    return created;
  });

  // Update a coverage request (assign registrar, change status)
  app.patch('/api/coverage/:id', { preHandler: requireAuth }, async (request) => {
    const id = Number((request.params as { id: string }).id);
    const body = coverageUpdateSchema.parse(request.body);

    const before = await prisma.coverageRequest.findUnique({ where: { id } });

    const updateData: any = { ...body };

    // If assigning a registrar, also set status to assigned and record assignment time
    if (body.assignedRegistrarId !== undefined && body.assignedRegistrarId !== null) {
      updateData.status = 'assigned';
      updateData.assignedAt = new Date();
      const sub = request.user?.sub;
      updateData.assignedBy = typeof sub === 'number' ? sub : (typeof sub === 'string' ? parseInt(sub, 10) : null);
    }

    // If unassigning (setting to null), revert to pending
    if (body.assignedRegistrarId === null && before?.assignedRegistrarId !== null) {
      updateData.status = 'pending';
      updateData.assignedAt = null;
      updateData.assignedBy = null;
    }

    const updated = await prisma.coverageRequest.update({
      where: { id },
      data: updateData,
      include: {
        consultant: true,
        duty: true,
        assignedRegistrar: true
      }
    });

    await logAudit({
      actorUserId: request.user?.sub,
      action: 'update',
      entity: 'coverageRequest',
      entityId: id,
      before,
      after: updated
    });

    return updated;
  });

  // Cancel a coverage request
  app.delete('/api/coverage/:id', { preHandler: requireAuth }, async (request) => {
    const id = Number((request.params as { id: string }).id);

    const before = await prisma.coverageRequest.findUnique({ where: { id } });

    const updated = await prisma.coverageRequest.update({
      where: { id },
      data: { status: 'cancelled' }
    });

    await logAudit({
      actorUserId: request.user?.sub,
      action: 'update',
      entity: 'coverageRequest',
      entityId: id,
      before,
      after: updated
    });

    return { ok: true };
  });

  // Auto-detect coverage needs for a date range
  app.post('/api/coverage/detect', { preHandler: requireAuth }, async (request) => {
    const body = dateRangeSchema.parse(request.body);

    const needs = await detectCoverageNeeds(body.from, body.to);
    const created = await createCoverageRequests(needs);

    return {
      detected: needs.length,
      created,
      message: `Detected ${needs.length} coverage needs, created ${created} new requests`
    };
  });

  // Get smart suggestions for a coverage request
  app.get('/api/coverage/:id/suggestions', { preHandler: requireAuth }, async (request) => {
    const id = Number((request.params as { id: string }).id);

    const coverageRequest = await prisma.coverageRequest.findUnique({
      where: { id }
    });

    if (!coverageRequest) {
      return { suggestions: [], error: 'Coverage request not found' };
    }

    const suggestions = await getSuggestedRegistrars({
      date: new Date(coverageRequest.date),
      session: coverageRequest.session as 'AM' | 'PM'
    });

    return { suggestions };
  });

  // Get smart suggestions for a specific date/session (without coverage request)
  app.get('/api/coverage/suggestions', { preHandler: requireAuth }, async (request) => {
    const query = z.object({
      date: z.string(),
      session: z.enum(['AM', 'PM'])
    }).parse(request.query);

    const suggestions = await getSuggestedRegistrars({
      date: new Date(query.date),
      session: query.session
    });

    return { suggestions };
  });

  // Auto-assign best registrar to a coverage request
  app.post('/api/coverage/:id/auto-assign', { preHandler: requireAuth }, async (request) => {
    const id = Number((request.params as { id: string }).id);

    const result = await autoAssignCoverage(id);

    if (result.success) {
      await logAudit({
        actorUserId: request.user?.sub,
        action: 'auto-assign',
        entity: 'coverageRequest',
        entityId: id,
        after: { assignedTo: result.assignedTo }
      });
    }

    return result;
  });

  // Bulk auto-assign all pending coverage requests
  app.post('/api/coverage/bulk-auto-assign', { preHandler: requireAuth }, async (request) => {
    const result = await bulkAutoAssign();

    await logAudit({
      actorUserId: request.user?.sub,
      action: 'bulk-auto-assign',
      entity: 'coverageRequest',
      entityId: 0,
      after: { assigned: result.assigned, failed: result.failed }
    });

    return result;
  });

  // Cleanup orphaned coverage requests (those with reason='leave' but no matching leave entry)
  app.post('/api/coverage/cleanup-orphaned', { preHandler: requireAuth }, async (request) => {
    // Find all leave-based coverage requests
    const coverageRequests = await prisma.coverageRequest.findMany({
      where: {
        reason: 'leave',
        status: 'pending'
      }
    });

    let deleted = 0;
    for (const cr of coverageRequests) {
      // Check if there's a matching leave for this coverage request
      const matchingLeave = await prisma.leave.findFirst({
        where: {
          date: cr.date,
          OR: [
            { session: cr.session },
            { session: 'FULL' }
          ],
          clinician: { role: 'registrar' }
        }
      });

      // If no matching leave exists, delete the coverage request
      if (!matchingLeave) {
        await prisma.coverageRequest.delete({ where: { id: cr.id } });
        await logAudit({
          actorUserId: request.user?.sub,
          action: 'delete',
          entity: 'coverageRequest',
          entityId: cr.id,
          before: cr
        });
        deleted++;
      }
    }

    return {
      checked: coverageRequests.length,
      deleted,
      message: `Cleaned up ${deleted} orphaned coverage requests`
    };
  });

  // Hard delete a coverage request (permanently remove)
  app.delete('/api/coverage/:id/permanent', { preHandler: requireAuth }, async (request) => {
    const id = Number((request.params as { id: string }).id);

    const before = await prisma.coverageRequest.findUnique({ where: { id } });
    if (!before) {
      return { ok: false, message: 'Coverage request not found' };
    }

    await prisma.coverageRequest.delete({ where: { id } });

    await logAudit({
      actorUserId: request.user?.sub,
      action: 'delete',
      entity: 'coverageRequest',
      entityId: id,
      before
    });

    return { ok: true };
  });
}
