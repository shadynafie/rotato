import { prisma } from '../prisma.js';
import { logAudit, logAuditTx } from '../utils/audit.js';
import type { Prisma } from '@prisma/client';

/**
 * Create a record with automatic audit logging.
 */
export async function createWithAudit<T extends { id: number }>(
  createFn: () => Promise<T>,
  options: {
    actorUserId?: unknown;
    entity: string;
  }
): Promise<T> {
  const created = await createFn();
  await logAudit({
    actorUserId: options.actorUserId,
    action: 'create',
    entity: options.entity,
    entityId: created.id,
    after: created,
  });
  return created;
}

/**
 * Update a record with automatic before/after audit logging.
 * Fetches the "before" state, performs the update, then logs.
 */
export async function updateWithAudit<T extends { id: number }>(
  findFn: () => Promise<unknown>,
  updateFn: () => Promise<T>,
  options: {
    actorUserId?: unknown;
    entity: string;
    entityId: number;
  }
): Promise<T> {
  const before = await findFn();
  const updated = await updateFn();
  await logAudit({
    actorUserId: options.actorUserId,
    action: 'update',
    entity: options.entity,
    entityId: options.entityId,
    before,
    after: updated,
  });
  return updated;
}

/**
 * Delete a record with automatic audit logging.
 * Fetches the "before" state, performs the delete, then logs.
 */
export async function deleteWithAudit(
  findFn: () => Promise<unknown>,
  deleteFn: () => Promise<void>,
  options: {
    actorUserId?: unknown;
    entity: string;
    entityId: number;
  }
): Promise<{ ok: true }> {
  const before = await findFn();
  await deleteFn();
  await logAudit({
    actorUserId: options.actorUserId,
    action: 'delete',
    entity: options.entity,
    entityId: options.entityId,
    before,
  });
  return { ok: true };
}

/**
 * Upsert records in a transaction with automatic audit logging.
 * For bulk operations that need to track individual changes.
 */
export async function upsertManyWithAudit<T extends { id: number }>(
  tx: Prisma.TransactionClient,
  items: Array<{
    findFn: () => Promise<T | null>;
    upsertFn: () => Promise<T>;
  }>,
  options: {
    actorUserId?: unknown;
    entity: string;
  }
): Promise<T[]> {
  const results: T[] = [];

  for (const item of items) {
    const before = await item.findFn();
    const result = await item.upsertFn();
    await logAuditTx(tx, {
      actorUserId: options.actorUserId,
      action: before ? 'update' : 'create',
      entity: options.entity,
      entityId: result.id,
      before,
      after: result,
    });
    results.push(result);
  }

  return results;
}

/**
 * Extract numeric ID from route parameters.
 * Throws error if invalid.
 */
export function getIdParam(params: unknown): number {
  const id = Number((params as { id: string }).id);
  if (isNaN(id) || id <= 0) {
    throw new Error('Invalid ID parameter');
  }
  return id;
}

/**
 * Build date range query filter for Prisma.
 */
export function buildDateRangeFilter(from?: string, to?: string): { gte?: Date; lte?: Date } | undefined {
  if (!from && !to) return undefined;
  const filter: { gte?: Date; lte?: Date } = {};
  if (from) filter.gte = new Date(from);
  if (to) filter.lte = new Date(to);
  return filter;
}
