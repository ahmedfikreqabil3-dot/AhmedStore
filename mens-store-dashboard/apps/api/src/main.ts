import { startServer } from './server.js';

await startServer(Number(process.env.PORT ?? 3000));
