// Client WebSocket mỏng: join phòng bằng mã, gửi/nhận JSON {t:'loại',...}.
export class Net {
  constructor() { this.h = {}; }
  on(t, f) { (this.h[t] ||= []).push(f); return this; }
  send(o) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(o)); }
  connect(room) {
    return new Promise((ok, no) => {
      const p = location.protocol === 'https:' ? 'wss' : 'ws';
      this.ws = new WebSocket(`${p}://${location.host}/ws?room=${encodeURIComponent(room)}`);
      this.ws.onopen = ok; this.ws.onerror = no;
      this.ws.onmessage = e => { const m = JSON.parse(e.data); (this.h[m.t] || []).forEach(f => f(m)); };
      this.ws.onclose = () => (this.h.close || []).forEach(f => f());
    });
  }
}
