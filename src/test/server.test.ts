// Starts the real server on a free port and talks to it over HTTP and real WebSockets.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { HUE_MAX, HUE_MIN, hueToHex } from '../shared/color.js';
import type { ServerMessage } from '../shared/game.js';
import { startServer, type GameServer, type ServerOptions } from '../server/server.js';

const base: ServerOptions = {
  port: 0,
  host: '127.0.0.1',
  publicDir: fileURLToPath(new URL('../../public/', import.meta.url)),
  distDir: fileURLToPath(new URL('../', import.meta.url)),
  tickMs: 20,
};

type State = Extract<ServerMessage, { t: 'state' }>;

/** The hue behind a colour sent by the server (closest match, to 0.1 degrees). */
function hueOf(hex: string): number {
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const target = rgb(hex);
  let best = HUE_MIN;
  let bestD = Infinity;
  for (let h = HUE_MIN; h <= HUE_MAX; h += 0.1) {
    const d = Math.hypot(...rgb(hueToHex(h)).map((v, i) => v - target[i]!));
    if (d < bestD) [best, bestD] = [h, d];
  }
  return best;
}

/** A client that keeps every message it receives. */
class Client {
  readonly ws: WebSocket;
  readonly messages: ServerMessage[] = [];
  readonly closed: Promise<number>;
  constructor(url: string, options?: ConstructorParameters<typeof WebSocket>[2]) {
    this.ws = new WebSocket(url, options);
    this.ws.on('message', (data) => this.messages.push(JSON.parse(data.toString()) as ServerMessage));
    this.ws.on('error', () => {});
    this.closed = new Promise((resolve) => this.ws.on('close', (code) => resolve(code)));
  }
  opened() {
    return new Promise<void>((resolve, reject) => {
      this.ws.once('open', () => resolve());
      this.ws.once('error', reject);
    });
  }
  async id(): Promise<string> {
    const hello = await this.waitFor((m) => m.t === 'hello');
    return (hello as Extract<ServerMessage, { t: 'hello' }>).id;
  }
  send(value: unknown) {
    this.ws.send(typeof value === 'string' ? value : JSON.stringify(value));
  }
  async waitFor(match: (m: ServerMessage) => boolean, ms = 3000): Promise<ServerMessage> {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const found = this.messages.find(match);
      if (found) return found;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error('message not received in time');
  }
  async waitForState(match: (s: State) => boolean, ms = 3000): Promise<State> {
    return (await this.waitFor((m) => m.t === 'state' && match(m), ms)) as State;
  }
  close() {
    this.ws.close();
  }
}

async function withServer(options: Partial<ServerOptions>, body: (server: GameServer, wsUrl: string) => Promise<void>) {
  const server = await startServer({ ...base, ...options });
  try {
    await body(server, `ws://127.0.0.1:${server.port}/ws`);
  } finally {
    await server.close();
  }
}

describe('http', () => {
  let server: GameServer;
  before(async () => {
    server = await startServer(base);
  });
  after(() => server.close());

  it('serves the page with a strict CSP', async () => {
    const res = await fetch(`${server.url}/`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /text\/html/);
    assert.match(res.headers.get('content-security-policy') ?? '', /connect-src 'self'/);
    assert.match(await res.text(), /\/js\/client\/main\.js/);
  });
  it('serves the browser modules and answers 304 to a known ETag', async () => {
    for (const path of ['/js/client/main.js', '/js/shared/game.js', '/style.css']) {
      const res = await fetch(server.url + path);
      assert.equal(res.status, 200, path);
      const etag = res.headers.get('etag')!;
      const again = await fetch(server.url + path, { headers: { 'If-None-Match': etag } });
      assert.equal(again.status, 304, path);
    }
  });
  it('serves nothing else', async () => {
    for (const path of ['/js/server/server.js', '/../package.json', '/%2e%2e/package.json', '/js/test/game.test.js', '/nope']) {
      assert.equal((await fetch(server.url + path)).status, 404, path);
    }
    assert.equal((await fetch(`${server.url}/`, { method: 'POST' })).status, 405);
  });
  it('has a health check', async () => {
    const res = await fetch(`${server.url}/healthz`);
    assert.equal(res.status, 200);
    assert.equal(((await res.json()) as { ok: boolean }).ok, true);
  });
});

