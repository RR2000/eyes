import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BALL_RADIUS,
  BALL_SPEED,
  PLAYER_RADIUS,
  createRateLimit,
  isColliding,
  newBall,
  parseClientMessage,
  stepBall,
  wsUrlFor,
} from '../shared/game.js';

describe('isColliding', () => {
  const reach = PLAYER_RADIUS + BALL_RADIUS;
  it('touches when the circles meet', () => {
    assert.equal(isColliding({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }), true);
    assert.equal(isColliding({ x: 0.5, y: 0.5 }, { x: 0.5 + reach * 0.99, y: 0.5 }), true);
    assert.equal(isColliding({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 - reach * 0.99 }), true);
  });
  it('does not touch when they are apart, also on the diagonal', () => {
    assert.equal(isColliding({ x: 0.5, y: 0.5 }, { x: 0.5 + reach * 1.01, y: 0.5 }), false);
    const d = (reach / Math.SQRT2) * 1.01;
    assert.equal(isColliding({ x: 0.5, y: 0.5 }, { x: 0.5 + d, y: 0.5 + d }), false);
  });
});

describe('ball', () => {
  it('starts in the centre at full speed, never along an axis', () => {
    for (const r of [0, 0.1, 0.249, 0.5, 0.999]) {
      const b = newBall(() => r);
      assert.deepEqual([b.x, b.y], [0.5, 0.5]);
      assert.ok(Math.abs(Math.hypot(b.vx, b.vy) - BALL_SPEED) < 1e-9);
      assert.ok(Math.abs(b.vx) > 0.3 * BALL_SPEED && Math.abs(b.vy) > 0.3 * BALL_SPEED);
    }
  });
  it('moves by speed x time', () => {
    const b = stepBall({ x: 0.5, y: 0.5, vx: 0.2, vy: -0.1 }, 500);
    assert.ok(Math.abs(b.x - 0.6) < 1e-9 && Math.abs(b.y - 0.45) < 1e-9);
  });
  it('bounces off the edges and stays inside the field', () => {
    let b = stepBall({ x: 1 - BALL_RADIUS - 0.01, y: 0.5, vx: 0.4, vy: 0 }, 100);
    assert.ok(b.vx < 0, 'bounced back');
    assert.ok(b.x <= 1 - BALL_RADIUS);
    b = newBall(() => 0.3);
    for (let i = 0; i < 5000; i++) {
      b = stepBall(b, 50);
      assert.ok(b.x >= BALL_RADIUS && b.x <= 1 - BALL_RADIUS && b.y >= BALL_RADIUS && b.y <= 1 - BALL_RADIUS);
    }
  });
  it('ignores negative or huge time steps', () => {
    const start = { x: 0.5, y: 0.5, vx: 0.2, vy: 0.2 };
    assert.deepEqual(stepBall(start, -100), start);
    const far = stepBall(start, 60_000);
    assert.ok(far.x >= BALL_RADIUS && far.x <= 1 - BALL_RADIUS);
  });
});

describe('parseClientMessage', () => {
  it('accepts a position inside the field', () => {
    assert.deepEqual(parseClientMessage('{"x":0,"y":1}'), { x: 0, y: 1 });
    assert.deepEqual(parseClientMessage('{"x":0.25,"y":0.75,"extra":"ignored"}'), { x: 0.25, y: 0.75 });
  });
  it('rejects everything else', () => {
    for (const raw of [
      '',
      'not json',
      'null',
      '[0.1,0.2]',
      '"x"',
      '{"x":0.5}',
      '{"x":"0.5","y":0.5}',
      '{"x":-0.01,"y":0.5}',
      '{"x":0.5,"y":1.01}',
      '{"x":1e999,"y":0.5}',
      '{"x":null,"y":0.5}',
      `{"x":0.5,"y":0.5,"pad":"${'a'.repeat(300)}"}`,
    ]) {
      assert.equal(parseClientMessage(raw), null, raw.slice(0, 40));
    }
  });
});

describe('createRateLimit', () => {
  it('accepts up to the limit per second, drops the extra, kicks at 3x', () => {
    const rate = createRateLimit(10);
    const verdicts = Array.from({ length: 31 }, () => rate(1000));
    assert.deepEqual(verdicts.slice(0, 10), Array(10).fill('ok'));
    assert.deepEqual(verdicts.slice(10, 30), Array(20).fill('drop'));
    assert.equal(verdicts[30], 'kick');
  });
  it('starts again in the next second', () => {
    const rate = createRateLimit(2);
    assert.deepEqual([rate(0), rate(10), rate(20)], ['ok', 'ok', 'drop']);
    assert.deepEqual([rate(1000), rate(1500), rate(1999), rate(2000)], ['ok', 'ok', 'drop', 'ok']);
  });
});

describe('wsUrlFor', () => {
  it('uses wss on https and the same host', () => {
    assert.equal(wsUrlFor({ protocol: 'https:', host: 'eyes.example.org' }), 'wss://eyes.example.org/ws');
    assert.equal(wsUrlFor({ protocol: 'http:', host: 'localhost:8080' }), 'ws://localhost:8080/ws');
  });
});
