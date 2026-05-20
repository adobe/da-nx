const DB_NAME = 'da-chat';
const DB_VERSION = 1;
const STORE_NAME = 'conversations';

let dbPromise = null;

function closeDb(resolve) {
  dbPromise = null;
  resolve(null);
}

function openDb() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      closeDb(resolve);
      return;
    }

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'room' });
      }
    };

    req.onsuccess = (e) => {
      const db = e.target.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };

    req.onerror = () => closeDb(resolve);
    req.onblocked = () => {
      dbPromise = null;
      setTimeout(() => openDb().then(resolve), 500);
    };
  });

  return dbPromise;
}

async function write(fn) {
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.onerror = () => { }; // best-effort, prevent bubbling to window.onerror
    fn(tx.objectStore(STORE_NAME));
  } catch {
    // best-effort
  }
}

export async function loadMessages(room) {
  const db = await openDb();
  if (!db) return { messages: [], sessionId: null };

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(room);

      req.onsuccess = (e) => {
        const { result } = e.target;
        resolve({
          messages: Array.isArray(result?.messages) ? result.messages : [],
          sessionId: result?.sessionId ?? null,
        });
      };
      req.onerror = () => resolve({ messages: [], sessionId: null });
    } catch {
      resolve({ messages: [], sessionId: null });
    }
  });
}

export function saveMessages(room, messages, sessionId) {
  return write((store) => store.put({ room, messages, sessionId, updatedAt: Date.now() }));
}

export function clearMessages(room) {
  return write((store) => store.delete(room));
}

export function resetSession(room, sessionId) {
  return write((store) => store.put({ room, messages: [], sessionId, updatedAt: Date.now() }));
}
