import { buildApp } from './app.js';

export async function startServer(port: number) {
  const app = buildApp();
  await app.listen({ host: '0.0.0.0', port });
  return app;
}
