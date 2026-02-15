import { FastifyInstance } from 'fastify';
import { prisma } from '../prisma.js';
import { requireAuth } from '../utils/auth.js';
import { logAudit } from '../utils/audit.js';
import crypto from 'node:crypto';

export async function shareTokenRoutes(app: FastifyInstance) {
  app.get('/api/share-tokens', { preHandler: requireAuth }, async () => {
    return prisma.shareToken.findMany({ orderBy: { createdAt: 'desc' } });
  });

  app.post('/api/share-tokens', { preHandler: requireAuth }, async (request) => {
    // Deactivate all existing tokens first
    await prisma.shareToken.updateMany({
      where: { active: true },
      data: { active: false }
    });

    // Create new token
    const token = crypto.randomBytes(24).toString('hex');
    const created = await prisma.shareToken.create({ data: { token, description: 'Public link' } });
    await logAudit({ actorUserId: request.user?.sub, action: 'create', entity: 'shareToken', entityId: created.id, after: created });
    return created;
  });
}
