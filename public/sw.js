/* SmartFit Science — service worker.
 * Estratégia: app shell pré-cachado no install; assets com hash = cache-first eterno;
 * navegação = network-first com fallback para o shell (o site abre no avião);
 * GET /api/lit = stale-while-revalidate curto (a busca ao vivo pode responder de cache offline);
 * POST/PUT (estado, feed, mídia) nunca são cacheados — são escrita, não leitura.
 */
const CACHE = 'smartfit-v2';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg', '/icon-maskable.svg'];
const TTL_LIT = 24 * 3600 * 1000;

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const ehHash = (u) => /\/assets\/[A-Za-z0-9._-]+-[A-Za-z0-9_]{6,}\.(js|css|svg|png|woff2?)$/.test(u.pathname);
const soLeitura = (r) => r.method === 'GET' && (r.destination === 'script' || r.destination === 'style' || r.destination === 'image' || r.destination === 'font' || ehHash(new URL(r.url)));

self.addEventListener('fetch', (ev) => {
  const r = ev.request;
  if (r.method !== 'GET') return;
  const url = new URL(r.url);
  const mesmo = url.origin === self.location.origin;

  // literatura ao vivo: cache de 24 h + revalidação silenciosa
  if (mesmo && url.pathname.startsWith('/api/lit')) {
    ev.respondWith(
      caches.open(CACHE).then(async (c) => {
        const hit = await c.match(r);
        const fresco = hit && Date.now() - Number(hit.headers.get('x-sf-ts') || 0) < TTL_LIT;
        if (fresco) {
          fetch(r).then((n) => n.ok && c.put(r, n.clone())).catch(() => {});
          return hit;
        }
        try {
          const n = await fetch(r);
          if (n.ok) {
            const wrapped = new Response(n.body, { status: n.status, statusText: n.statusText, headers: new Headers({ ...Object.fromEntries(n.headers), 'x-sf-ts': String(Date.now()) }) });
            c.put(r, wrapped.clone());
          }
          return n;
        } catch {
          return hit || Response.json({ resultados: [], aviso: 'offline e sem cache: a base local continua respondendo' }, { headers: { 'content-type': 'application/json' } });
        }
      }),
    );
    return;
  }

  // dados do usuário: sempre rede, nunca cache
  if (mesmo && url.pathname.startsWith('/api/')) return;

  if (r.mode === 'navigate') {
    ev.respondWith(
      fetch(r)
        .then((n) => {
          const clone = n.clone();
          caches.open(CACHE).then((c) => c.put('/index.html', clone)).catch(() => {});
          return n;
        })
        .catch(() => caches.match(r).then((h) => h || caches.match('/index.html') || caches.match('/'))),
    );
    return;
  }

  if (mesmo && (soLeitura(r) || url.pathname.startsWith('/media/'))) {
    ev.respondWith(
      caches.match(r).then((hit) => hit || fetch(r).then((n) => {
        if (n.ok) { const cl = n.clone(); caches.open(CACHE).then((c) => c.put(r, cl)).catch(() => {}); }
        return n;
      }).catch(() => hit)),
    );
  }
});

self.addEventListener('message', (ev) => {
  if (ev.data === 'pular-espera') self.skipWaiting();
  if (ev.data && ev.data.tipo === 'notificar') {
    try {
      self.registration.showNotification(ev.data.titulo || 'SmartFit', {
        body: ev.data.corpo || '', icon: '/icon.svg', badge: '/icon.svg', tag: ev.data.tag,
        requireInteraction: !!ev.data.insistente, vibrate: ev.data.vibrar ? [120, 60, 120] : undefined, data: ev.data,
      });
    } catch { /* notificação indisponível */ }
  }
  if (ev.data === 'limpar-cache') {
    ev.waitUntil(caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k)))));
  }
});

self.addEventListener('notificationclick', (ev) => {
  ev.notification.close();
  const destino = (ev.notification.data && ev.notification.data.aba) || '/?aba=hoje';
  ev.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    for (const c of cs) { if ('focus' in c) { c.postMessage({ tipo: 'navegar', url: destino }); return c.focus(); } }
    return self.clients.openWindow(destino);
  }));
});
