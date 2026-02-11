import '@fastify/jwt';
import { FastifyRequest } from 'fastify';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: number; email: string; role: string };
    user: { sub: number; email: string; role: string };
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    user: { sub: number; email: string; role: string };
  }
}
