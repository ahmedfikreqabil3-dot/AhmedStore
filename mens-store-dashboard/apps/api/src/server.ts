import type { CategoryService, IdentityService, UserDirectoryService } from './app.js';
import { buildApp } from './app.js';
import type { AuthenticationService } from './modules/identity/session.js';

export async function startServer(port: number, identityService: IdentityService, authenticationService: AuthenticationService, userDirectoryService: UserDirectoryService, categoryService: CategoryService) {
  const app = await buildApp(identityService, authenticationService, userDirectoryService, categoryService);
  await app.listen({ host: '0.0.0.0', port });
  return app;
}
