// npm test — kiểm tra nhận dạng bùa + luật game (không cần trình duyệt)
import assert from 'node:assert/strict';
import { recognize, strokeGeometry } from '../web/src/core/recognizer.js';
import { Sim } from '../web/src/core/sim.js';
import { BAL, LAST, LEVELS, CX, CY } from '../web/src/core/config.js';

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

// Ngón tay trên điện thoại: rung tay + móc ở đầu/cuối nét + vẽ nhỏ. Bản cũ nhận nhầm gần như mọi nét thẳng.
let sd = 7; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647) - 0.5;
const finger = (poly, amp, scale = 1) => {
  const P = poly.map(([x, y]) => [x * scale, y * scale]), out = [[P[0][0] - 6, P[0][1] + 4]];
  let wob = 0;
  for (let k = 1; k < P.length; k++) {
    const [ax, ay] = P[k - 1], [bx, by] = P[k], n = Math.max(2, Math.round(Math.hypot(bx - ax, by - ay) / 3));
    for (let i = 0; i < n; i++) { wob = wob * 0.7 + rnd() * amp; out.push([ax + ((bx - ax) * i) / n + rnd() * amp + wob, ay + ((by - ay) * i) / n + rnd() * amp - wob]); }
  }
  const z = P[P.length - 1]; out.push(z, [z[0] + 3, z[1] + 6]);
  return out;
};
const SHAPES = {
  HORIZONTAL: [[0, 0], [200, 0]], VERTICAL: [[0, 0], [0, 200]], DIAGONAL: [[0, 160], [160, 0]],
  HAT_UP: [[0, 180], [90, 0], [180, 180]], HAT_DOWN: [[0, 0], [90, 180], [180, 0]], LIGHTNING: [[0, 0], [100, 50], [0, 110], [100, 170]],
};
test('nét ngón tay rung (cỡ to và nhỏ) vẫn nhận đúng ≥ 97%', () => {
  for (const [name, poly] of Object.entries(SHAPES)) for (const scale of [1, 0.5]) {
    let ok = 0;
    for (let r = 0; r < 100; r++) if (recognize(finger(poly, 4, scale), { touch: true }) === name) ok++;
    assert.ok(ok >= 97, `${name} cỡ ${scale}: chỉ đúng ${ok}%`);
  }
});
test('nét thẳng rung tay KHÔNG bị nhận thành sét', () => {
  for (let r = 0; r < 200; r++) assert.notEqual(recognize(finger(SHAPES.HORIZONTAL, 4, 0.5), { touch: true }), 'LIGHTNING');
});

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
test('bùa trúng cả 2 con cùng ký hiệu, dù ở xa nhau', () => {
  const s = new Sim(1, 1);
  s.ghosts = [
    { id: 1, x: 900, y: 100, vx: 0, vy: 0, sp: 0, seq: ['VERTICAL'], i: 0, sz: 1, boss: false, heal: false, ph: 1 },
    { id: 2, x: 600, y: 300, vx: 0, vy: 0, sp: 0, seq: ['VERTICAL'], i: 0, sz: 1, boss: false, heal: false, ph: 1 },
  ];
  s.cast('VERTICAL');
  assert.deepEqual(s.ghosts.map((g) => g.id), []);
  assert.equal(s.cast('HORIZONTAL'), false);
});
test('sét: mọi ma mất 1 bùa, phá ký tự rơi, có hồi chiêu', () => {
  const s = new Sim(5, 2); run(s, 1.1);
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
  assert.ok(s.finale === b && s.ev.some((e) => e.k === 'finale'), 'hết bùa pha cuối -> chờ đòn kết liễu');
  s.tick(1); assert.ok(!s.won && s.ghosts[0] === b, 'trong lúc diễn: đứng yên, chưa thắng');
  s.finishBoss(); assert.ok(s.won && !s.ghosts.length);
});
test('boss lướt vào từ mép phải rồi mới tiến về nhân vật', () => {
  const s = new Sim(5, LAST);
  s.waves = [{ n: 1, m: 3, v: 1, s: 3, t: 0, boss: true }]; s.nWaves = 1;
  s.tick(0.01);
  const b = s.ghosts[0];
  assert.ok(b.x > 960 && b.ent === 1, 'xuất hiện ngoài mép phải');
  run(s, 1.5);
  assert.ok(!b.ent && b.x < 960 && b.vy > 0, 'đã vào màn, bay về phía nhân vật');
});
test('boss thả ký tự rơi, chạm để phá', () => {
  const s = new Sim(5, LAST);
  s.waves = [{ n: 1, m: 3, v: 0.01, s: 3, t: 0, boss: true }]; s.pals = [];
  run(s, BAL.symEvery + 1.5);   // boss lướt vào xong mới bắt đầu ném
  assert.ok(s.syms.length >= 1);
  const y = s.syms[0];
  assert.equal(s.pop(y.x, y.y), 1);
});
test('cùng seed -> cùng diễn biến (cần cho online/replay)', () => {
  const a = new Sim(42, 2), b = new Sim(42, 2); run(a, 10); run(b, 10);
  assert.deepEqual(a.ghosts.map((g) => [g.x, g.y, g.seq]), b.ghosts.map((g) => [g.x, g.y, g.seq]));
});

