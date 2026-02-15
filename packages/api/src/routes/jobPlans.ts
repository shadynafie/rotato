import { FastifyInstance } from 'fastify';
import { prisma } from '../prisma.js';
import { requireAuth } from '../utils/auth.js';
import { logAuditTx } from '../utils/audit.js';
import { z } from 'zod';

const jobPlanItem = z.object({
  clinicianId: z.number(),
  weekNo: z.number().int().min(1).max(5),
  dayOfWeek: z.number().int().min(1).max(5), // 1=Monday, 2=Tuesday, etc.
  amDutyId: z.number().optional().nullable(),
  pmDutyId: z.number().optional().nullable(),
  // For registrars: which consultant they support for this duty (null = independent duty)
  amSupportingClinicianId: z.number().optional().nullable(),
  pmSupportingClinicianId: z.number().optional().nullable(),
  notes: z.string().optional().nullable()
});

export async function jobPlanRoutes(app: FastifyInstance) {
  app.get('/api/job-plans', { preHandler: requireAuth }, async () => {
    return prisma.jobPlanWeek.findMany({
      include: { amDuty: true, pmDuty: true },
      orderBy: [{ clinicianId: 'asc' }, { weekNo: 'asc' }, { dayOfWeek: 'asc' }]
    });
  });

  app.put('/api/job-plans', { preHandler: requireAuth }, async (request) => {
    const items = z.array(jobPlanItem).parse(request.body);
    await prisma.$transaction(async (tx) => {
      for (const item of items) {
        const where = {
          clinicianId_weekNo_dayOfWeek: {
            clinicianId: item.clinicianId,
            weekNo: item.weekNo,
            dayOfWeek: item.dayOfWeek
          }
        };

        const before = await tx.jobPlanWeek.findUnique({ where });
        const result = await tx.jobPlanWeek.upsert({
          where,
          update: {
            amDutyId: item.amDutyId ?? null,
            pmDutyId: item.pmDutyId ?? null,
            amSupportingClinicianId: item.amSupportingClinicianId ?? null,
            pmSupportingClinicianId: item.pmSupportingClinicianId ?? null,
            notes: item.notes ?? null
          },
          create: {
            clinicianId: item.clinicianId,
            weekNo: item.weekNo,
            dayOfWeek: item.dayOfWeek,
            amDutyId: item.amDutyId ?? null,
            pmDutyId: item.pmDutyId ?? null,
            amSupportingClinicianId: item.amSupportingClinicianId ?? null,
            pmSupportingClinicianId: item.pmSupportingClinicianId ?? null,
            notes: item.notes ?? null
          }
        });

        await logAuditTx(tx, {
          actorUserId: request.user?.sub,
          action: before ? 'update' : 'create',
          entity: 'jobPlanWeek',
          entityId: result.id,
          before,
          after: result
        });
      }
    });
    return { ok: true };
  });
}
