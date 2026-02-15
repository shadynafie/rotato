import { prisma } from '../prisma.js';
import type { Prisma } from '@prisma/client';

// Safely convert JWT sub to user ID number
function toUserId(sub: unknown): number | null {
  if (sub === null || sub === undefined) return null;
  const num = typeof sub === 'number' ? sub : parseInt(String(sub), 10);
  return isNaN(num) ? null : num;
}

export async function logAudit(params: {
  actorUserId?: unknown;
  action: string;
  entity: string;
  entityId?: number | null;
  before?: unknown;
  after?: unknown;
}) {
  const { actorUserId, action, entity, entityId = null, before = null, after = null } = params;
  const safeActorUserId = toUserId(actorUserId);
  // SQLite stores these as TEXT; stringify to avoid runtime/type issues.
  const safeBefore = before === undefined ? null : JSON.stringify(before);
  const safeAfter = after === undefined ? null : JSON.stringify(after);

  await prisma.auditLog.create({
    data: {
      actorUserId: safeActorUserId,
      action,
      entity,
      entityId,
      before: safeBefore,
      after: safeAfter
    }
  });
}

// Transaction-safe variant: use the provided Prisma transaction client.
export async function logAuditTx(
  tx: Prisma.TransactionClient,
  params: {
    actorUserId?: unknown;
    action: string;
    entity: string;
    entityId?: number | null;
    before?: unknown;
    after?: unknown;
  }
) {
  const { actorUserId, action, entity, entityId = null, before = null, after = null } = params;
  const safeActorUserId = toUserId(actorUserId);
  const safeBefore = before === undefined ? null : JSON.stringify(before);
  const safeAfter = after === undefined ? null : JSON.stringify(after);

  await tx.auditLog.create({
    data: {
      actorUserId: safeActorUserId,
      action,
      entity,
      entityId,
      before: safeBefore,
      after: safeAfter
    }
  });
}
