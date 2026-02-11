import { FastifyInstance } from 'fastify';
import { prisma } from '../prisma.js';
import { requireAuth } from '../utils/auth.js';
import { logAuditTx } from '../utils/audit.js';
import { z } from 'zod';

const slotsSchema = z.object({
  cycleLength: z.number().int().positive(),
  startDate: z.string().date().optional(),
  slots: z.array(
    z.object({
      position: z.number().int().positive(),
      clinicianId: z.number().int().positive()
    })
  )
});

export async function oncallRoutes(app: FastifyInstance) {
  app.get('/api/oncall-cycles', { preHandler: requireAuth }, async () => {
    const cycles = await prisma.oncallCycle.findMany({ orderBy: [{ role: 'asc' }, { position: 'asc' }] });
    return cycles;
  });

  app.put('/api/oncall-cycles', { preHandler: requireAuth }, async (request) => {
    const body = z
      .object({ consultant: slotsSchema.optional(), registrar: slotsSchema.optional() })
      .parse(request.body);

    await prisma.$transaction(async (tx) => {
      if (body.consultant) {
        await tx.oncallCycle.deleteMany({ where: { role: 'consultant' } });
        for (const slot of body.consultant.slots) {
          const created = await tx.oncallCycle.create({
            data: {
              role: 'consultant',
              cycleLength: body.consultant.cycleLength,
              position: slot.position,
              clinicianId: slot.clinicianId,
              startDate: body.consultant.startDate ? new Date(body.consultant.startDate) : new Date('2024-01-01')
            }
          });
          await logAuditTx(tx, {
            actorUserId: request.user?.sub,
            action: 'create',
            entity: 'oncallCycle',
            entityId: created.id,
            after: created
          });
        }
      }
      if (body.registrar) {
        await tx.oncallCycle.deleteMany({ where: { role: 'registrar' } });
        for (const slot of body.registrar.slots) {
          const created = await tx.oncallCycle.create({
            data: {
              role: 'registrar',
              cycleLength: body.registrar.cycleLength,
              position: slot.position,
              clinicianId: slot.clinicianId,
              startDate: body.registrar.startDate ? new Date(body.registrar.startDate) : new Date('2024-01-01')
            }
          });
          await logAuditTx(tx, {
            actorUserId: request.user?.sub,
            action: 'create',
            entity: 'oncallCycle',
            entityId: created.id,
            after: created
          });
        }
      }
    });

    return { ok: true };
  });
}
