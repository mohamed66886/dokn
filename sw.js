// Service Worker for caching and performance optimization
const CACHE_NAME = 'hadari-design-v1.0.0';
const STATIC_CACHE = 'hadari-static-v1';
const DYNAMIC_CACHE = 'hadari-dynamic-v1';

// Assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/favicon.ico',
  '/web-logo.jpeg',
  '/header.png',
  '/site.webmanifest',
  '/robots.txt',
  '/sitemap.xml'
];

// API endpoints and dynamic content patterns
const DYNAMIC_CACHE_PATTERNS = [
  /^https:\/\/hadari-design\.com\/api\//,
  /^https:\/\/fonts\.googleapis\.com/,
  /^https:\/\/fonts\.gstatic\.com/,
  /^https:\/\/images\.unsplash\.com/
];

// Install event - cache static assets
self.addEventListener('install', event => {
  console.log('Service Worker installing...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('Failed to cache static assets:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('Service Worker activating...');
  
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
              console.log('Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        return self.clients.claim();
      })
  );
});

// Fetch event - serve cached content
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip Chrome extensions
  if (url.protocol === 'chrome-extension:') {
    return;
  }

  // Handle different types of requests
  if (request.destination === 'document') {
    // HTML pages - Cache First with Network Fallback
    event.respondWith(handleDocumentRequest(request));
  } else if (request.destination === 'image') {
    // Images - Cache First with Network Fallback
    event.respondWith(handleImageRequest(request));
  } else if (isStaticAsset(url)) {
    // Static assets - Cache First
    event.respondWith(handleStaticAssetRequest(request));
  } else if (isDynamicContent(url)) {
    // API calls and dynamic content - Network First with Cache Fallback
    event.respondWith(handleDynamicRequest(request));
  } else {
    // Default - Network First
    event.respondWith(handleDefaultRequest(request));
  }
});

// Handle HTML document requests
async function handleDocumentRequest(request) {
  try {
    // Try cache first
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    // If not in cache, fetch from network
    const response = await fetch(request);
    
    // Cache successful responses
    if (response.status === 200) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
    }
    
    return response;
  } catch (error) {
    console.error('Failed to handle document request:', error);
    
    // Return offline page if available
    const offlineResponse = await caches.match('/offline.html');
    return offlineResponse || new Response('Offline', { status: 503 });
  }
}

// Handle image requests
async function handleImageRequest(request) {
  try {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    const response = await fetch(request);
    
    if (response.status === 200) {
      const cache = await caches.open(DYNAMIC_CACHE);
      // Only cache images smaller than 5MB
      const contentLength = response.headers.get('content-length');
      if (!contentLength || parseInt(contentLength) < 5 * 1024 * 1024) {
        cache.put(request, response.clone());
      }
    }
    
    return response;
  } catch (error) {
    console.error('Failed to handle image request:', error);
    
    // Return placeholder image
    const placeholderResponse = await caches.match('/placeholder.svg');
    return placeholderResponse || new Response('Image not available', { status: 503 });
  }
}

// Handle static asset requests
async function handleStaticAssetRequest(request) {
  try {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    const response = await fetch(request);
    
    if (response.status === 200) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    
    return response;
  } catch (error) {
    console.error('Failed to handle static asset request:', error);
    return new Response('Asset not available', { status: 503 });
  }
}

// Handle dynamic content requests
async function handleDynamicRequest(request) {
  try {
    // Try network first
    const response = await fetch(request);
    
    if (response.status === 200) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
    }
    
    return response;
  } catch (error) {
    console.error('Failed to fetch dynamic content:', error);
    
    // Fallback to cache
    const cachedResponse = await caches.match(request);
    return cachedResponse || new Response('Content not available', { status: 503 });
  }
}

// Handle default requests
async function handleDefaultRequest(request) {
  try {
    return await fetch(request);
  } catch (error) {
    console.error('Failed to handle default request:', error);
    return new Response('Request failed', { status: 503 });
  }
}

// Helper functions
function isStaticAsset(url) {
  const staticExtensions = ['.js', '.css', '.woff', '.woff2', '.ttf', '.eot', '.ico'];
  return staticExtensions.some(ext => url.pathname.endsWith(ext));
}

function isDynamicContent(url) {
  return DYNAMIC_CACHE_PATTERNS.some(pattern => pattern.test(url.href));
}

// Background sync for form submissions
self.addEventListener('sync', event => {
  if (event.tag === 'contact-form-sync') {
    event.waitUntil(syncContactForms());
  }
});

async function syncContactForms() {
  try {
    const db = await openIndexedDB();
    const forms = await getAllPendingForms(db);
    
    for (const form of forms) {
      try {
        const response = await fetch('/api/contact', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(form.data)
        });
        
        if (response.ok) {
          await deletePendingForm(db, form.id);
          console.log('Form synced successfully');
        }
      } catch (error) {
        console.error('Failed to sync form:', error);
      }
    }
  } catch (error) {
    console.error('Background sync failed:', error);
  }
}

// IndexedDB helpers for offline form storage
function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('HadariDesignDB', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('pendingForms')) {
        db.createObjectStore('pendingForms', { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

function getAllPendingForms(db) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['pendingForms'], 'readonly');
    const store = transaction.objectStore('pendingForms');
    const request = store.getAll();
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function deletePendingForm(db, id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['pendingForms'], 'readwrite');
    const store = transaction.objectStore('pendingForms');
    const request = store.delete(id);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

// Push notification handling
self.addEventListener('push', event => {
  if (!event.data) return;

  const data = event.data.json();
  const title = data.title || 'الركن الحضاري';
  const options = {
    body: data.body || 'لديك إشعار جديد',
    icon: '/favicon-192x192.png',
    badge: '/favicon-72x72.png',
    data: data.url || '/',
    actions: [
      {
        action: 'open',
        title: 'فتح',
        icon: '/favicon-32x32.png'
      },
      {
        action: 'close',
        title: 'إغلاق'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'open' || !event.action) {
    const url = event.notification.data || '/';
    
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then(clientList => {
        // Check if the URL is already open
        for (const client of clientList) {
          if (client.url === url && 'focus' in client) {
            return client.focus();
          }
        }
        
        // Open new window if not found
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
    );
  }
});

console.log('Service Worker loaded successfully');
