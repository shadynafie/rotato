import { FastifyInstance } from 'fastify';
import { prisma } from '../prisma.js';
import { requireAuth } from '../utils/auth.js';
import { logAudit } from '../utils/audit.js';
import { z } from 'zod';

const clinicianBaseSchema = z.object({
  name: z.string(),
  role: z.enum(['consultant', 'registrar']),
  grade: z.enum(['junior', 'senior']).nullable().optional(),
  email: z.string().email().optional(),
  notifyEmail: z.boolean().optional(),
  notifyWhatsapp: z.boolean().optional(),
  active: z.boolean().optional()
});

// For create: apply validation that grade is only for registrars
const clinicianCreateSchema = clinicianBaseSchema.refine((data) => {
  if (data.role === 'consultant' && data.grade) {
    return false;
  }
  return true;
}, { message: 'Grade can only be set for registrars' });

// For update: partial schema without the refinement (validation done in handler)
const clinicianUpdateSchema = clinicianBaseSchema.partial();

export async function clinicianRoutes(app: FastifyInstance) {
  app.get('/api/clinicians', { preHandler: requireAuth }, async () => {
    // Consultants first, then registrars; each block alphabetized.
    return prisma.clinician.findMany({ orderBy: [{ role: 'asc' }, { name: 'asc' }] });
  });

  app.post('/api/clinicians', { preHandler: requireAuth }, async (request) => {
    const body = clinicianCreateSchema.parse(request.body);
    const created = await prisma.clinician.create({ data: body });
    await logAudit({ actorUserId: request.user?.sub, action: 'create', entity: 'clinician', entityId: created.id, after: created });
    return created;
  });

  app.patch('/api/clinicians/:id', { preHandler: requireAuth }, async (request) => {
    const id = Number((request.params as { id: string }).id);
    const body = clinicianUpdateSchema.parse(request.body);
    const before = await prisma.clinician.findUnique({ where: { id } });
    const updated = await prisma.clinician.update({ where: { id }, data: body });
    await logAudit({ actorUserId: request.user?.sub, action: 'update', entity: 'clinician', entityId: id, before, after: updated });
    return updated;
  });

  app.delete('/api/clinicians/:id', { preHandler: requireAuth }, async (request) => {
    const id = Number((request.params as { id: string }).id);
    const before = await prisma.clinician.findUnique({ where: { id } });

    // Delete in transaction to handle foreign key constraints
    await prisma.$transaction(async (tx) => {
      // Delete related records first
      await tx.jobPlanWeek.deleteMany({ where: { clinicianId: id } });
      await tx.oncallCycle.deleteMany({ where: { clinicianId: id } });
      await tx.rotaEntry.deleteMany({ where: { clinicianId: id } });
      await tx.leave.deleteMany({ where: { clinicianId: id } });
      await tx.notification.deleteMany({ where: { clinicianId: id } });
      // Delete coverage requests (as consultant or assigned registrar)
      await tx.coverageRequest.deleteMany({ where: { consultantId: id } });
      await tx.coverageRequest.deleteMany({ where: { assignedRegistrarId: id } });
      // Finally delete the clinician
      await tx.clinician.delete({ where: { id } });
    });

    await logAudit({ actorUserId: request.user?.sub, action: 'delete', entity: 'clinician', entityId: id, before });
    return { ok: true };
  });
}
