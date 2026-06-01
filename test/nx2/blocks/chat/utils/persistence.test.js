import { expect } from '@esm-bundle/chai';
import {
  loadMessages,
  saveMessages,
  resetSession,
} from '../../../../../nx2/blocks/chat/utils/persistence.js';

let counter = 0;
const room = () => {
  counter += 1;
  return `test-room-${Date.now()}-${counter}`;
};

describe('persistence', () => {
  describe('loadMessages', () => {
    it('returns empty messages and null sessionId for unknown room', async () => {
      const result = await loadMessages(room());
      expect(result.messages).to.deep.equal([]);
      expect(result.sessionId).to.be.null;
    });

    it('returns saved messages and sessionId', async () => {
      const testRoom = room();
      const msgs = [{ role: 'user', content: 'hello' }];
      const id = crypto.randomUUID();
      await saveMessages(testRoom, msgs, id);

      const result = await loadMessages(testRoom);
      expect(result.messages).to.deep.equal(msgs);
      expect(result.sessionId).to.equal(id);
    });

    it('returns null sessionId for old-format records without sessionId field', async () => {
      const testRoom = room();
      const msgs = [{ role: 'user', content: 'legacy' }];

      await new Promise((resolve, reject) => {
        const req = indexedDB.open('da-chat', 1);
        req.onerror = () => reject(req.error);
        req.onsuccess = (e) => {
          const db = e.target.result;
          const tx = db.transaction('conversations', 'readwrite');
          tx.objectStore('conversations').put({ room: testRoom, messages: msgs, updatedAt: Date.now() });
          tx.oncomplete = resolve;
        };
      });

      const result = await loadMessages(testRoom);
      expect(result.messages).to.have.lengthOf(1); // guard: write must have landed
      expect(result.messages).to.deep.equal(msgs);
      expect(result.sessionId).to.be.null;
    });
  });

  describe('saveMessages', () => {
    it('stores messages and sessionId, retrievable via loadMessages', async () => {
      const testRoom = room();
      const id = crypto.randomUUID();
      await saveMessages(testRoom, [{ role: 'user', content: 'first' }], id);

      const result = await loadMessages(testRoom);
      expect(result.messages).to.deep.equal([{ role: 'user', content: 'first' }]);
      expect(result.sessionId).to.equal(id);
    });

    it('overwrites previous messages and preserves sessionId', async () => {
      const testRoom = room();
      const id = crypto.randomUUID();
      await saveMessages(testRoom, [{ role: 'user', content: 'first' }], id);
      await saveMessages(testRoom, [{ role: 'user', content: 'second' }], id);

      const result = await loadMessages(testRoom);
      expect(result.messages).to.have.lengthOf(1);
      expect(result.messages[0].content).to.equal('second');
      expect(result.sessionId).to.equal(id);
    });
  });

  describe('resetSession', () => {
    it('clears messages and stores the new sessionId', async () => {
      const testRoom = room();
      const oldId = crypto.randomUUID();
      await saveMessages(testRoom, [{ role: 'user', content: 'hi' }], oldId);

      const newId = crypto.randomUUID();
      await resetSession(testRoom, newId);

      const result = await loadMessages(testRoom);
      expect(result.messages).to.deep.equal([]);
      expect(result.sessionId).to.equal(newId);
    });

    it('creates a record for a room with no prior messages', async () => {
      const testRoom = room();
      const id = crypto.randomUUID();
      await resetSession(testRoom, id);

      const result = await loadMessages(testRoom);
      expect(result.messages).to.deep.equal([]);
      expect(result.sessionId).to.equal(id);
    });
  });
});
