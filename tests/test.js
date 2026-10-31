// npm test — kiểm tra nhận dạng bùa + luật game (không cần trình duyệt)
import assert from 'node:assert/strict';
import { recognize, strokeGeometry } from '../web/src/core/recognizer.js';
import { Sim } from '../web/src/core/sim.js';
import { BAL, LAST, LEVELS } from '../web/src/core/config.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓', name); };
const line = (a, b, n = 20) => Array.from({ length: n }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / (n - 1), a[1] + ((b[1] - a[1]) * i) / (n - 1)]);
const path = (...p) => p.slice(1).flatMap((q, i) => line(p[i], q, 12));
const run = (sim, sec) => { for (let i = 0; i < sec * 60; i++) sim.tick(1 / 60); };

console.log('Nhận dạng bùa');
test('ngang', () => assert.equal(recognize(line([0, 0], [200, 5])), 'HORIZONTAL'));
test('dọc', () => assert.equal(recognize(line([0, 0], [4, 200])), 'VERTICAL'));
test('chéo / và \\', () => {
  assert.equal(recognize(line([0, 150], [150, 0])), 'DIAGONAL');
  assert.equal(recognize(line([0, 0], [150, 140])), 'DIAGONAL');
});
test('∧ và ∨', () => {
  assert.equal(recognize(path([0, 200], [100, 0], [200, 200])), 'HAT_UP');
  assert.equal(recognize(path([0, 0], [100, 200], [200, 0])), 'HAT_DOWN');
});
test('sét zigzag', () => assert.equal(recognize(path([0, 0], [100, 60], [0, 120], [100, 180], [20, 240])), 'LIGHTNING'));
test('tim / vòng kín', () => {
  const circle = Array.from({ length: 40 }, (_, i) => [100 + 60 * Math.cos((i / 39) * 6.28), 100 + 60 * Math.sin((i / 39) * 6.28)]);
  assert.equal(recognize(circle), 'HEART');
});
test('nét quá ngắn bị bỏ qua', () => assert.equal(recognize(line([0, 0], [20, 0])), null));

console.log('Luật game');
test('đợt 1 xuất hiện đồng thời, không chồng nhau', () => {
  const s = new Sim(5, 1); run(s, 1.05);
  assert.equal(s.ghosts.length, LEVELS[1].waves[0].n);
  for (const a of s.ghosts) for (const b of s.ghosts) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 120);
});
test('vẽ đúng hết bùa -> qua màn 1, đếm đủ số ma', () => {
  const s = new Sim(5, 1);
  for (let n = 0; n < 6000 && !s.cleared; n++) {
    s.hp = BAL.hp;
    const g = s.ghosts.find((x) => !x.heal);
    if (g) s.cast(g.seq[g.i]);
    s.tick(1 / 60);
  }
  assert.ok(s.cleared);
  assert.equal(s.kills, LEVELS[1].waves.reduce((a, w) => a + w.n, 0));
});
test('ma tim không xuất hiện khi đủ máu', () => {
  const s = new Sim(5, 1);
  for (let i = 0; i < 1200; i++) { s.hp = BAL.hp; s.tick(1 / 60); s.ghosts = s.ghosts.filter((g) => g.heal); }
  assert.ok(!s.ghosts.some((g) => g.heal));
});
test('ma tim xuất hiện khi thiếu máu, không gây sát thương, vẽ ♥ hồi 1 máu', () => {
  const s = new Sim(5, 1); s.hp = 3;
  for (let i = 0; i < 1200 && !s.ghosts.some((g) => g.heal); i++) { s.tick(1 / 60); s.ghosts = s.ghosts.filter((g) => g.heal); }
  const h = s.ghosts.find((g) => g.heal); assert.ok(h);
  run(s, 3); assert.equal(s.hp, 3);
  assert.ok(s.cast('HEART')); assert.equal(s.hp, 4);
});
test('bùa trúng con ma gần nhất cần đúng bùa đó', () => {
  const s = new Sim(1, 1);
  s.ghosts = [
    { id: 1, x: 900, y: 100, vx: 0, vy: 0, sp: 0, seq: ['VERTICAL'], i: 0, sz: 1, boss: false, heal: false, ph: 1 },
    { id: 2, x: 600, y: 300, vx: 0, vy: 0, sp: 0, seq: ['VERTICAL'], i: 0, sz: 1, boss: false, heal: false, ph: 1 },
  ];
  s.cast('VERTICAL');
  assert.deepEqual(s.ghosts.map((g) => g.id), [1]);
  assert.equal(s.cast('HORIZONTAL'), false);
});
test('sét: mọi ma mất 1 bùa, phá ký tự rơi, có hồi chiêu', () => {
  const s = new Sim(5, 1); run(s, 1.1);
  s.syms.push({ x: 480, y: 100, vy: 0, ch: '🎃' });
  const before = s.ghosts.map((g) => g.seq.length - g.i);
  assert.ok(s.cast('LIGHTNING'));
  assert.equal(s.syms.length, 0);
  assert.ok(s.ghosts.length < before.length || s.ghosts.every((g) => g.i === 1));
  assert.equal(s.cast('LIGHTNING'), false);
});
test('boss: 2 pha rồi thắng game', () => {
  const s = new Sim(5, LAST);
  s.waves = [{ n: 1, m: 3, v: 1, s: 3, t: 0, boss: true }]; s.nWaves = 1;
  s.tick(0.1);
  const b = s.ghosts[0]; assert.ok(b.boss);
  for (let i = 0; i < 3; i++) s.cast(b.seq[b.i]);
  assert.equal(b.ph, 2); assert.ok(!s.won);
  for (let i = 0; i < 3; i++) s.cast(b.seq[b.i]);
  s.tick(0.1); assert.ok(s.won);
});
test('boss thả ký tự rơi, chạm để phá', () => {
  const s = new Sim(5, LAST);
  s.waves = [{ n: 1, m: 3, v: 0.01, s: 3, t: 0, boss: true }];
  run(s, BAL.symEvery + 0.2);
  assert.ok(s.syms.length >= 1);
  const y = s.syms[0];
  assert.equal(s.pop(y.x, y.y), 1);
});
test('cùng seed -> cùng diễn biến (cần cho online/replay)', () => {
  const a = new Sim(42, 2), b = new Sim(42, 2); run(a, 10); run(b, 10);
  assert.deepEqual(a.ghosts.map((g) => [g.x, g.y, g.seq]), b.ghosts.map((g) => [g.x, g.y, g.seq]));
});

