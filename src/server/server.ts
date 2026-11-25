// One HTTP server for everything: the static page and its scripts, /healthz and the game WebSocket on /ws.
import { createHash, randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join } from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import {
  FADE_MS,
  HIT_MS,
  createRateLimit,
  isColliding,
  newBall,
  parseClientMessage,
  round4,
  stepBall,
  type Ball,
  type PlayerState,
  type RateVerdict,
  type ServerMessage,
} from '../shared/game.js';

export interface ServerOptions {
  port: number;
  host?: string;
  /** index.html, style.css and the other files served as they are. */
  publicDir: string;
  /** Compiled output: client/*.js and shared/*.js are served under /js/. */
  distDir: string;
  maxClients?: number;
  maxClientsPerIp?: number;
  /** Behind a reverse proxy: take the client address from X-Real-IP / X-Forwarded-For. */
  trustProxy?: boolean;
  maxMessagesPerSecond?: number;
  maxMessageBytes?: number;
  tickMs?: number;
  heartbeatMs?: number;
}

export interface GameServer {
  url: string;
  port: number;
  connections(): number;
  close(): Promise<void>;
}

interface Player {
  id: string;
  hue: number;
  x: number;
  y: number;
  moved: boolean;
  hitUntil: number;
  goneAt: number | null;
}

interface StaticFile {
  body: Buffer;
  type: string;
  etag: string;
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
};

const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; " +
    "base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

/** Exact paths only: nothing outside these files can be requested. */
function loadStaticFiles(publicDir: string, distDir: string): Map<string, StaticFile> {
  const files = new Map<string, StaticFile>();
  const add = (urlPath: string, file: string) => {
    const type = TYPES[extname(file)];
    if (!type) return;
    const body = readFileSync(file);
    const etag = `"${createHash('sha1').update(body).digest('base64url')}"`;
    files.set(urlPath, { body, type, etag });
  };
  for (const name of readdirSync(publicDir)) add(`/${name}`, join(publicDir, name));
  for (const sub of ['client', 'shared']) {
    for (const name of readdirSync(join(distDir, sub))) {
      if (name.endsWith('.js')) add(`/js/${sub}/${name}`, join(distDir, sub, name));
    }
  }
  const index = files.get('/index.html');
  if (!index) throw new Error(`index.html missing in ${publicDir}`);
  files.set('/', index);
  return files;
}

function clientAddress(req: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const real = req.headers['x-real-ip'];
    if (typeof real === 'string' && real) return real.trim();
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded) return forwarded.split(',')[0]!.trim();
  }
  return req.socket.remoteAddress ?? 'unknown';
}

