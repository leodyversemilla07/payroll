import { resolve } from 'node:path';
import { prisma } from '@workspace/db';
import { config as loadDotEnv } from 'dotenv';
import { hashPassword } from './password';

loadDotEnv({
  path: [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '../../.env'),
    resolve(__dirname, '../../../../.env'),
  ],
  quiet: true,
});

async function bootstrapAdmin(): Promise<void> {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim() || 'Administrator';
  const organizationId = process.env.BOOTSTRAP_ORGANIZATION_ID?.trim();

  if (!email || !password || !organizationId) {
    throw new Error(
      'BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD, and BOOTSTRAP_ORGANIZATION_ID are required',
    );
  }

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true },
  });
  if (!organization) {
    throw new Error(`Organization ${organizationId} does not exist`);
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    throw new Error(`A user with email ${email} already exists`);
  }

  const user = await prisma.user.create({
    data: {
      organizationId,
      email,
      name,
      passwordHash: await hashPassword(password),
      role: 'SUPER_ADMIN',
    },
  });

  console.log(
    `Created SUPER_ADMIN ${user.email} for ${organization.name} (${organization.id})`,
  );
}

bootstrapAdmin()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
