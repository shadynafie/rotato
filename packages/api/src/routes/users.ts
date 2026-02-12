import { FastifyInstance } from 'fastify';
import { prisma } from '../prisma.js';
import { z } from 'zod';
import bcrypt from 'bcrypt';

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(6, 'Password must be at least 6 characters').optional(),
});

export async function userRoutes(app: FastifyInstance) {
  // All routes require authentication
  app.addHook('onRequest', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.unauthorized();
    }
  });

  // List all users
  app.get('/api/users', async () => {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    return users;
  });

  // Create a new user
  app.post('/api/users', async (request, reply) => {
    const body = createUserSchema.parse(request.body);

    // Check if email already exists
    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) {
      return reply.badRequest('Email already in use');
    }

    const passwordHash = await bcrypt.hash(body.password, 10);
    const user = await prisma.user.create({
      data: {
        email: body.email,
        passwordHash,
      },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    return user;
  });

  // Update a user (email or password)
  app.put('/api/users/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = parseInt(id, 10);
    const body = updateUserSchema.parse(request.body);

    // Check if user exists
    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      return reply.notFound('User not found');
    }

    // If changing email, check it's not taken
    if (body.email && body.email !== existing.email) {
      const emailTaken = await prisma.user.findUnique({ where: { email: body.email } });
      if (emailTaken) {
        return reply.badRequest('Email already in use');
      }
    }

    const updateData: { email?: string; passwordHash?: string } = {};
    if (body.email) updateData.email = body.email;
    if (body.password) updateData.passwordHash = await bcrypt.hash(body.password, 10);

    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    return user;
  });

  // Delete a user
  app.delete('/api/users/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = parseInt(id, 10);
    const currentUser = request.user as { sub: number };

    // Prevent self-deletion
    if (currentUser.sub === userId) {
      return reply.badRequest('Cannot delete your own account');
    }

    // Check if user exists
    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      return reply.notFound('User not found');
    }

    // Check if this is the last user
    const userCount = await prisma.user.count();
    if (userCount <= 1) {
      return reply.badRequest('Cannot delete the last user');
    }

    await prisma.user.delete({ where: { id: userId } });
    return { success: true };
  });
}
