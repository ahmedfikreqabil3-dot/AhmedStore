import type { IdentityService } from './app.js';
import { buildApp } from './app.js';

export async function startServer(port: number, identityService: IdentityService) {
  const app = buildApp(identityService);
  await app.listen({ host: '0.0.0.0', port });
  return app;
}
