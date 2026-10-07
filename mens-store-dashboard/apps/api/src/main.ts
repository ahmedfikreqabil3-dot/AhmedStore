import { PrismaClient } from '@prisma/client';
import { startServer } from './server.js';
import { createIdentityService } from './modules/identity/service.js';
import { createSessionService } from './modules/identity/session.js';
import { createCategoryService } from './modules/catalogue/category.js';

const prisma = new PrismaClient();
const identityService = createIdentityService({
  async findByEmail(organizationId, email) {
    const user = await prisma.user.findUnique({ where: { organizationId_email: { organizationId, email } } });
    return user;
  },
  async create(user) {
    return prisma.user.create({ data: user });
  },
  async createAuditEvent(input) {
    await prisma.auditEvent.create({ data: input });
  }
});

const authenticationService = createSessionService({
  async findUserByEmail(organizationId, email) {
    return prisma.user.findUnique({ where: { organizationId_email: { organizationId, email } } });
  },
  async createSession(input) { await prisma.session.create({ data: input }); },
  async findSession(tokenHash) {
    return prisma.session.findUnique({ where: { tokenHash }, include: { user: true } });
  },
  async revokeSession(id, revokedAt) { await prisma.session.update({ where: { id }, data: { revokedAt } }); },
  async createAuditEvent(input) { await prisma.auditEvent.create({ data: input }); }
});

const userDirectoryService = {
  async list(organizationId: string) {
    const users = await prisma.user.findMany({ where: { organizationId }, orderBy: { createdAt: 'asc' } });
    return users.map(({ passwordHash: _passwordHash, active: _active, ...user }) => user);
  }
};

const categoryService = createCategoryService({
  async list(organizationId: string) {
    return prisma.category.findMany({ where: { organizationId, archivedAt: null }, orderBy: { name: 'asc' } });
  },
  async findByName(organizationId: string, name: string) {
    return prisma.category.findUnique({ where: { organizationId_name: { organizationId, name } } });
  },
  async create(category) { return prisma.category.create({ data: category }); },
  async archive(id, organizationId, archivedAt) {
    const updated = await prisma.category.updateMany({ where: { id, organizationId, archivedAt: null }, data: { archivedAt } });
    return updated.count === 0 ? null : prisma.category.findUnique({ where: { id } });
  }
});

await startServer(Number(process.env.PORT ?? 3000), identityService, authenticationService, userDirectoryService, categoryService);
