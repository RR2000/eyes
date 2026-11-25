// Browser side: sends where the pointer is, draws every player and the ball from the server's state.
import {
  BALL_RADIUS,
  PLAYER_RADIUS,
  clamp01,
  round4,
  wsUrlFor,
  type Point,
  type PlayerState,
  type ServerMessage,
} from '../shared/game.js';

const SEND_EVERY_MS = 40;
const RECONNECT_MIN_MS = 1000;
const RECONNECT_MAX_MS = 15_000;

const field = document.getElementById('square') as HTMLElement;
const statusLine = document.getElementById('status') as HTMLElement;
const eyes = new Map<string, HTMLElement>();
const ballEl = document.createElement('div');
ballEl.className = 'ball';
ballEl.hidden = true;
field.append(ballEl);

let socket: WebSocket | null = null;
let myId: string | null = null;
let mine: Point | null = null;
let pending: Point | null = null;
let retryMs = RECONNECT_MIN_MS;
let retryTimer: number | undefined;
let online = 0;

/** translate() percentages refer to the element itself: centre at (x, y) whatever the field size. */
function place(el: HTMLElement, p: Point, radius: number, scale = 1) {
  const tx = ((p.x - radius) / (2 * radius)) * 100;
  const ty = ((p.y - radius) / (2 * radius)) * 100;
  el.style.transform = `translate(${tx}%, ${ty}%) scale(${scale})`;
}

function eyeFor(id: string): HTMLElement {
  let el = eyes.get(id);
  if (!el) {
    el = document.createElement('div');
    el.className = id === myId ? 'eye me' : 'eye';
    const iris = document.createElement('span');
    iris.className = 'iris';
    el.append(iris);
    field.append(el);
    eyes.set(id, el);
  }
  return el;
}

function render(ball: Point, players: PlayerState[]) {
  place(ballEl, ball, BALL_RADIUS);
  ballEl.hidden = false;
  const seen = new Set<string>();
  for (const p of players) {
    seen.add(p.id);
    const el = eyeFor(p.id);
    el.style.setProperty('--hue', String(p.hue));
    el.classList.toggle('hit', p.hit);
    // my own eye follows the pointer right away, without waiting for the round trip
    place(el, p.id === myId && mine ? mine : p, PLAYER_RADIUS, p.size);
  }
  for (const [id, el] of eyes) {
    if (!seen.has(id)) {
      el.remove();
      eyes.delete(id);
    }
  }
  online = players.filter((p) => p.size === 1).length;
  showStatus();
}

function showStatus(text?: string) {
  if (text === undefined) {
    text = mine ? `${online} playing` : `${online} playing - move the mouse or drag a finger`;
  }
  if (statusLine.textContent !== text) statusLine.textContent = text;
}

function connect() {
  clearTimeout(retryTimer);
  const ws = new WebSocket(wsUrlFor(location));
  socket = ws;
  ws.addEventListener('open', () => {
    retryMs = RECONNECT_MIN_MS;
    if (mine) pending = mine;
    showStatus();
  });
  ws.addEventListener('message', (event) => {
    if (typeof event.data !== 'string') return;
    let msg: ServerMessage;
    try {
      msg = JSON.parse(event.data) as ServerMessage;
    } catch {
      return;
    }
    if (msg.t === 'hello') {
      myId = msg.id;
      for (const el of eyes.values()) el.remove();
      eyes.clear();
    } else if (msg.t === 'state') {
      render(msg.ball, msg.players);
    }
  });
  ws.addEventListener('close', (event) => {
    if (socket !== ws) return;
    socket = null;
    myId = null;
    const wait = Math.round(retryMs * (0.75 + Math.random() * 0.5));
    retryMs = Math.min(retryMs * 2, RECONNECT_MAX_MS);
    showStatus(event.code === 1013 ? 'The game is full, retrying...' : 'Connection lost, reconnecting...');
    retryTimer = window.setTimeout(connect, wait);
  });
}

function onPointer(event: PointerEvent) {
  const rect = field.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  mine = {
    x: round4(clamp01((event.clientX - rect.left) / rect.width)),
    y: round4(clamp01((event.clientY - rect.top) / rect.height)),
  };
  pending = mine;
  if (myId) {
    const el = eyes.get(myId);
    if (el) place(el, mine, PLAYER_RADIUS);
  }
}

window.addEventListener('pointerdown', onPointer);
window.addEventListener('pointermove', onPointer);
// no scrolling, pull-to-refresh or pinch zoom while playing with a finger
document.addEventListener('touchmove', (event) => event.preventDefault(), { passive: false });
document.addEventListener('gesturestart', (event) => event.preventDefault());

window.setInterval(() => {
  if (pending && socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(pending));
    pending = null;
  }
}, SEND_EVERY_MS);

// back online or back to the tab: do not wait for the backoff
window.addEventListener('online', () => {
  if (!socket) connect();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !socket) connect();
});

connect();
