// Game rules and wire protocol, shared by the server and the browser.
// Every coordinate is relative to the square playing field: 0..1 on both axes.

export const PLAYER_RADIUS = 0.05;
export const BALL_RADIUS = 0.03;
/** Field widths per second. */
export const BALL_SPEED = 0.3;
/** How long a player stays red after the last touch of the ball. */
export const HIT_MS = 2000;
/** How long a player who left keeps shrinking before disappearing. */
export const FADE_MS = 10_000;
/** Time constant of the colour mix: two eyes touching meet halfway in about this long. */
export const MIX_MS = 1500;
/** Time constant of the way back to the own colour once apart. */
export const RETURN_MS = 8000;

export interface Point {
  x: number;
  y: number;
}

export interface Ball extends Point {
  vx: number;
  vy: number;
}

/** Client -> server: the only message a browser may send. */
export type ClientMessage = Point;

export interface PlayerState extends Point {
  id: string;
  /** Iris colour, #rrggbb, decided by the server (see color.ts). */
  color: string;
  /** True while the player is red. */
  hit: boolean;
  /** 1 while connected, then down to 0 while fading out. */
  size: number;
}

/** Server -> client. */
export type ServerMessage =
  | { t: 'hello'; id: string }
  | { t: 'state'; ball: Point; players: PlayerState[] };

export function isColliding(player: Point, ball: Point): boolean {
  const dx = player.x - ball.x;
  const dy = player.y - ball.y;
  const reach = PLAYER_RADIUS + BALL_RADIUS;
  return dx * dx + dy * dy <= reach * reach;
}

/** Two eyes touch when their circles overlap. */
export function eyesTouch(a: Point, b: Point): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const reach = 2 * PLAYER_RADIUS;
  return dx * dx + dy * dy <= reach * reach;
}

export interface Mixable extends Point {
  /** Current hue (OKLCH degrees, see color.ts). */
  hue: number;
  /** The player's own hue, where the colour goes back to. */
  baseHue: number;
}

/**
 * One step of the colour mix, dtMs long. Every eye moves towards the mean hue of itself and the eyes it
 * touches (computed from the hues before the step, so the order of the players does not matter); an eye
 * that touches nobody drifts back to its own hue. Exponential steps: smooth at any tick rate.
 */
export function mixHues(players: readonly Mixable[], dtMs: number): number[] {
  const dt = Math.max(0, Math.min(dtMs, 1000));
  const toward = 1 - Math.exp(-dt / MIX_MS);
  const back = 1 - Math.exp(-dt / RETURN_MS);
  return players.map((p, i) => {
    let sum = p.hue;
    let n = 1;
    players.forEach((q, j) => {
      if (j !== i && eyesTouch(p, q)) {
        sum += q.hue;
        n++;
      }
    });
    if (n === 1) return p.hue + (p.baseHue - p.hue) * back;
    return p.hue + (sum / n - p.hue) * toward;
  });
}

/** Starts from the centre in a random direction, never too close to an axis. */
export function newBall(random: () => number = Math.random): Ball {
  const quadrant = Math.floor(random() * 4);
  const angle = (quadrant * Math.PI) / 2 + Math.PI / 8 + random() * (Math.PI / 4);
  return { x: 0.5, y: 0.5, vx: Math.cos(angle) * BALL_SPEED, vy: Math.sin(angle) * BALL_SPEED };
}

/** Moves the ball by dtMs and bounces it off the edges of the field. */
export function stepBall(ball: Ball, dtMs: number): Ball {
  const dt = Math.max(0, Math.min(dtMs, 1000)) / 1000;
  const [x, vx] = bounce(ball.x + ball.vx * dt, ball.vx);
  const [y, vy] = bounce(ball.y + ball.vy * dt, ball.vy);
  return { x, y, vx, vy };
}

function bounce(pos: number, v: number): [number, number] {
  const min = BALL_RADIUS;
  const max = 1 - BALL_RADIUS;
  if (pos < min) return [min + (min - pos), Math.abs(v)];
  if (pos > max) return [max - (pos - max), -Math.abs(v)];
  return [pos, v];
}

/** Parses and validates a message from a browser; null when it is not a valid position. */
export function parseClientMessage(raw: string): ClientMessage | null {
  if (raw.length > 200) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const { x, y } = value as Record<string, unknown>;
  if (!isUnit(x) || !isUnit(y)) return null;
  return { x, y };
}

function isUnit(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;
}

export function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** Rounds a coordinate for the wire: 4 decimals are below a pixel on any screen. */
export function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

/** WebSocket address of the game, on the same origin as the page (wss on https). */
export function wsUrlFor(location: { protocol: string; host: string }): string {
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
}

export type RateVerdict = 'ok' | 'drop' | 'kick';

/**
 * Messages per second for one connection, in one-second windows:
 * up to `limit` are accepted, the extra ones are dropped, more than 3x `limit` closes the connection.
 */
export function createRateLimit(limit: number): (now: number) => RateVerdict {
  let windowStart = -Infinity;
  let count = 0;
  return (now) => {
    if (now - windowStart >= 1000) {
      windowStart = now;
      count = 0;
    }
    count++;
    if (count <= limit) return 'ok';
    return count > limit * 3 ? 'kick' : 'drop';
  };
}
