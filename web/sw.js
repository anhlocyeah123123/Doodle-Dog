// Service worker: chơi offline + tải nhanh lần sau.
// - Code (html/js/css): mạng trước -> bản deploy mới có hiệu lực ngay.
// - Ảnh/font/manifest asset: dùng bản đã lưu ngay, đồng thời tải bản mới ngầm cho lần sau.
// - Âm thanh: KHÔNG chặn. Safari iPhone phát <audio> bằng yêu cầu Range; trả bản lưu sẵn
//   (mã 200, không phải 206) sẽ làm iPhone không phát được nhạc.
const VERSION = 'dd-v10';   // đổi khi muốn xóa toàn bộ cache cũ

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()),
));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (req.headers.has('range') || url.pathname.endsWith('.mp3')) return;

  const isAsset = url.pathname.includes('/assets/');
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const hit = await cache.match(req);
    const fresh = fetch(req).then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    });
    if (isAsset && hit) {
      e.waitUntil(fresh.catch(() => {}));
      return hit;
    }
    try { return await fresh; } catch { return hit || Response.error(); }
  }));
});
