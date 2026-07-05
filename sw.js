// 灵感收藏家 - Service Worker
const CACHE_NAME = 'inspiration-collector-v23';
const ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/js/sync.js',
  '/js/icons.js',
  '/manifest.json',
];

// 安装：缓存核心资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// 激活：清理旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

// 请求拦截
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // API 请求：直接透传到网络，不走缓存
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Service Worker 代理：绕过 CORS 直接请求外部 API
  if (url.pathname.startsWith('/sw-proxy/')) {
    const target = decodeURIComponent(url.pathname.slice('/sw-proxy/'.length));
    event.respondWith(
      fetch(target).catch(err => new Response(JSON.stringify({
        error: 'SW proxy fetch failed', message: err.message, target: target.substring(0, 60)
      }), { status: 502, headers: { 'Content-Type': 'application/json' } }))
    );
    return;
  }

  // 外部请求：直接透传
  if (url.origin !== self.location.origin) {
    return;
  }

  // 页面导航请求：网络优先，保证始终加载最新版本（修复 PWA 启动白屏）
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // 对 JS/CSS 用"网络优先"策略，确保拿到最新代码
  const isCodeFile = url.pathname.endsWith('.js') || url.pathname.endsWith('.css');

  if (isCodeFile) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // 其他请求：缓存优先，回退网络
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response && response.status === 200 && event.request.url.startsWith(self.location.origin)) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      }).catch(() => {
        // 已在上方 navigate 分支处理，此处仅兜底
      });
    })
  );
});
