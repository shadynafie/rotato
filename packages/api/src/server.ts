import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import jwt from '@fastify/jwt';
import fastifyStatic from '@fastify/static';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { env } from './env.js';
import { authRoutes } from './routes/auth.js';
import { clinicianRoutes } from './routes/clinicians.js';
import { dutyRoutes } from './routes/duties.js';
import { jobPlanRoutes } from './routes/jobPlans.js';
import { oncallRoutes } from './routes/oncall.js';
import { rotaRoutes } from './routes/rota.js';
import { leaveRoutes } from './routes/leaves.js';
import { publicRoutes } from './routes/public.js';
import { shareTokenRoutes } from './routes/shareTokens.js';
import { notificationRoutes } from './routes/notifications.js';
import { auditRoutes } from './routes/audit.js';
import { scheduleRoutes } from './routes/schedule.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = Fastify({ logger: true });

await app.register(sensible);
await app.register(cors, { origin: env.corsOrigin, credentials: true });
await app.register(jwt, { secret: env.jwtSecret });

// Serve static files in production
if (env.serveStatic) {
  const webDistPath = path.join(__dirname, '../../web/dist');
  await app.register(fastifyStatic, {
    root: webDistPath,
    prefix: '/',
    decorateReply: false,
  });
}

await app.register(authRoutes);
await app.register(clinicianRoutes);
await app.register(dutyRoutes);
await app.register(jobPlanRoutes);
await app.register(oncallRoutes);
await app.register(rotaRoutes);
await app.register(leaveRoutes);
await app.register(publicRoutes);
await app.register(shareTokenRoutes);
await app.register(notificationRoutes);
await app.register(auditRoutes);
await app.register(scheduleRoutes);

app.get('/health', async () => ({ status: 'ok' }));

// SPA fallback - serve index.html for non-API routes
if (env.serveStatic) {
  const webDistPath = path.join(__dirname, '../../web/dist');
  const indexPath = path.join(webDistPath, 'index.html');

  app.setNotFoundHandler((request, reply) => {
    // Only serve index.html for non-API routes
    if (!request.url.startsWith('/api/')) {
      const indexContent = fs.readFileSync(indexPath, 'utf-8');
      reply.type('text/html').send(indexContent);
    } else {
      reply.status(404).send({ message: 'Not Found' });
    }
  });
}

app.setErrorHandler((err, _req, reply) => {
  app.log.error(err);
  reply.status(err.statusCode || 500).send({ message: err.message });
});

app
  .listen({ port: env.port, host: '0.0.0.0' })
  .then(() => {
    app.log.info(`API listening on ${env.port}`);
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
