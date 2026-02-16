/**
 * Cleanup script to remove duplicate slot assignments.
 *
 * Problem: Multiple assignments for the same slot with overlapping date ranges
 * (especially same effectiveFrom date and effectiveTo=null).
 *
 * Solution: For each slot with multiple open assignments, keep only the most
 * recently created one and delete the rest.
 *
 * Run with: npx tsx scripts/cleanup-duplicate-assignments.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanupDuplicateAssignments() {
  console.log('=== CLEANUP DUPLICATE SLOT ASSIGNMENTS ===\n');

  // Find all slots
  const slots = await prisma.onCallSlot.findMany({
    include: {
      assignments: {
        orderBy: { createdAt: 'desc' },  // Most recent first
      },
    },
  });

  let totalDeleted = 0;

  for (const slot of slots) {
    // Group assignments by their effective date range
    const openAssignments = slot.assignments.filter(a => a.effectiveTo === null);

    if (openAssignments.length > 1) {
      console.log(`Slot ${slot.name} (id=${slot.id}) has ${openAssignments.length} open assignments:`);

      // Keep the most recently created, delete the rest
      const [keep, ...duplicates] = openAssignments;

      console.log(`  KEEPING: id=${keep.id}, clinicianId=${keep.clinicianId}, from=${keep.effectiveFrom.toISOString().split('T')[0]}, created=${keep.createdAt.toISOString()}`);

      for (const dup of duplicates) {
        console.log(`  DELETING: id=${dup.id}, clinicianId=${dup.clinicianId}, from=${dup.effectiveFrom.toISOString().split('T')[0]}, created=${dup.createdAt.toISOString()}`);
        await prisma.slotAssignment.delete({ where: { id: dup.id } });
        totalDeleted++;
      }

      console.log('');
    }

    // Also check for overlapping closed assignments with same effectiveFrom
    const assignmentsByFrom = new Map<string, typeof slot.assignments>();
    for (const a of slot.assignments) {
      const key = a.effectiveFrom.toISOString().split('T')[0];
      if (!assignmentsByFrom.has(key)) {
        assignmentsByFrom.set(key, []);
      }
      assignmentsByFrom.get(key)!.push(a);
    }

    for (const [dateKey, assignments] of assignmentsByFrom) {
      if (assignments.length > 1) {
        console.log(`Slot ${slot.name} has ${assignments.length} assignments starting on ${dateKey}:`);

        // Keep the most recently created, delete the rest
        const [keep, ...duplicates] = assignments;

        console.log(`  KEEPING: id=${keep.id}, clinicianId=${keep.clinicianId}, to=${keep.effectiveTo?.toISOString().split('T')[0] ?? 'ongoing'}`);

        for (const dup of duplicates) {
          // Skip if already deleted (was in openAssignments)
          try {
            console.log(`  DELETING: id=${dup.id}, clinicianId=${dup.clinicianId}, to=${dup.effectiveTo?.toISOString().split('T')[0] ?? 'ongoing'}`);
            await prisma.slotAssignment.delete({ where: { id: dup.id } });
            totalDeleted++;
          } catch {
            // Already deleted
          }
        }

        console.log('');
      }
    }
  }

  console.log(`=== CLEANUP COMPLETE: ${totalDeleted} duplicate assignments deleted ===`);
}

cleanupDuplicateAssignments()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
