import { FastifyInstance } from 'fastify';
import { prisma } from '../prisma.js';
import { requireAuth } from '../utils/auth.js';
import { logAudit } from '../utils/audit.js';
import { z } from 'zod';

const dutySchema = z.object({
  name: z.string(),
  color: z.string().optional(),
  requiresCoverage: z.boolean().optional(),
  active: z.boolean().optional()
});

export async function dutyRoutes(app: FastifyInstance) {
  app.get('/api/duties', { preHandler: requireAuth }, async () => {
    return prisma.duty.findMany({ orderBy: { name: 'asc' } });
  });

  app.post('/api/duties', { preHandler: requireAuth }, async (request) => {
    const body = dutySchema.parse(request.body);
    const created = await prisma.duty.create({ data: body });
    await logAudit({ actorUserId: request.user?.sub, action: 'create', entity: 'duty', entityId: created.id, after: created });
    return created;
  });

  app.patch('/api/duties/:id', { preHandler: requireAuth }, async (request) => {
    const id = Number((request.params as { id: string }).id);
    const body = dutySchema.partial().parse(request.body);
    const before = await prisma.duty.findUnique({ where: { id } });
    const updated = await prisma.duty.update({ where: { id }, data: body });
    await logAudit({ actorUserId: request.user?.sub, action: 'update', entity: 'duty', entityId: id, before, after: updated });
    return updated;
  });

  app.delete('/api/duties/:id', { preHandler: requireAuth }, async (request) => {
    const id = Number((request.params as { id: string }).id);
    const before = await prisma.duty.findUnique({ where: { id } });

    // Delete in transaction - set references to null before deleting
    await prisma.$transaction(async (tx) => {
      // Remove duty references from job plans (set to null)
      await tx.jobPlanWeek.updateMany({ where: { amDutyId: id }, data: { amDutyId: null } });
      await tx.jobPlanWeek.updateMany({ where: { pmDutyId: id }, data: { pmDutyId: null } });
      // Remove duty references from rota entries (set to null)
      await tx.rotaEntry.updateMany({ where: { dutyId: id }, data: { dutyId: null } });
      // Delete coverage requests for this duty
      await tx.coverageRequest.deleteMany({ where: { dutyId: id } });
      // Finally delete the duty
      await tx.duty.delete({ where: { id } });
    });

    await logAudit({ actorUserId: request.user?.sub, action: 'delete', entity: 'duty', entityId: id, before });
    return { ok: true };
  });
}
