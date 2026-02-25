import { FastifyInstance } from 'fastify';
import { prisma } from '../prisma.js';
import { requireAuth } from '../utils/auth.js';
import { logAudit } from '../utils/audit.js';
import { z } from 'zod';
import { Sessions, LeaveTypes, type Session } from '../types/enums.js';
import {
  detectCoverageNeedsForClinician,
  createCoverageRequests,
  cancelCoverageRequestsForLeave
} from '../services/coverageDetector.js';
import {
  detectConsultantImpact,
  detectConsultantImpactForRange,
  createConsultantCoverageRequests,
  cancelConsultantCoverageRequestsForLeave,
  restoreRegistrarEntriesForConsultant
} from '../services/consultantImpactDetector.js';

const leaveSchema = z.object({
  clinicianId: z.number(),
  date: z.coerce.date(),
  session: z.enum(Sessions),
  type: z.enum(LeaveTypes),
  note: z.string().optional()
});

const bulkLeaveSchema = z.object({
  clinicianId: z.number(),
  fromDate: z.coerce.date(),
  toDate: z.coerce.date(),
  session: z.enum(Sessions),
  type: z.enum(LeaveTypes),
  note: z.string().optional()
});

// Helper to generate dates between two dates (inclusive)
function getDateRange(from: Date, to: Date): Date[] {
  const dates: Date[] = [];
  const current = new Date(from);
  current.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);

  while (current <= end) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

export async function leaveRoutes(app: FastifyInstance) {
  app.get('/api/leaves', { preHandler: requireAuth }, async (request) => {
    const query = z
      .object({ from: z.string().optional(), to: z.string().optional() })
      .parse(request.query);
    const where: any = {};
    if (query.from || query.to) {
      where.date = {};
      if (query.from) where.date.gte = new Date(query.from);
      if (query.to) where.date.lte = new Date(query.to);
    }
    return prisma.leave.findMany({ where, include: { clinician: true }, orderBy: { date: 'asc' } });
  });

  app.post('/api/leaves', { preHandler: requireAuth }, async (request) => {
    const body = leaveSchema.parse(request.body);

    // Get the clinician to determine their role
    const clinician = await prisma.clinician.findUnique({
      where: { id: body.clinicianId }
    });

    const created = await prisma.leave.create({
      data: { ...body, date: body.date }
    });
    await logAudit({
      actorUserId: request.user?.sub,
      action: 'create',
      entity: 'leave',
      entityId: created.id,
      after: created
    });

    if (clinician?.role === 'registrar') {
      // Detect and create coverage requests for registrar leave
      const needs = await detectCoverageNeedsForClinician(body.clinicianId, body.date, body.date);
      if (needs.length > 0) {
        await createCoverageRequests(needs);
      }
    } else if (clinician?.role === 'consultant') {
      // Detect consultant impact: free registrars and create consultant coverage requests
      const { consultantNeeds, freedRegistrars } = await detectConsultantImpact(
        body.clinicianId,
        body.date,
        body.session,
        'leave'
      );

      if (consultantNeeds.length > 0) {
        await createConsultantCoverageRequests(consultantNeeds);
      }

      // Log freed registrars for audit trail
      if (freedRegistrars.length > 0) {
        await logAudit({
          actorUserId: request.user?.sub,
          action: 'consultant-leave-impact',
          entity: 'leave',
          entityId: created.id,
          after: { consultantId: body.clinicianId, freedRegistrars }
        });
      }
    }

    return created;
  });

  // Bulk create leave entries for a date range
  app.post('/api/leaves/bulk', { preHandler: requireAuth }, async (request) => {
    const body = bulkLeaveSchema.parse(request.body);
    const dates = getDateRange(body.fromDate, body.toDate);

    if (dates.length === 0) {
      return { created: [], count: 0 };
    }

    if (dates.length > 60) {
      throw new Error('Cannot create more than 60 days of leave at once');
    }

    const created: any[] = [];
    for (const date of dates) {
      // Skip weekends if desired (optional - currently creates for all days)
      try {
        const leave = await prisma.leave.create({
          data: {
            clinicianId: body.clinicianId,
            date,
            session: body.session,
            type: body.type,
            note: body.note,
          }
        });
        created.push(leave);
        await logAudit({
          actorUserId: request.user?.sub,
          action: 'create',
          entity: 'leave',
          entityId: leave.id,
          after: leave
        });
      } catch (err: any) {
        // Skip duplicates (unique constraint violation)
        if (err.code !== 'P2002') {
          throw err;
        }
      }
    }

    // Detect and create coverage requests for the date range
    if (created.length > 0) {
      // Get the clinician to determine their role
      const clinician = await prisma.clinician.findUnique({
        where: { id: body.clinicianId }
      });

      if (clinician?.role === 'registrar') {
        const needs = await detectCoverageNeedsForClinician(body.clinicianId, body.fromDate, body.toDate);
        if (needs.length > 0) {
          await createCoverageRequests(needs);
        }
      } else if (clinician?.role === 'consultant') {
        // Detect consultant impact for the date range
        const { consultantNeeds, freedRegistrars } = await detectConsultantImpactForRange(
          body.clinicianId,
          body.fromDate,
          body.toDate,
          body.session,
          'leave'
        );

        if (consultantNeeds.length > 0) {
          await createConsultantCoverageRequests(consultantNeeds);
        }

        // Log freed registrars for audit trail
        if (freedRegistrars.length > 0) {
          await logAudit({
            actorUserId: request.user?.sub,
            action: 'consultant-leave-impact',
            entity: 'leave',
            entityId: 0,
            after: { consultantId: body.clinicianId, freedRegistrars, dateRange: { from: body.fromDate, to: body.toDate } }
          });
        }
      }
    }

    return { created, count: created.length };
  });

  app.delete('/api/leaves/:id', { preHandler: requireAuth }, async (request) => {
    const id = Number((request.params as { id: string }).id);
    const before = await prisma.leave.findUnique({
      where: { id },
      include: { clinician: true }
    });

    if (before) {
      if (before.clinician.role === 'registrar') {
        // Cancel any coverage requests associated with this registrar leave
        await cancelCoverageRequestsForLeave(
          before.clinicianId,
          before.date,
          before.session as Session
        );
      } else if (before.clinician.role === 'consultant') {
        // Cancel consultant coverage requests
        await cancelConsultantCoverageRequestsForLeave(
          before.clinicianId,
          before.date,
          before.session as 'AM' | 'PM' | 'FULL'
        );

        // Restore registrar entries that were deleted when consultant took leave
        await restoreRegistrarEntriesForConsultant(
          before.clinicianId,
          before.date,
          before.session as 'AM' | 'PM' | 'FULL'
        );
      }
    }

    await prisma.leave.delete({ where: { id } });
    await logAudit({
      actorUserId: request.user?.sub,
      action: 'delete',
      entity: 'leave',
      entityId: id,
      before
    });
    return { ok: true };
  });
}
