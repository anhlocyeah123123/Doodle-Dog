// Server nhỏ: phục vụ web/ + relay WebSocket theo phòng (tối đa 2 người). Không giữ logic game.
import http from 'http'; import fs from 'fs'; import path from 'path'; import { WebSocketServer } from 'ws';
const root = path.resolve('web'), mime = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp', '.mp3': 'audio/mpeg' };
const srv = http.createServer((q, s) => {
  let u = decodeURIComponent(q.url.split('?')[0]); const p = path.join(root, u === '/' ? 'index.html' : u);
  if (!p.startsWith(root)) { s.writeHead(403); return s.end(); }
  fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); s.end(d); });
});
const rooms = new Map(), wss = new WebSocketServer({ server: srv, path: '/ws' });
wss.on('connection', (ws, q) => {
  const code = new URL(q.url, 'http://x').searchParams.get('room') || '0', r = rooms.get(code) || [];
  if (r.length >= 2) return ws.close(); r.push(ws); rooms.set(code, r);
  ws.send(JSON.stringify({ t: 'role', role: r.length === 1 ? 'host' : 'guest' }));
  if (r.length === 2) r.forEach(w => w.send('{"t":"ready"}'));
  ws.on('message', d => r.forEach(w => w !== ws && w.readyState === 1 && w.send(d.toString())));
  ws.on('close', () => { r.splice(r.indexOf(ws), 1); r.forEach(w => w.send('{"t":"left"}')); if (!r.length) rooms.delete(code); });
});
srv.listen(process.env.PORT || 3000, () => console.log('http://localhost:' + (process.env.PORT || 3000)));
