import { FastifyInstance } from 'fastify';
import { prisma } from '../prisma.js';
import { requireAuth } from '../utils/auth.js';
import { logAudit, logAuditTx } from '../utils/audit.js';
import { z } from 'zod';

// Validation schemas
const roleSchema = z.enum(['consultant', 'registrar']);

const configUpdateSchema = z.object({
  startDate: z.string().date().optional(),
  cycleLength: z.number().int().positive().optional(),
});

const slotCreateSchema = z.object({
  role: z.enum(['consultant', 'registrar']),
  name: z.string().optional(),  // Auto-generated if not provided
});

const assignmentCreateSchema = z.object({
  slotId: z.number().int().positive(),
  clinicianId: z.number().int().positive(),
  effectiveFrom: z.string().date(),
  effectiveTo: z.string().date().optional().nullable(),
});

const assignmentUpdateSchema = z.object({
  effectiveTo: z.string().date().nullable(),
});

// Dynamic pattern - no fixed length constraint
const patternUpdateSchema = z.object({
  pattern: z.array(
    z.object({
      dayOfCycle: z.number().int().min(1),
      slotPosition: z.number().int().min(1),
    })
  ).min(1),  // At least 1 entry, length should match cycleLength
});

// Helper to check for overlapping assignments
async function hasOverlappingAssignment(
  slotId: number,
  effectiveFrom: Date,
  effectiveTo: Date | null,
  excludeId?: number
): Promise<boolean> {
  const endDate = effectiveTo ?? new Date('9999-12-31');

  const overlapping = await prisma.slotAssignment.findFirst({
    where: {
      slotId,
      id: excludeId ? { not: excludeId } : undefined,
      effectiveFrom: { lt: endDate },
      OR: [
        { effectiveTo: null },
        { effectiveTo: { gt: effectiveFrom } },
      ],
    },
  });

  return !!overlapping;
}