console.log('Bùa trúng mọi ma cùng ký hiệu');
const ghost = (id, x, y, s, extra = {}) => ({ id, x, y, vx: 0, vy: 0, sp: 0, seq: Array.isArray(s) ? s : [s], i: 0, sz: 1, boss: false, heal: false, ph: 1, ...extra });
const geoOf = (pts) => strokeGeometry(pts);
test('vẽ 1 ký hiệu -> MỌI ma có ký hiệu đó đều trúng, ở đâu trên màn cũng vậy', () => {
  const s = new Sim(1, 1);
  s.ghosts = [ghost(1, 150, 200, 'HAT_DOWN'), ghost(2, 480, 60, 'HAT_DOWN'), ghost(3, 820, 330, 'HAT_DOWN'), ghost(4, 300, 200, 'VERTICAL')];
  assert.ok(s.cast('HAT_DOWN', geoOf(path([600, 450], [650, 500], [700, 450]))));   // vẽ ở góc dưới, xa hết các con
  assert.deepEqual(s.ghosts.map((g) => g.id), [4], 'ma khác ký hiệu không bị ảnh hưởng');
  assert.equal(s.kills, 3);
  assert.ok(s.ev.some((e) => e.k === 'combo' && e.n === 3));
  assert.equal(s.ev.find((e) => e.k === 'cast').targets.length, 3);
});
test('ma nhiều ký hiệu chỉ mất ký hiệu đầu; ma chỉ còn ký hiệu đó thì bị diệt', () => {
  const s = new Sim(1, 1);
  s.ghosts = [ghost(1, 200, 200, ['HORIZONTAL', 'VERTICAL']), ghost(2, 600, 200, 'HORIZONTAL'), ghost(3, 400, 100, ['VERTICAL', 'HORIZONTAL'])];
  s.cast('HORIZONTAL');
  assert.deepEqual(s.ghosts.map((g) => [g.id, g.i]), [[1, 1], [3, 0]], 'con 3 đang chờ │ nên không mất ─');
  s.cast('VERTICAL');
  assert.deepEqual(s.ghosts.map((g) => [g.id, g.i]), [[3, 1]], 'con 1 hết ký hiệu -> bị diệt; con 3 mất │');
});
test('vẽ ký hiệu không con nào cần -> trượt', () => {
  const s = new Sim(1, 1);
  s.ghosts = [ghost(1, 900, 100, 'HORIZONTAL')];
  assert.equal(s.cast('VERTICAL'), false);
  assert.ok(s.ev.some((e) => e.k === 'miss'));
});
test('sét trúng cùng lúc boss (bùa cuối) và ma khác: boss vẫn được giữ cho đòn kết liễu', () => {
  const s = new Sim(5, LAST);
  s.waves = [];
  const b = { ...ghost(1, 600, 200, 'HORIZONTAL'), boss: true, sz: 3, ph: 2 };
  s.ghosts = [b, ghost(2, 300, 200, 'VERTICAL'), ghost(3, 700, 260, 'DIAGONAL')];
  s.cast('LIGHTNING');
  assert.equal(s.finale, b); assert.deepEqual(s.ghosts, [b]);
});
console.log('Lá chắn');
const ring = (cx, cy, r) => Array.from({ length: 48 }, (_, i) => [cx + r * Math.cos((i / 47) * 6.28), cy + r * Math.sin((i / 47) * 6.28)]);
test('vòng tròn QUANH nhân vật = lá chắn; vòng ở chỗ khác vẫn là tim', () => {
  assert.equal(recognize(ring(CX, CY, 130), { around: [CX, CY] }), 'SHIELD');
  assert.equal(recognize(ring(CX + 20, CY - 30, 100), { around: [CX, CY], touch: true }), 'SHIELD');
  assert.equal(recognize(ring(CX + 250, 180, 60), { around: [CX, CY] }), 'HEART');
});
test('lá chắn: hất ma ra, không cho cắn, phá đồ rơi; mỗi màn 1 lần', () => {
  const s = new Sim(3, 3);
  s.waves = [];
  s.ghosts = [ghost(1, CX + 90, CY - 60, 'HORIZONTAL'), ghost(2, CX - 400, CY - 200, 'VERTICAL')];
  for (const g of s.ghosts) s.aim(g, 120);
  s.syms.push({ x: CX, y: 100, vy: 115, ch: '🎃', w: 0 });
  const near0 = Math.hypot(s.ghosts[0].x - CX, s.ghosts[0].y - CY);
  assert.equal(s.cast('SHIELD'), true);
  assert.ok(Math.hypot(s.ghosts[0].x - CX, s.ghosts[0].y - CY) > near0 + 100, 'ma gần bị hất ra');
  assert.equal(s.syms.length, 0, 'đồ rơi bị phá');
  const hp = s.hp;
  run(s, BAL.shieldSec - 0.2);
  assert.equal(s.hp, hp, 'trong lúc chắn không mất máu');
  assert.ok(s.ev.some((e) => e.k === 'block'));
  assert.equal(s.cast('SHIELD'), false, 'lần 2 trong cùng màn không dùng được');
  assert.equal(new Sim(3, 3).shieldUsed, false, 'màn mới được dùng lại');
});
test('đồ boss rơi có báo trước: chưa rơi trong symWarn giây đầu', () => {
  const s = new Sim(2, LAST);
  s.waves = []; s.pals = []; s.ghosts = [{ ...ghost(9, CX, -70, 'HORIZONTAL'), boss: true, sz: 3 }];
  run(s, BAL.symEvery + 0.05);
  assert.equal(s.syms.length, 1);
  assert.equal(s.syms[0].y, -20, 'đang báo trước, chưa rơi');
  run(s, BAL.symWarn + 0.2);
  assert.ok(s.syms[0].y > -20, 'hết báo trước thì rơi');
});

