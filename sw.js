const CACHE_NAME = 'barberapp-superadmin-v2.0.2';
const OFFLINE_URL = '/offline.html';

// Recursos a cachear durante la instalación
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  OFFLINE_URL,
  '/icons/icon-96.png',
  '/icons/icon-128.png',
  '/icons/icon-144.png',
  '/icons/icon-152.png',
  '/icons/icon-192.png',
  '/icons/icon-384.png',
  '/icons/icon-512.png'
];

// Instalación
self.addEventListener('install', event => {
  console.log('[ServiceWorker] Instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[ServiceWorker] Cacheando archivos iniciales');
        return cache.addAll(PRECACHE_URLS);
      })
      .then(() => self.skipWaiting())
      .catch(error => {
        console.error('[ServiceWorker] Error al cachear:', error);
        // Intentar cachear individualmente cada recurso
        PRECACHE_URLS.forEach(url => {
          caches.open(CACHE_NAME).then(cache => {
            cache.add(url).catch(e => console.warn(`No se pudo cachear: ${url}`, e));
          });
        });
      })
  );
});

// Activación - limpiar caches antiguos
self.addEventListener('activate', event => {
  console.log('[ServiceWorker] Activando...');
  event.waitUntil(
    caches.keys().then(keyList => {
      return Promise.all(keyList.map(key => {
        if (key !== CACHE_NAME) {
          console.log('[ServiceWorker] Eliminando cache antiguo:', key);
          return caches.delete(key);
        }
      }));
    }).then(() => self.clients.claim())
  );
});

// Estrategia: Network First con fallback a cache
self.addEventListener('fetch', event => {
  // Solo manejar requests GET
  if (event.request.method !== 'GET') {
    event.respondWith(fetch(event.request));
    return;
  }

  const url = new URL(event.request.url);

  // Para Firebase y Google APIs: siempre network first, sin cache
  if (url.hostname.includes('firebase') || 
      url.hostname.includes('googleapis') ||
      url.hostname.includes('gstatic.com')) {
    event.respondWith(fetch(event.request).catch(error => {
      console.warn('[ServiceWorker] Firebase fetch falló:', error);
      return new Response(JSON.stringify({ error: 'offline' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }));
    return;
  }

  // Para assets estáticos: cache first (incluye iconos)
  if (url.pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|webp)$/)) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) {
          return cached;
        }
        return fetch(event.request).then(response => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        }).catch(() => {
          // Si es un icono y no hay cache, devolver un placeholder
          if (url.pathname.includes('icon-')) {
            return caches.match('/icons/icon-96.png');
          }
          return new Response('Icono no disponible', { status: 404 });
        });
      })
    );
    return;
  }

  // Para HTML y navegación: Network First con fallback a offline.html
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Cachear la respuesta exitosa
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(async () => {
          const cachedResponse = await caches.match(event.request);
          if (cachedResponse) return cachedResponse;
          return caches.match(OFFLINE_URL);
        })
    );
    return;
  }

  // Para otros recursos: Cache First
  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      });
    }).catch(() => {
      return new Response('Recurso no disponible sin conexión', {
        status: 503,
        statusText: 'Service Unavailable'
      });
    })
  );
});

// Sincronización en segundo plano (opcional)
self.addEventListener('sync', event => {
  console.log('[ServiceWorker] Sync event:', event.tag);
  if (event.tag === 'sync-reservas') {
    event.waitUntil(syncReservas());
  }
});

async function syncReservas() {
  console.log('[ServiceWorker] Sincronizando reservas pendientes...');
}
