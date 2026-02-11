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

  // Share token
  const token = crypto.randomBytes(24).toString('hex');
  await prisma.shareToken.create({
    data: { token, description: 'Default public link' }
  });

  console.log('Seed complete. Admin login: admin@example.com / admin123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
