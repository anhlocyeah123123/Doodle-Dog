import { Sim } from '../core/sim.js';
import { BAL } from '../core/config.js';
// Host chạy mô phỏng thật (authority); guest gửi bùa lên, nhận snapshot 12Hz. Điểm & máu dùng chung.
export function coop(net, role) {
  const sim = new Sim(1, 2, BAL.goal), host = role === 'host'; let acc = 0;
  if (host) net.on('cast', m => sim.cast(m.s)); else net.on('snap', m => sim.load(m.d));
  return {
    sim,
    cast: s => host ? sim.cast(s) : (net.send({ t: 'cast', s }), 0),
    update(dt) { sim.tick(dt, host); if (host && (acc += dt) > 1 / 12) { acc = 0; net.send({ t: 'snap', d: sim.snap() }); } },
    result: () => sim.won ? `CHIẾN THẮNG! Điểm chung: ${sim.score}` : sim.over ? `Hai bạn thua! Điểm: ${sim.score}` : null,
    hud: () => `Co-op · ${sim.kills}/${sim.goal}`,
  };
}
