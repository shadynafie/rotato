import { FastifyInstance } from 'fastify';
import { prisma } from '../prisma.js';
import { requireAuth } from '../utils/auth.js';

export async function auditRoutes(app: FastifyInstance) {
  app.get('/api/audit', { preHandler: requireAuth }, async () => {
    return prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200
    });
  });
}