console.log('Cốt truyện: bùa mở khóa, ma mới, bạn đồng hành');
test('bùa chưa mở khóa: màn 1 chưa có sét, màn 2 chưa có lá chắn, màn 3 chưa có đồng hồ cát', () => {
  const a = new Sim(1, 1); a.ghosts = [ghost(1, 300, 200, 'HORIZONTAL')];
  assert.equal(a.cast('LIGHTNING'), false); assert.ok(a.ev.some((e) => e.k === 'locked'));
  assert.equal(new Sim(1, 2).cast('SHIELD'), false);
  assert.equal(new Sim(1, 3).cast('HOURGLASS'), false);
  assert.equal(new Sim(1, 4).cast('HOURGLASS'), true);
});
test('đồng hồ cát: nét tự cắt chéo qua giữa (⧗ / số 8) -> ma chậm lại, 1 lần mỗi màn', () => {
  assert.equal(recognize(path([330, 170], [470, 170], [330, 330], [470, 330], [330, 170])), 'HOURGLASS');
  const eight = Array.from({ length: 60 }, (_, i) => { const t = (i / 59) * 6.283; return [400 + 60 * Math.sin(2 * t), 250 - 100 * Math.cos(t)]; });
  assert.equal(recognize(eight, { touch: true }), 'HOURGLASS');
  const s = new Sim(1, 4); s.waves = [];
  s.ghosts = [ghost(1, CX - 400, CY - 200, 'VERTICAL')]; s.aim(s.ghosts[0], 100);
  const x0 = s.ghosts[0].x; run(s, 1); const fast = s.ghosts[0].x - x0;
  assert.ok(s.cast('HOURGLASS'));
  const x1 = s.ghosts[0].x; run(s, 1); const slow = s.ghosts[0].x - x1;
  assert.ok(slow < fast * 0.5, `chậm lại (${slow.toFixed(1)} < ${fast.toFixed(1)})`);
  assert.equal(s.cast('HOURGLASS'), false);
});
test('ma khiên: ký hiệu đầu là ⚡, ký hiệu thường không ăn cho tới khi phá khiên', () => {
  const s = new Sim(1, 4); s.waves = [];
  s.ghosts = [ghost(1, 300, 200, ['LIGHTNING', 'HORIZONTAL'], { kind: 'knight' })];
  assert.equal(s.cast('HORIZONTAL'), false);
  assert.ok(s.cast('LIGHTNING')); assert.ok(s.ghosts[0].brk != null);
  assert.ok(s.cast('HORIZONTAL')); assert.equal(s.ghosts.length, 0);
});
test('đàn ma con: cả đàn chung 1 chuỗi ký hiệu -> 1 nét diệt cả đàn', () => {
  const s = new Sim(9, 2);
  s.waves = [{ n: 7, m: 1, v: 1, s: 0.6, t: 0, boss: false, kind: 'swarm' }]; s.pals = [];
  run(s, 0.1);
  assert.equal(new Set(s.ghosts.map((g) => g.seq.join())).size, 1);
  s.cast(s.ghosts[0].seq[0]); assert.equal(s.ghosts.length, 0);
});
test('boss màn 1–4 gục -> qua màn (không đòn kết liễu); chỉ Vua Mực màn cuối mới có', () => {
  const s = new Sim(5, 1); s.waves = [];
  s.ghosts = [{ ...ghost(1, 600, 200, 'HORIZONTAL'), boss: true, ph: 2, kind: 'book' }];
  s.cast('HORIZONTAL'); run(s, 0.1);
  assert.equal(s.finale, null); assert.ok(s.cleared);
});
test('bạn đồng hành: chạm để gọi, có hồi chiêu — Mun xóa ký hiệu, Ộp nuốt ma, Bin đẩy lùi', () => {
  const s = new Sim(3, 4); s.waves = [];
  assert.deepEqual(s.pals.map((p) => p.who), ['mun', 'frog', 'bat']);
  s.ghosts = [ghost(1, CX - 250, CY - 120, ['VERTICAL', 'HAT_UP']), ghost(2, CX + 300, CY - 200, ['HORIZONTAL', 'DIAGONAL'])];
  assert.equal(s.usePal('mun'), false, 'đầu màn chưa hồi xong');
  run(s, 2.1);
  assert.ok(s.usePal('mun')); assert.equal(s.ghosts[0].i, 1, 'Mun xóa 1 ký hiệu của con gần nhất');
  assert.equal(s.usePal('mun'), false, 'vừa dùng -> phải chờ');
  assert.ok(s.usePal('frog')); assert.equal(s.ghosts.length, 1, 'Ộp nuốt trọn 1 con');
  const d0 = Math.hypot(s.ghosts[0].x - CX, s.ghosts[0].y - CY);
  assert.ok(s.usePal('bat')); assert.ok(Math.hypot(s.ghosts[0].x - CX, s.ghosts[0].y - CY) > d0 + 50, 'Bin đẩy lùi');
  assert.ok(!s.ev.some((e) => e.k === 'pal' && false));
});
test('bạn đồng hành không tự ra tay', () => {
  const s = new Sim(3, 4); s.waves = []; s.ghosts = [ghost(1, CX - 300, CY - 150, ['VERTICAL'])];
  for (let i = 0; i < 60 * 20; i++) s.tick(1 / 60);
  assert.ok(!s.ev.some((e) => e.k === 'pal'));
});