describe('websocket', () => {
  it('two players see each other, the one who leaves fades out', async () => {
    await withServer({}, async (_server, url) => {
      const a = new Client(url);
      const b = new Client(url);
      const [idA, idB] = await Promise.all([a.id(), b.id()]);
      assert.notEqual(idA, idB);
      a.send({ x: 0.1, y: 0.2 });
      b.send({ x: 0.9, y: 0.8 });
      const seenByB = await b.waitForState((s) => s.players.length === 2);
      const pa = seenByB.players.find((p) => p.id === idA)!;
      assert.deepEqual([pa.x, pa.y, pa.size], [0.1, 0.2, 1]);
      assert.match(pa.color, /^#[0-9a-f]{6}$/);
      await a.waitForState((s) => s.players.some((p) => p.id === idB && p.x === 0.9));

      a.close();
      const fading = await b.waitForState((s) => s.players.some((p) => p.id === idA && p.size < 1));
      assert.ok(fading.players.find((p) => p.id === idB)!.size === 1);
      b.close();
    });
  });

  it('two eyes that touch mix their colours, the same for both clients', async () => {
    // first player at one end of the hues, second at the other
    const hues = [0, 0.9999];
    await withServer({ random: () => hues.shift() ?? 0.5 }, async (_server, url) => {
      const a = new Client(url);
      const idA = await a.id();
      const b = new Client(url);
      const idB = await b.id();
      const colors = (s: State) => [s.players.find((p) => p.id === idA)?.color, s.players.find((p) => p.id === idB)?.color];
      a.send({ x: 0.1, y: 0.1 });
      b.send({ x: 0.9, y: 0.9 });
      const apart = colors(await a.waitForState((s) => s.players.length === 2));
      assert.deepEqual(apart, [hueToHex(HUE_MIN), hueToHex(HUE_MAX)]);

      // on top of each other for 1.5 s
      a.send({ x: 0.5, y: 0.1 });
      b.send({ x: 0.52, y: 0.1 });
      await new Promise((r) => setTimeout(r, 1500));
      const lastA = [...a.messages].reverse().find((m): m is State => m.t === 'state')!;
      const [ca, cb] = colors(lastA);
      assert.notEqual(ca, apart[0], 'A changed colour');
      assert.notEqual(cb, apart[1], 'B changed colour');
      const [ha, hb] = [hueOf(ca!), hueOf(cb!)];
      assert.ok(ha > HUE_MIN + 40 && hb < HUE_MAX - 40, `both moved towards the middle: ${ha} ${hb}`);
      assert.ok(hb - ha < (HUE_MAX - HUE_MIN) / 2, `much closer to each other: ${ha} ${hb}`);
      // B received the very same state (same ball position): same colours
      const sameTick = await b.waitForState((s) => s.ball.x === lastA.ball.x && s.ball.y === lastA.ball.y);
      assert.deepEqual(colors(sameTick), [ca, cb]);
      a.close();
      b.close();
    });
  });

  it('a player touched by the ball turns red', async () => {
    await withServer({}, async (_server, url) => {
      const a = new Client(url);
      const id = await a.id();
      // follow the ball: sooner or later it is under the eye
      const red = (async () => {
        for (let i = 0; i < 100; i++) {
          const last = [...a.messages].reverse().find((m): m is State => m.t === 'state');
          if (last) a.send({ x: last.ball.x, y: last.ball.y });
          if (last?.players.some((p) => p.id === id && p.hit)) return true;
          await new Promise((r) => setTimeout(r, 30));
        }
        return false;
      })();
      assert.equal(await red, true);
      a.close();
    });
  });

  it('ignores invalid messages without dropping the connection', async () => {
    await withServer({}, async (_server, url) => {
      const a = new Client(url);
      const id = await a.id();
      for (const bad of ['nonsense', '{"x":2,"y":0.5}', '{"x":0.5}', '[1,2]', '{"x":"0.3","y":"0.3"}']) a.send(bad);
      a.ws.send(Buffer.from([1, 2, 3]), { binary: true });
      a.send({ x: 0.3, y: 0.4 });
      const s = await a.waitForState((st) => st.players.some((p) => p.id === id));
      const me = s.players.find((p) => p.id === id)!;
      assert.deepEqual([me.x, me.y], [0.3, 0.4]);
      assert.equal(a.ws.readyState, WebSocket.OPEN);
      a.close();
    });
  });

  it('closes a connection that sends a message too large (1009)', async () => {
    await withServer({}, async (_server, url) => {
      const a = new Client(url);
      await a.id();
      a.send({ x: 0.5, y: 0.5, pad: 'a'.repeat(1000) });
      assert.equal(await a.closed, 1009);
    });
  });

  it('closes a connection that floods (1008)', async () => {
    await withServer({ maxMessagesPerSecond: 5 }, async (_server, url) => {
      const a = new Client(url);
      await a.id();
      for (let i = 0; i < 30; i++) a.send({ x: 0.5, y: 0.5 });
      assert.equal(await a.closed, 1008);
    });
  });

  it('refuses players over the limit (1013), in total and per address', async () => {
    await withServer({ maxClients: 2 }, async (server, url) => {
      const a = new Client(url);
      const b = new Client(url);
      await Promise.all([a.id(), b.id()]);
      const c = new Client(url);
      assert.equal(await c.closed, 1013);
      assert.equal(server.connections(), 2);
      a.close();
      b.close();
    });
    await withServer({ maxClientsPerIp: 1, trustProxy: true }, async (_server, url) => {
      const a = new Client(url, { headers: { 'X-Real-IP': '203.0.113.7' } });
      await a.id();
      const same = new Client(url, { headers: { 'X-Real-IP': '203.0.113.7' } });
      assert.equal(await same.closed, 1013);
      const other = new Client(url, { headers: { 'X-Real-IP': '198.51.100.9' } });
      await other.id();
      a.close();
      other.close();
    });
  });

  it('drops clients that stop answering pings', async () => {
    await withServer({ heartbeatMs: 100 }, async (server, url) => {
      const quiet = new Client(url, { autoPong: false });
      const fine = new Client(url);
      await Promise.all([quiet.id(), fine.id()]);
      assert.equal(await quiet.closed, 1006);
      await new Promise((r) => setTimeout(r, 300));
      assert.equal(fine.ws.readyState, WebSocket.OPEN);
      assert.equal(server.connections(), 1);
      fine.close();
    });
  });

  it('accepts WebSockets only on /ws', async () => {
    await withServer({}, async (server) => {
      const wrong = new WebSocket(`ws://127.0.0.1:${server.port}/other`);
      const outcome = await new Promise<string>((resolve) => {
        wrong.on('open', () => resolve('open'));
        wrong.on('error', () => resolve('error'));
      });
      assert.equal(outcome, 'error');
    });
  });
});