export async function startServer(options: ServerOptions): Promise<GameServer> {
  const maxClients = options.maxClients ?? 100;
  const maxClientsPerIp = options.maxClientsPerIp ?? 10;
  const trustProxy = options.trustProxy ?? false;
  const maxMessagesPerSecond = options.maxMessagesPerSecond ?? 60;
  const tickMs = options.tickMs ?? 50;
  const heartbeatMs = options.heartbeatMs ?? 30_000;
  const files = loadStaticFiles(options.publicDir, options.distDir);

  const players = new Map<string, Player>();
  const perIp = new Map<string, number>();
  const alive = new WeakSet<WebSocket>();
  // accepted players only: a refused socket stays in wss.clients until its close handshake ends
  let active = 0;
  let ball: Ball = newBall();
  let lastTick = Date.now();

  const http = createServer((req: IncomingMessage, res: ServerResponse) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    if (path === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok: true, connections: active }));
      return;
    }
    const file = files.get(path);
    if (!file) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS }).end('Not found');
      return;
    }
    const headers = { 'Content-Type': file.type, ETag: file.etag, 'Cache-Control': 'no-cache', ...SECURITY_HEADERS };
    if (req.headers['if-none-match'] === file.etag) {
      res.writeHead(304, headers).end();
      return;
    }
    res.writeHead(200, { ...headers, 'Content-Length': file.body.length });
    res.end(req.method === 'HEAD' ? undefined : file.body);
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: options.maxMessageBytes ?? 256 });

  http.on('upgrade', (req, socket, head) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (path !== '/ws') {
      socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, req));
  });

  function onConnection(ws: WebSocket, req: IncomingMessage) {
    const ip = clientAddress(req, trustProxy);
    const fromIp = perIp.get(ip) ?? 0;
    if (active >= maxClients || fromIp >= maxClientsPerIp) {
      ws.close(1013, 'server full');
      return;
    }
    perIp.set(ip, fromIp + 1);
    active++;
    alive.add(ws);

    const player: Player = {
      id: randomBytes(6).toString('base64url'),
      // anything but red, which means "hit"
      hue: 30 + Math.floor(Math.random() * 300),
      x: 0.5,
      y: 0.5,
      moved: false,
      hitUntil: 0,
      goneAt: null,
    };
    players.set(player.id, player);
    const rate = createRateLimit(maxMessagesPerSecond);
    send(ws, JSON.stringify({ t: 'hello', id: player.id } satisfies ServerMessage));

    ws.on('pong', () => alive.add(ws));
    ws.on('message', (data, isBinary) => {
      const verdict: RateVerdict = rate(Date.now());
      if (verdict === 'kick') {
        ws.close(1008, 'too many messages');
        return;
      }
      if (verdict === 'drop' || isBinary) return;
      const pos = parseClientMessage(data.toString());
      if (!pos) return;
      player.x = pos.x;
      player.y = pos.y;
      player.moved = true;
    });
    ws.on('close', () => {
      active--;
      const left = (perIp.get(ip) ?? 1) - 1;
      if (left > 0) perIp.set(ip, left);
      else perIp.delete(ip);
      if (player.moved) player.goneAt = Date.now();
      else players.delete(player.id);
    });
    ws.on('error', () => ws.terminate());
  }

  function send(ws: WebSocket, text: string) {
    // a client that does not keep up loses frames instead of filling the server's memory
    if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 256 * 1024) ws.send(text);
  }

  function tick() {
    const now = Date.now();
    const dt = now - lastTick;
    lastTick = now;
    if (active === 0) return;
    ball = stepBall(ball, dt);
    const visible: PlayerState[] = [];
    for (const p of players.values()) {
      if (!p.moved) continue;
      let size = 1;
      if (p.goneAt !== null) {
        size = 1 - (now - p.goneAt) / FADE_MS;
        if (size <= 0) {
          players.delete(p.id);
          continue;
        }
      } else if (isColliding(p, ball)) {
        p.hitUntil = now + HIT_MS;
      }
      visible.push({ id: p.id, x: round4(p.x), y: round4(p.y), hue: p.hue, hit: p.hitUntil > now, size: round4(size) });
    }
    const text = JSON.stringify({ t: 'state', ball: { x: round4(ball.x), y: round4(ball.y) }, players: visible } satisfies ServerMessage);
    for (const ws of wss.clients) send(ws, text);
  }

  function heartbeat() {
    for (const ws of wss.clients) {
      if (!alive.has(ws)) {
        ws.terminate();
        continue;
      }
      alive.delete(ws);
      ws.ping();
    }
  }

  const tickTimer = setInterval(tick, tickMs);
  const heartbeatTimer = setInterval(heartbeat, heartbeatMs);

  await new Promise<void>((resolve, reject) => {
    http.once('error', reject);
    http.listen(options.port, options.host, () => resolve());
  });
  const { port } = http.address() as AddressInfo;
  const shownHost = !options.host || options.host === '0.0.0.0' || options.host === '::' ? 'localhost' : options.host;

  return {
    url: `http://${shownHost}:${port}`,
    port,
    connections: () => active,
    close: async () => {
      clearInterval(tickTimer);
      clearInterval(heartbeatTimer);
      for (const ws of wss.clients) ws.close(1001, 'server shutting down');
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      http.closeAllConnections();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}
