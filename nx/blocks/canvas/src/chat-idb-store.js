const DB_NAME = 'da-chat';
const DB_VERSION = 1;
const STORE_NAME = 'conversations';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'room' });
      }
    };

    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => { resolve(null); };
    req.onblocked = () => { resolve(null); };
  });

  return dbPromise;
}

export async function loadMessages(room) {
  const db = await openDb();
  if (!db) return [];

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(room);
      req.onsuccess = (e) => {
        const record = e.target.result;
        resolve(Array.isArray(record?.messages) ? record.messages : []);
      };
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

export async function saveMessages(room, messages) {
  const db = await openDb();
  if (!db) return;

  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({ room, messages, updatedAt: Date.now() });
  } catch {
    // Quota or other IDB error — persist is best-effort
  }
}

export async function clearMessages(room) {
  const db = await openDb();
  if (!db) return;

  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(room);
  } catch {
    // Ignore
  }
}
