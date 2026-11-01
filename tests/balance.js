// Bot giả lập người chơi để đo độ khó từng màn:  npm run balance
// Mỗi lần vẽ tốn `draw` giây; vẽ đúng với xác suất `acc`; chạm phá ký tự rơi tốn 0.35s.
import { Sim } from '../web/src/core/sim.js';
import { BAL, LEVELS, CX, hasSpell } from '../web/src/core/config.js';
import { strokeGeometry } from '../web/src/core/recognizer.js';

/** Nét vẽ người chơi nhắm vào con ma g (lệch tay ngẫu nhiên). */
function aimAt(s, g, rand) {
  const x = g.x + (rand() - 0.5) * 50, y = g.y + (rand() - 0.5) * 50;
  const P = {
    HORIZONTAL: [[x - 120, y], [x + 120, y]], VERTICAL: [[x, y - 120], [x, y + 120]],
    DIAGONAL: [[x - 90, y + 90], [x + 90, y - 90]], HAT_UP: [[x - 80, y + 70], [x, y - 70], [x + 80, y + 70]],
    HAT_DOWN: [[x - 80, y - 70], [x, y + 70], [x + 80, y - 70]],
  }[s];
  return P ? strokeGeometry(P) : null;
}

// aim: vẽ đúng chỗ con ma (để bùa quét trúng thêm ma cùng hàng). Người mới thường vẽ bừa giữa màn.
const PROFILES = {
  'giỏi':       { draw: 0.7, acc: 0.95, aim: true },
  'trung bình': { draw: 0.95, acc: 0.85, aim: true },
  'mới chơi':   { draw: 1.3, acc: 0.75, aim: false },
};
const DT = 1 / 60;

export function play(level, p, seed) {
  const sim = new Sim(seed, level);
  let busy = 0, rnd = seed * 9301 + 49297;
  const rand = () => ((rnd = (rnd * 9301 + 49297) % 233280) / 233280);
  for (let t = 0; t < 300; t += DT) {
    sim.tick(DT);
    sim.ev.length = 0;
    if (sim.finale) sim.finishBoss();   // game thật: Session diễn đòn kết liễu rồi mới gọi
    if (sim.finale) sim.finishBoss();
    if (sim.over || sim.cleared || sim.won) break;
    if ((busy -= DT) > 0) continue;

    const danger = sim.syms.find((s) => Math.abs(s.x - CX) < BAL.symHitR && s.y > 120);
    const foes = sim.ghosts.filter((g) => !g.heal);
    const heal = sim.ghosts.find((g) => g.heal && g.x > 40 && g.x < 920);
    if (danger) { sim.pop(danger.x, danger.y); busy = 0.35; continue; }
    // lá chắn (1 lần/màn): khi boss hoặc ma sắp cắn tới nơi
    const close = foes.find((g) => Math.hypot(g.x - CX, g.y - 385) < (g.boss ? 230 : 120));
    if (hasSpell(sim.level, 'SHIELD') && !sim.shieldUsed && close && (close.boss || sim.hp <= 2)) { busy = p.draw * 1.3; if (rand() < p.acc) sim.cast('SHIELD'); continue; }
    if (hasSpell(sim.level, 'HOURGLASS') && !sim.slowUsed && (foes.length >= 5 || foes.some((g) => g.boss && !g.ent))) { busy = p.draw * 1.3; if (rand() < p.acc) sim.cast('HOURGLASS'); continue; }

    const pal = sim.pals.find((q) => q.cd <= 0);   // người chơi chạm biểu tượng bạn đồng hành khi sẵn sàng
    if (pal && foes.length >= 2 && rand() < 0.5) { busy = 0.4; sim.usePal(pal.who); continue; }
    let spell = null, target = null;
    const canBolt = hasSpell(sim.level, 'LIGHTNING') && sim.boltCd === 0;
    if (canBolt && sim.gloom > 0) spell = 'LIGHTNING';   // nến tắt: thắp sáng trước
    else if (canBolt && (foes.length >= 3 || sim.syms.length >= 2 || foes.some((g) => g.seq[g.i] === 'LIGHTNING'))) spell = 'LIGHTNING';
    else if (heal && sim.hp <= 3) spell = 'HEART';
    else if (foes.length) {
      const ok = foes.filter((g) => (g.seq[g.i] !== 'LIGHTNING' || canBolt) && (sim.gloom <= 0 || g.boss));   // nến tắt: không thấy ký hiệu ma thường   // ma khiên: chờ sét hồi
      if (ok.length) {
        const near = ok.reduce((a, b) => (Math.hypot(a.x - CX, a.y - 385) < Math.hypot(b.x - CX, b.y - 385) ? a : b));
        spell = near.seq[near.i]; target = near;
      }
    } else if (heal && sim.hp < BAL.hp) spell = 'HEART';
    if (!spell) continue;
    busy = p.draw * (0.8 + rand() * 0.4);
    const acc = p.acc - (target?.inv ? 0.12 : 0);   // ký hiệu đảo: dễ vẽ nhầm hơn
    if (rand() < acc) sim.cast(spell, target && p.aim ? aimAt(spell, target, rand) : null); else sim.cast(spell === 'HORIZONTAL' ? 'VERTICAL' : 'HORIZONTAL');
  }
  hpLeft += sim.cleared || sim.won ? sim.hp : 0;
  return sim.cleared || sim.won;
}
let hpLeft = 0;

const N = Number(process.env.N) || 200;
console.log('Tỉ lệ qua màn · máu còn lại trung bình (bắt đầu đủ máu,', N, 'lượt/ô):');
console.log('màn'.padEnd(26), Object.keys(PROFILES).map((k) => k.padStart(11)).join(''));
for (const l of Object.keys(LEVELS).map(Number)) {
  const cells = Object.values(PROFILES).map((p) => {
    let win = 0;
    for (let s = 1; s <= N; s++) win += play(l, p, s * 7919 + l) ? 1 : 0;
    const r = `${Math.round((win / N) * 100)}%·${(hpLeft / Math.max(1, win)).toFixed(1)}♥`.padStart(11); hpLeft = 0;
    return r;
  });
  console.log(`${l}. ${LEVELS[l].name}`.padEnd(26), cells.join(''));
}
