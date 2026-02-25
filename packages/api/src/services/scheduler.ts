import cron, { ScheduledTask } from 'node-cron';
import { generateRota } from './rotaGenerator.js';
import { logAudit } from '../utils/audit.js';
import { detectCoverageNeeds, createCoverageRequests } from './coverageDetector.js';

/**
 * Scheduler service for automatic rota generation.
 *
 * Runs on the 1st of each month at 2:00 AM to regenerate
 * the rota for the current month + 3 months ahead.
 */

let scheduledTask: ScheduledTask | null = null;

export function startScheduler() {
  // Run at 2:00 AM on the 1st of every month
  // Cron format: minute hour day-of-month month day-of-week
  scheduledTask = cron.schedule('0 2 1 * *', async () => {
    console.log('[Scheduler] Starting monthly rota regeneration...');

    try {
      const from = new Date();
      from.setDate(1); // Start of current month
      from.setHours(0, 0, 0, 0);

      const to = new Date(from);
      to.setMonth(to.getMonth() + 4); // 4 months ahead (current + 3)
      to.setDate(0); // Last day of the 3rd month ahead
      to.setHours(23, 59, 59, 999);

      console.log(`[Scheduler] Generating rota from ${from.toISOString()} to ${to.toISOString()}`);

      await generateRota(from, to);

      // Detect and create coverage requests for existing leaves
      const coverageNeeds = await detectCoverageNeeds(from, to);
      const coverageCreated = await createCoverageRequests(coverageNeeds);
      console.log(`[Scheduler] Created ${coverageCreated} coverage requests for existing leaves`);

      // Log to audit trail
      await logAudit({
        action: 'scheduled-regenerate',
        entity: 'rota',
        entityId: 0,
        after: {
          from: from.toISOString(),
          to: to.toISOString(),
          triggeredBy: 'scheduler'
        }
      });

      console.log('[Scheduler] Monthly rota regeneration completed successfully');
    } catch (error) {
      console.error('[Scheduler] Error during rota regeneration:', error);

      // Log error to audit trail
      await logAudit({
        action: 'scheduled-regenerate-error',
        entity: 'rota',
        entityId: 0,
        after: {
          error: error instanceof Error ? error.message : String(error),
          triggeredBy: 'scheduler'
        }
      });
    }
  }, {
    timezone: 'Europe/London'
  });

  console.log('[Scheduler] Monthly rota regeneration scheduled (1st of each month at 2:00 AM)');
}

export function stopScheduler() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log('[Scheduler] Scheduler stopped');
  }
}

/**
 * Manually trigger rota regeneration for the next 3 months.
 * Useful for testing or on-demand regeneration.
 */
export async function triggerManualRegeneration(): Promise<{ from: Date; to: Date }> {
  const from = new Date();
  from.setDate(1);
  from.setHours(0, 0, 0, 0);

  const to = new Date(from);
  to.setMonth(to.getMonth() + 4);
  to.setDate(0);
  to.setHours(23, 59, 59, 999);

  await generateRota(from, to);

  // Detect and create coverage requests for existing leaves
  const coverageNeeds = await detectCoverageNeeds(from, to);
  await createCoverageRequests(coverageNeeds);

  return { from, to };
}
