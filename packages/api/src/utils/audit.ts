import { prisma } from '../prisma.js';
import type { Prisma } from '@prisma/client';

export async function logAudit(params: {
  actorUserId?: number | null;
  action: string;
  entity: string;
  entityId?: number | null;
  before?: unknown;
  after?: unknown;
}) {
  const { actorUserId = null, action, entity, entityId = null, before = null, after = null } = params;
  // SQLite stores these as TEXT; stringify to avoid runtime/type issues.
  const safeBefore = before === undefined ? null : JSON.stringify(before);
  const safeAfter = after === undefined ? null : JSON.stringify(after);

  await prisma.auditLog.create({
    data: {
      actorUserId,
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
    actorUserId?: number | null;
    action: string;
    entity: string;
    entityId?: number | null;
    before?: unknown;
    after?: unknown;
  }
) {
  const { actorUserId = null, action, entity, entityId = null, before = null, after = null } = params;
  const safeBefore = before === undefined ? null : JSON.stringify(before);
  const safeAfter = after === undefined ? null : JSON.stringify(after);

  await tx.auditLog.create({
    data: {
      actorUserId,
      action,
      entity,
      entityId,
      before: safeBefore,
      after: safeAfter
    }
  });
}
