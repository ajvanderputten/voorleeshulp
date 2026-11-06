// Offline-cache voor Voorleeshulp. Verhoog VERSION als bestanden veranderen.
// Houd dit gelijk aan APP_VERSION in app.js.
const VERSION = 'voorleeshulp-v1.4.0';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'text-utils.js', 'manifest.webmanifest', 'icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'fonts/slackey.woff2'];
// Tekstherkenning (tesseract.js) komt van deze hosts; na het eerste gebruik werkt ze ook offline.
const CDN_HOSTS = ['cdn.jsdelivr.net', 'tessdata.projectnaptha.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => Promise.all(SHELL.map((f) => c.add(f).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // De pomodoro-app heeft een eigen service worker.
  if (url.origin === self.location.origin && url.pathname.startsWith('/pomodoro/')) return;

  if (CDN_HOSTS.includes(url.hostname)) {
    // Cache eerst: deze bestanden zijn versie-gepind en groot.
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return res;
      }))
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Eigen bestanden: eerst netwerk (updates komen snel), cache als terugval offline.
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || (req.mode === 'navigate' ? caches.match('index.html') : undefined)))
  );
});