console.log('Bùa quét nhiều ma');
const ghost = (id, x, y, s, extra = {}) => ({ id, x, y, vx: 0, vy: 0, sp: 0, seq: Array.isArray(s) ? s : [s], i: 0, sz: 1, boss: false, heal: false, ph: 1, ...extra });
const geoOf = (pts) => strokeGeometry(pts);
test('ngang: trúng cả hàng, bỏ qua ma khác hàng / khác bùa', () => {
  const s = new Sim(1, 1);
  s.ghosts = [ghost(1, 150, 200, 'HORIZONTAL'), ghost(2, 480, 210, 'HORIZONTAL'), ghost(3, 820, 190, 'HORIZONTAL'),
    ghost(4, 480, 360, 'HORIZONTAL'), ghost(5, 300, 200, 'VERTICAL')];
  assert.ok(s.cast('HORIZONTAL', geoOf(line([400, 205], [600, 205]))));
  assert.deepEqual(s.ghosts.map((g) => g.id).sort(), [4, 5]);
  assert.equal(s.kills, 3);
  assert.ok(s.ev.some((e) => e.k === 'combo' && e.n === 3));
});
test('dọc: trúng cả cột', () => {
  const s = new Sim(1, 1);
  s.ghosts = [ghost(1, 300, 80, 'VERTICAL'), ghost(2, 310, 260, 'VERTICAL'), ghost(3, 700, 200, 'VERTICAL')];
  s.cast('VERTICAL', geoOf(line([305, 150], [305, 300])));
  assert.deepEqual(s.ghosts.map((g) => g.id), [3]);
});
test('chéo: trúng ma dọc theo đường chéo kéo dài', () => {
  const s = new Sim(1, 1);
  s.ghosts = [ghost(1, 200, 400, 'DIAGONAL'), ghost(2, 500, 100, 'DIAGONAL'), ghost(3, 200, 100, 'DIAGONAL')];
  s.cast('DIAGONAL', geoOf(line([300, 300], [400, 200])));   // đường y = 600 - x
  assert.deepEqual(s.ghosts.map((g) => g.id), [3]);
});
test('V: trúng ma trong khung chữ V', () => {
  const s = new Sim(1, 1);
  s.ghosts = [ghost(1, 300, 200, 'HAT_UP'), ghost(2, 380, 260, 'HAT_UP'), ghost(3, 800, 200, 'HAT_UP')];
  s.cast('HAT_UP', geoOf(path([250, 300], [330, 150], [420, 300])));
  assert.deepEqual(s.ghosts.map((g) => g.id), [3]);
});
test('ma nhiều bùa chỉ mất 1 bùa mỗi nét', () => {
  const s = new Sim(1, 1);
  s.ghosts = [ghost(1, 200, 200, ['HORIZONTAL', 'VERTICAL']), ghost(2, 600, 200, 'HORIZONTAL')];
  s.cast('HORIZONTAL', geoOf(line([100, 200], [700, 200])));
  assert.equal(s.ghosts.length, 1); assert.equal(s.ghosts[0].i, 1);
});
test('vẽ chỗ không có ma -> vẫn đánh con gần nhân vật nhất', () => {
  const s = new Sim(1, 1);
  s.ghosts = [ghost(1, 900, 100, 'HORIZONTAL'), ghost(2, 600, 300, 'HORIZONTAL')];
  s.cast('HORIZONTAL', geoOf(line([100, 500], [300, 500])));
  assert.deepEqual(s.ghosts.map((g) => g.id), [1]);
  assert.ok(s.ev.some((e) => e.k === 'area' && e.fb));
});
console.log(`\n${passed} test đạt`);
