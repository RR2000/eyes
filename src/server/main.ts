// Entry point: settings from the environment, then the server. See README.md for the variables.
import { fileURLToPath } from 'node:url';
import { startServer } from './server.js';

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${name} must be a non-negative integer, got "${raw}"`);
  return n;
}

const server = await startServer({
  port: intFromEnv('PORT', 8080),
  host: process.env.HOST || undefined,
  publicDir: fileURLToPath(new URL('../../public/', import.meta.url)),
  distDir: fileURLToPath(new URL('../', import.meta.url)),
  maxClients: intFromEnv('MAX_CLIENTS', 100),
  maxClientsPerIp: intFromEnv('MAX_CLIENTS_PER_IP', 10),
  trustProxy: process.env.TRUST_PROXY === '1',
});
console.log(`listening on ${server.url}`);

let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    console.log(`${signal}: closing`);
    void server.close().then(() => process.exit(0));
  });
}