console.log('Màn tập');
{
  const { Tutorial, STEPS } = await import('../web/src/game/tutorial.js');
  const { Effects } = await import('../web/src/game/effects.js').catch(() => ({ Effects: null }));
  const fx = Effects ? new Effects() : { toast() {} };
  const sim = new Sim(7, 0), tut = new Tutorial(sim, /** @type {any} */ (fx));
  const dense = (p) => p.slice(1).flatMap((q, i) => line(p[i], q, 16));
  let guard = 0;
  while (!tut.done && guard++ < 5000) {
    for (let k = 0; k < 30; k++) { sim.tick(1 / 60); tut.observe(sim.ev); sim.ev.length = 0; tut.update(1 / 60, false); }
    assert.equal(sim.hp >= BAL.hp - 1, true, 'màn tập không được làm mất máu');
    assert.ok(!sim.cleared && !sim.won && !sim.over);
    const d = tut.demo();
    if (!d) continue;
    if (d.tap) { sim.pop(d.tap[0], d.tap[1]); continue; }
    const pts = dense(d.path), s = recognize(pts, { around: [CX, CY] });
    assert.ok(s, `bước ${tut.i + 1}: nét mẫu phải nhận ra được`);
    sim.cast(s, strokeGeometry(pts));
    tut.tried();
  }
  assert.ok(tut.done, `kẹt ở bước ${tut.i + 1}/${STEPS.length}`);
  assert.equal(sim.hp, BAL.hp, 'bước tim phải hồi đủ máu');
  passed++; console.log(`  ✓ làm theo bàn tay mẫu -> học xong cả ${STEPS.length} bước; ma không cắn, không tự qua màn`);
  // bài học bùa mới của Cô Cú đầu màn 2, 3, 4
  const { LESSONS } = await import('../web/src/game/tutorial.js');
  for (const l of Object.keys(LESSONS).map(Number)) {
    const sim2 = new Sim(7, 0, BAL.hp, 0, l), t2 = new Tutorial(sim2, /** @type {any} */ (fx), LESSONS[l]);
    let g2 = 0;
    while (!t2.done && g2++ < 3000) {
      for (let k = 0; k < 30; k++) { sim2.tick(1 / 60); t2.observe(sim2.ev); sim2.ev.length = 0; t2.update(1 / 60, false); }
      const d = t2.demo();
      if (!d?.path) continue;
      const pts = dense(d.path), s = recognize(pts, { around: [CX, CY] });
      assert.ok(s, `bài màn ${l}, bước ${t2.i + 1}: nét mẫu phải nhận ra được`);
      sim2.cast(s, strokeGeometry(pts));
      t2.tried();
    }
    assert.ok(t2.done, `bài màn ${l} kẹt ở bước ${t2.i + 1}`);
  }
  passed++; console.log(`  ✓ bài học bùa mới màn ${Object.keys(LESSONS).join(', ')} làm theo mẫu được`);
}

console.log(`\n${passed} test đạt`);
