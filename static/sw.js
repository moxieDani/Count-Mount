// Simplified Service Worker for PWA - Online Only
// Install event - minimal setup
self.addEventListener('install', event => {
  console.log('[SW] Installing...');
  event.waitUntil(self.skipWaiting());
});

// Activate event - minimal setup  
self.addEventListener('activate', event => {
  console.log('[SW] Activating...');
  event.waitUntil(self.clients.claim());
});

// Fetch event - pass through all requests to network (no caching)
self.addEventListener('fetch', event => {
  // Simply pass through all requests to network
  event.respondWith(fetch(event.request));
});

// Handle session storage for PWA
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'STORE_SESSION') {
    // Store session data in IndexedDB for PWA persistence
    const { sessionData } = event.data;
    
    // Open IndexedDB to store session
    const dbRequest = indexedDB.open('countMountSession', 1);
    
    dbRequest.onupgradeneeded = function(e) {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('sessions')) {
        const store = db.createObjectStore('sessions', { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
    
    dbRequest.onsuccess = function(e) {
      const db = e.target.result;
      const transaction = db.transaction(['sessions'], 'readwrite');
      const store = transaction.objectStore('sessions');
      
      store.put({
        id: 'current',
        data: sessionData,
        timestamp: Date.now()
      });
      
      console.log('[SW] Session data stored');
    };
    
    dbRequest.onerror = function(e) {
      console.error('[SW] Failed to store session:', e);
    };
  }
  
  if (event.data && event.data.type === 'GET_SESSION') {
    // Retrieve session data from IndexedDB
    const dbRequest = indexedDB.open('countMountSession', 1);
    
    dbRequest.onsuccess = function(e) {
      const db = e.target.result;
      const transaction = db.transaction(['sessions'], 'readonly');
      const store = transaction.objectStore('sessions');
      const getRequest = store.get('current');
      
      getRequest.onsuccess = function() {
        const result = getRequest.result;
        event.ports[0].postMessage({
          type: 'SESSION_DATA',
          sessionData: result ? result.data : null
        });
      };
      
      getRequest.onerror = function() {
        event.ports[0].postMessage({
          type: 'SESSION_DATA',
          sessionData: null
        });
      };
    };
    
    dbRequest.onerror = function() {
      event.ports[0].postMessage({
        type: 'SESSION_DATA',
        sessionData: null
      });
    };
  }
});

console.log('[SW] Service Worker loaded');