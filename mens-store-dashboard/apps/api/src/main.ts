import { PrismaClient } from '@prisma/client';
import { startServer } from './server.js';
import { createIdentityService } from './modules/identity/service.js';

const prisma = new PrismaClient();
const identityService = createIdentityService({
  async findByEmail(organizationId, email) {
    const user = await prisma.user.findUnique({ where: { organizationId_email: { organizationId, email } } });
    return user;
  },
  async create(user) {
    return prisma.user.create({ data: user });
  }
});

await startServer(Number(process.env.PORT ?? 3000), identityService);
