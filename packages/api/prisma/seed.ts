import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('admin123', 10);
  await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: { email: 'admin@example.com', passwordHash }
  });

  // Create duties
  const dutyNames = ['Clinic', 'Theatre', 'Ward Round', 'MDT', 'Teaching'];
  for (const name of dutyNames) {
    await prisma.duty.upsert({
      where: { id: dutyNames.indexOf(name) + 1 },
      update: {},
      create: { name }
    });
  }

  // Create consultants
  const consultants = [
    { name: 'Consultant A', role: 'consultant', email: 'consultant.a@example.com' },
    { name: 'Consultant B', role: 'consultant', email: 'consultant.b@example.com' }
  ];
  for (const c of consultants) {
    const existing = await prisma.clinician.findFirst({ where: { email: c.email } });
    if (!existing) {
      await prisma.clinician.create({ data: c });
    }
  }

  // Create registrars
  const registrars = [
    { name: 'Registrar 1', role: 'registrar', email: 'reg1@example.com' },
    { name: 'Registrar 2', role: 'registrar', email: 'reg2@example.com' }
  ];
  for (const r of registrars) {
    const existing = await prisma.clinician.findFirst({ where: { email: r.email } });
    if (!existing) {
      await prisma.clinician.create({ data: r });
    }
  }

  // Share token (only create if none exist)
  const existingToken = await prisma.shareToken.findFirst();
  if (!existingToken) {
    const token = crypto.randomBytes(24).toString('hex');
    await prisma.shareToken.create({
      data: { token, description: 'Default public link' }
    });
  }

  // ============================================
  // SLOT-BASED ON-CALL SYSTEM
  // ============================================

  // Create 7 consultant slots
  for (let i = 1; i <= 7; i++) {
    await prisma.onCallSlot.upsert({
      where: { role_position: { role: 'consultant', position: i } },
      update: {},
      create: {
        name: `Consultant ${String(i).padStart(2, '0')}`,
        role: 'consultant',
        position: i
      }
    });
  }

  // Create 7 registrar slots
  for (let i = 1; i <= 7; i++) {
    await prisma.onCallSlot.upsert({
      where: { role_position: { role: 'registrar', position: i } },
      update: {},
      create: {
        name: `Registrar ${String(i).padStart(2, '0')}`,
        role: 'registrar',
        position: i
      }
    });
  }

  // Create OnCallConfig for consultants (7-week cycle)
  await prisma.onCallConfig.upsert({
    where: { role: 'consultant' },
    update: {},
    create: {
      role: 'consultant',
      cycleLength: 7,
      startDate: new Date('2024-01-01'),
      unitType: 'week'
    }
  });

  // Create OnCallConfig for registrars (49-day cycle)
  await prisma.onCallConfig.upsert({
    where: { role: 'registrar' },
    update: {},
    create: {
      role: 'registrar',
      cycleLength: 49,
      startDate: new Date('2024-01-01'),
      unitType: 'day'
    }
  });

  // Create the 49-day registrar pattern
  // Pattern based on: Day 1 (Fri) starts with Slot 01
  // The pattern maps each day of the 49-day cycle to a slot position
  const registrarPattern: number[] = [
    1, 2, 2, 3, 4, 2, 5,  // Days 1-7:   Fri, Sat, Sun, Mon, Tue, Wed, Thu
    6, 4, 4, 7, 3, 4, 2,  // Days 8-14:  Fri, Sat, Sun, Mon, Tue, Wed, Thu
    5, 3, 3, 1, 7, 3, 4,  // Days 15-21: Fri, Sat, Sun, Mon, Tue, Wed, Thu
    2, 7, 7, 6, 1, 7, 3,  // Days 22-28: Fri, Sat, Sun, Mon, Tue, Wed, Thu
    4, 1, 1, 5, 6, 1, 7,  // Days 29-35: Fri, Sat, Sun, Mon, Tue, Wed, Thu
    3, 6, 6, 2, 5, 6, 1,  // Days 36-42: Fri, Sat, Sun, Mon, Tue, Wed, Thu
    7, 5, 5, 4, 2, 5, 6   // Days 43-49: Fri, Sat, Sun, Mon, Tue, Wed, Thu
  ];

  // Get all registrar slots for mapping position -> id
  const registrarSlots = await prisma.onCallSlot.findMany({
    where: { role: 'registrar' }
  });
  const slotIdByPosition = new Map(registrarSlots.map(s => [s.position, s.id]));

  // Create the pattern entries
  for (let day = 1; day <= 49; day++) {
    const slotPosition = registrarPattern[day - 1];
    const slotId = slotIdByPosition.get(slotPosition);
    if (slotId) {
      await prisma.onCallPattern.upsert({
        where: { role_dayOfCycle: { role: 'registrar', dayOfCycle: day } },
        update: { slotId },
        create: {
          role: 'registrar',
          dayOfCycle: day,
          slotId
        }
      });
    }
  }

  console.log('Seed complete. Admin login: admin@example.com / admin123');
  console.log('Created 7 consultant slots, 7 registrar slots, and 49-day registrar pattern.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
