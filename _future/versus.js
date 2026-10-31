import { Sim } from '../core/sim.js';
import { BAL } from '../core/config.js';
// Mỗi người một màn ma riêng; diệt ma đúng bùa thì đẩy ma sang màn đối thủ.
export function versus(net) {
  const sim = new Sim(Date.now() & 0xffff); let opp = { hp: BAL.hp, score: 0 }, won = false, acc = 0;
  net.on('atk', m => sim.spawn(m.n)).on('st', m => opp = m).on('dead', () => won = true);
  return {
    sim,
    cast(s) { const k = sim.cast(s); if (k) net.send({ t: 'atk', n: s === 'LIGHTNING' ? 3 : BAL.versusAttack }); return k; },
    update(dt) { const was = sim.over; sim.tick(dt); if ((acc += dt) > 0.5) { acc = 0; net.send({ t: 'st', hp: sim.hp, score: sim.score }); } if (sim.over && !was) net.send({ t: 'dead' }); },
    result: () => won ? 'Bạn THẮNG! 🎉' : sim.over ? 'Bạn thua rồi…' : null,
    hud: () => `Đối thủ: ${'♥'.repeat(Math.max(0, opp.hp))} · ${opp.score}`,
  };
}