export async function oncallSlotsRoutes(app: FastifyInstance) {
  // ============================================
  // SLOTS
  // ============================================

  // GET /api/oncall-slots - Get all slots with current assignments
  app.get('/api/oncall-slots', { preHandler: requireAuth }, async () => {
    const slots = await prisma.onCallSlot.findMany({
      where: { active: true },
      include: {
        assignments: {
          include: { clinician: true },
          orderBy: { effectiveFrom: 'desc' },
        },
      },
      orderBy: [{ role: 'asc' }, { position: 'asc' }],
    });

    // Add currentAssignment helper field
    const today = new Date();
    const slotsWithCurrent = slots.map(slot => {
      const currentAssignment = slot.assignments.find(
        a => a.effectiveFrom <= today && (a.effectiveTo === null || a.effectiveTo >= today)
      );
      return {
        ...slot,
        currentAssignment: currentAssignment ?? null,
      };
    });

    // Group by role
    const consultantSlots = slotsWithCurrent.filter(s => s.role === 'consultant');
    const registrarSlots = slotsWithCurrent.filter(s => s.role === 'registrar');

    return { consultant: consultantSlots, registrar: registrarSlots };
  });

  // POST /api/oncall-slots - Create a new slot
  app.post('/api/oncall-slots', { preHandler: requireAuth }, async (request) => {
    const body = slotCreateSchema.parse(request.body);

    // Get all slots for this role
    const allSlots = await prisma.onCallSlot.findMany({
      where: { role: body.role },
      orderBy: { position: 'asc' },
    });

    const activeSlots = allSlots.filter(s => s.active);
    const activePositions = new Set(activeSlots.map(s => s.position));

    // Find the lowest available position (reuse gaps from deleted slots)
    let nextPosition = 1;
    while (activePositions.has(nextPosition)) {
      nextPosition++;
    }

    // Check if there's an inactive slot with this position we can reactivate
    const inactiveSlotToReactivate = allSlots.find(s => !s.active && s.position === nextPosition);

    let created;
    if (inactiveSlotToReactivate) {
      // Reactivate the existing slot
      created = await prisma.onCallSlot.update({
        where: { id: inactiveSlotToReactivate.id },
        data: { active: true },
      });
    } else {
      // Auto-generate name if not provided
      const name = body.name || `${body.role === 'consultant' ? 'Consultant' : 'Registrar'} ${String(nextPosition).padStart(2, '0')}`;

      created = await prisma.onCallSlot.create({
        data: {
          name,
          role: body.role,
          position: nextPosition,
          active: true,
        },
      });
    }

    // Auto-update cycle length based on new active slot count
    const newSlotCount = activeSlots.length + 1;
    const newCycleLength = body.role === 'consultant' ? newSlotCount : newSlotCount * 7;
    await prisma.onCallConfig.upsert({
      where: { role: body.role },
      update: { cycleLength: newCycleLength },
      create: {
        role: body.role,
        cycleLength: newCycleLength,
        startDate: new Date(),
        unitType: body.role === 'consultant' ? 'week' : 'day',
      },
    });

    await logAudit({
      actorUserId: request.user?.sub,
      action: 'create',
      entity: 'onCallSlot',
      entityId: created.id,
      after: created,
    });

    return created;
  });

  // DELETE /api/oncall-slots/:id - Delete a slot (soft-delete by setting active=false)
  app.delete<{ Params: { id: string } }>(
    '/api/oncall-slots/:id',
    { preHandler: requireAuth },
    async (request) => {
      const id = Number(request.params.id);

      const slot = await prisma.onCallSlot.findUnique({ where: { id } });
      if (!slot) {
        throw app.httpErrors.notFound('Slot not found');
      }

      // Check if slot has any current or future assignments
      const today = new Date();
      const activeAssignments = await prisma.slotAssignment.findFirst({
        where: {
          slotId: id,
          OR: [
            { effectiveTo: null },
            { effectiveTo: { gte: today } },
          ],
        },
      });

      if (activeAssignments) {
        throw app.httpErrors.badRequest(
          'Cannot delete slot with active or future assignments. End all assignments first.'
        );
      }

      // Soft delete - set active=false
      const updated = await prisma.onCallSlot.update({
        where: { id },
        data: { active: false },
      });

      // Auto-update cycle length based on remaining active slots
      const remainingSlots = await prisma.onCallSlot.count({
        where: { role: slot.role, active: true },
      });
      const newCycleLength = slot.role === 'consultant' ? remainingSlots : remainingSlots * 7;
      await prisma.onCallConfig.update({
        where: { role: slot.role },
        data: { cycleLength: Math.max(1, newCycleLength) }, // Minimum 1
      });

      await logAudit({
        actorUserId: request.user?.sub,
        action: 'delete',
        entity: 'onCallSlot',
        entityId: id,
        before: slot,
        after: updated,
      });

      return { ok: true };
    }
  );

  // ============================================
  // CONFIG
  // ============================================

  // GET /api/oncall-config - Get config for both roles
  app.get('/api/oncall-config', { preHandler: requireAuth }, async () => {
    const configs = await prisma.onCallConfig.findMany();
    const result: Record<string, typeof configs[0] | null> = {
      consultant: configs.find(c => c.role === 'consultant') ?? null,
      registrar: configs.find(c => c.role === 'registrar') ?? null,
    };
    return result;
  });

  // PUT /api/oncall-config/:role - Update config for a role
  app.put<{ Params: { role: string } }>(
    '/api/oncall-config/:role',
    { preHandler: requireAuth },
    async (request) => {
      const role = roleSchema.parse(request.params.role);
      const body = configUpdateSchema.parse(request.body);

      const before = await prisma.onCallConfig.findUnique({ where: { role } });

      const updateData: { startDate?: Date; cycleLength?: number } = {};
      if (body.startDate) {
        updateData.startDate = new Date(body.startDate);
      }
      if (body.cycleLength !== undefined) {
        updateData.cycleLength = body.cycleLength;
      }

      const updated = await prisma.onCallConfig.update({
        where: { role },
        data: updateData,
      });

      await logAudit({
        actorUserId: request.user?.sub,
        action: 'update',
        entity: 'onCallConfig',
        entityId: updated.id,
        before,
        after: updated,
      });

      return updated;
    }
  );

  // ============================================
  // PATTERN (Registrars only)
  // ============================================

  // GET /api/oncall-pattern - Get the 49-day registrar pattern
  app.get('/api/oncall-pattern', { preHandler: requireAuth }, async () => {
    const patterns = await prisma.onCallPattern.findMany({
      where: { role: 'registrar' },
      include: { slot: true },
      orderBy: { dayOfCycle: 'asc' },
    });
    return patterns;
  });

  // PUT /api/oncall-pattern - Bulk update the registrar pattern
  app.put('/api/oncall-pattern', { preHandler: requireAuth }, async (request) => {
    const body = patternUpdateSchema.parse(request.body);

    // Get all registrar slots for mapping position -> id
    const registrarSlots = await prisma.onCallSlot.findMany({
      where: { role: 'registrar' },
    });
    const slotIdByPosition = new Map(registrarSlots.map(s => [s.position, s.id]));

    await prisma.$transaction(async (tx) => {
      // Delete existing pattern
      await tx.onCallPattern.deleteMany({ where: { role: 'registrar' } });

      // Create new pattern
      for (const entry of body.pattern) {
        const slotId = slotIdByPosition.get(entry.slotPosition);
        if (!slotId) {
          throw new Error(`Invalid slot position: ${entry.slotPosition}`);
        }

        await tx.onCallPattern.create({
          data: {
            role: 'registrar',
            dayOfCycle: entry.dayOfCycle,
            slotId,
          },
        });
      }

      await logAuditTx(tx, {
        actorUserId: request.user?.sub,
        action: 'update',
        entity: 'onCallPattern',
        after: { pattern: body.pattern },
      });
    });

    return { ok: true };
  });

  // ============================================
  // ASSIGNMENTS
  // ============================================

  // GET /api/slot-assignments - Get assignments with optional filters
  app.get('/api/slot-assignments', { preHandler: requireAuth }, async (request) => {
    const query = z
      .object({
        role: roleSchema.optional(),
        slotId: z.coerce.number().optional(),
        clinicianId: z.coerce.number().optional(),
        activeOnly: z.enum(['true', 'false']).optional(),
      })
      .parse(request.query);

    const today = new Date();
    const where: any = {};

    if (query.slotId) {
      where.slotId = query.slotId;
    }

    if (query.clinicianId) {
      where.clinicianId = query.clinicianId;
    }

    if (query.role) {
      where.slot = { role: query.role };
    }

    if (query.activeOnly === 'true') {
      where.effectiveFrom = { lte: today };
      where.OR = [{ effectiveTo: null }, { effectiveTo: { gte: today } }];
    }

    const assignments = await prisma.slotAssignment.findMany({
      where,
      include: {
        slot: true,
        clinician: true,
      },
      orderBy: [{ slotId: 'asc' }, { effectiveFrom: 'desc' }],
    });

    return assignments;
  });

  // POST /api/slot-assignments - Create new assignment
  app.post('/api/slot-assignments', { preHandler: requireAuth }, async (request) => {
    const body = assignmentCreateSchema.parse(request.body);

    const effectiveFrom = new Date(body.effectiveFrom);
    const effectiveTo = body.effectiveTo ? new Date(body.effectiveTo) : null;

    // Check for overlapping assignments
    const hasOverlap = await hasOverlappingAssignment(body.slotId, effectiveFrom, effectiveTo);
    if (hasOverlap) {
      throw app.httpErrors.badRequest(
        'Assignment overlaps with an existing assignment for this slot'
      );
    }

    // Verify slot exists
    const slot = await prisma.onCallSlot.findUnique({ where: { id: body.slotId } });
    if (!slot) {
      throw app.httpErrors.notFound('Slot not found');
    }

    // Verify clinician exists and matches role
    const clinician = await prisma.clinician.findUnique({ where: { id: body.clinicianId } });
    if (!clinician) {
      throw app.httpErrors.notFound('Clinician not found');
    }
    if (clinician.role !== slot.role) {
      throw app.httpErrors.badRequest(
        `Clinician role (${clinician.role}) does not match slot role (${slot.role})`
      );
    }

    const created = await prisma.slotAssignment.create({
      data: {
        slotId: body.slotId,
        clinicianId: body.clinicianId,
        effectiveFrom,
        effectiveTo,
        createdBy: request.user?.sub ?? null,
      },
      include: { slot: true, clinician: true },
    });

    await logAudit({
      actorUserId: request.user?.sub,
      action: 'create',
      entity: 'slotAssignment',
      entityId: created.id,
      after: created,
    });

    return created;
  });

  // PUT /api/slot-assignments/:id - Update an assignment's effectiveTo
  app.put<{ Params: { id: string } }>(
    '/api/slot-assignments/:id',
    { preHandler: requireAuth },
    async (request) => {
      const id = Number(request.params.id);
      const body = assignmentUpdateSchema.parse(request.body);

      const before = await prisma.slotAssignment.findUnique({ where: { id } });
      if (!before) {
        throw app.httpErrors.notFound('Assignment not found');
      }

      const effectiveTo = body.effectiveTo ? new Date(body.effectiveTo) : null;

      // Check for overlapping assignments (excluding this one)
      if (effectiveTo) {
        const hasOverlap = await hasOverlappingAssignment(
          before.slotId,
          before.effectiveFrom,
          effectiveTo,
          id
        );
        if (hasOverlap) {
          throw app.httpErrors.badRequest(
            'Updated assignment would overlap with an existing assignment'
          );
        }
      }

      const updated = await prisma.slotAssignment.update({
        where: { id },
        data: { effectiveTo },
        include: { slot: true, clinician: true },
      });

      await logAudit({
        actorUserId: request.user?.sub,
        action: 'update',
        entity: 'slotAssignment',
        entityId: id,
        before,
        after: updated,
      });

      return updated;
    }
  );

  // DELETE /api/slot-assignments/:id - Delete an assignment
  app.delete<{ Params: { id: string } }>(
    '/api/slot-assignments/:id',
    { preHandler: requireAuth },
    async (request) => {
      const id = Number(request.params.id);

      const before = await prisma.slotAssignment.findUnique({ where: { id } });
      if (!before) {
        throw app.httpErrors.notFound('Assignment not found');
      }

      await prisma.slotAssignment.delete({ where: { id } });

      await logAudit({
        actorUserId: request.user?.sub,
        action: 'delete',
        entity: 'slotAssignment',
        entityId: id,
        before,
      });

      return { ok: true };
    }
  );

  // ============================================
  // QUICK ASSIGN (Convenience endpoint)
  // ============================================

  // POST /api/oncall-slots/quick-assign - Assign clinician to slot (closes previous if exists)
  app.post('/api/oncall-slots/quick-assign', { preHandler: requireAuth }, async (request) => {
    const body = z
      .object({
        slotId: z.number().int().positive(),
        clinicianId: z.number().int().positive(),
        effectiveFrom: z.string().date(),
      })
      .parse(request.body);

    const effectiveFrom = new Date(body.effectiveFrom);
    const yesterday = new Date(effectiveFrom);
    yesterday.setDate(yesterday.getDate() - 1);

    // Verify slot exists
    const slot = await prisma.onCallSlot.findUnique({ where: { id: body.slotId } });
    if (!slot) {
      throw app.httpErrors.notFound('Slot not found');
    }

    // Verify clinician exists and matches role
    const clinician = await prisma.clinician.findUnique({ where: { id: body.clinicianId } });
    if (!clinician) {
      throw app.httpErrors.notFound('Clinician not found');
    }
    if (clinician.role !== slot.role) {
      throw app.httpErrors.badRequest(
        `Clinician role (${clinician.role}) does not match slot role (${slot.role})`
      );
    }

    await prisma.$transaction(async (tx) => {
      // Close any current open assignment for this slot
      const currentAssignment = await tx.slotAssignment.findFirst({
        where: {
          slotId: body.slotId,
          effectiveTo: null,
          effectiveFrom: { lt: effectiveFrom },
        },
      });

      if (currentAssignment) {
        await tx.slotAssignment.update({
          where: { id: currentAssignment.id },
          data: { effectiveTo: yesterday },
        });

        await logAuditTx(tx, {
          actorUserId: request.user?.sub,
          action: 'update',
          entity: 'slotAssignment',
          entityId: currentAssignment.id,
          before: currentAssignment,
          after: { ...currentAssignment, effectiveTo: yesterday },
        });
      }

      // Create new assignment
      const created = await tx.slotAssignment.create({
        data: {
          slotId: body.slotId,
          clinicianId: body.clinicianId,
          effectiveFrom,
          effectiveTo: null,
          createdBy: request.user?.sub ?? null,
        },
      });

      await logAuditTx(tx, {
        actorUserId: request.user?.sub,
        action: 'create',
        entity: 'slotAssignment',
        entityId: created.id,
        after: created,
      });
    });

    return { ok: true };
  });
}
