import { expect } from '@esm-bundle/chai';
import {
  createBuildStartedEvent,
  createBuildProgressEvent,
  createBuildDataEvent,
  createBuildCompleteEvent,
  createBuildErrorEvent,
  createLockDetectedEvent,
  createIndexMissingEvent,
  createIndexLoadedEvent,
  IndexingEventType,
  IndexingErrorCode,
} from '../../../nx/blocks/media-library/indexing/events.js';

/**
 * Tests for coordinator event factories
 *
 * These verify the event creation functions produce correct event structures
 * that the coordinator emits and the display layer consumes.
 */
describe('coordinator event factories', () => {
  describe('createBuildStartedEvent', () => {
    it('creates event for full build', () => {
      const event = createBuildStartedEvent('full', true);

      expect(event.type).to.equal(IndexingEventType.BUILD_STARTED);
      expect(event.mode).to.equal('full');
      expect(event.forceFull).to.be.true;
      expect(event.timestamp).to.be.a('number');
    });

    it('creates event for incremental build', () => {
      const event = createBuildStartedEvent('incremental', false);

      expect(event.type).to.equal(IndexingEventType.BUILD_STARTED);
      expect(event.mode).to.equal('incremental');
      expect(event.forceFull).to.be.false;
    });

    it('includes timestamp', () => {
      const before = Date.now();
      const event = createBuildStartedEvent('full', false);
      const after = Date.now();

      expect(event.timestamp).to.be.at.least(before);
      expect(event.timestamp).to.be.at.most(after);
    });
  });

  describe('createBuildProgressEvent', () => {
    it('creates progress event with stage and detail', () => {
      const event = createBuildProgressEvent('processing', 'Processing files...', 10, 100);

      expect(event.type).to.equal(IndexingEventType.BUILD_PROGRESS);
      expect(event.stage).to.equal('processing');
      expect(event.detail).to.equal('Processing files...');
      expect(event.itemsProcessed).to.equal(10);
      expect(event.totalItems).to.equal(100);
    });

    it('excludes null itemsProcessed/totalItems from event', () => {
      const event = createBuildProgressEvent('loading', 'Loading data...', null, null);

      expect(event).to.not.have.property('itemsProcessed');
      expect(event).to.not.have.property('totalItems');
    });
  });

  describe('createBuildDataEvent', () => {
    it('creates event with progressive data batch', () => {
      const items = [{ hash: 'abc' }, { hash: 'def' }];
      const event = createBuildDataEvent(items, 1, 5);

      expect(event.type).to.equal(IndexingEventType.BUILD_DATA);
      expect(event.items).to.deep.equal(items);
      expect(event.batchIndex).to.equal(1);
      expect(event.totalBatches).to.equal(5);
    });

    it('excludes null batch info from event', () => {
      const items = [{ hash: 'xyz' }];
      const event = createBuildDataEvent(items);

      expect(event.items).to.deep.equal(items);
      expect(event).to.not.have.property('batchIndex');
      expect(event).to.not.have.property('totalBatches');
    });
  });

  describe('createBuildCompleteEvent', () => {
    it('creates complete event with data and metrics', () => {
      const data = [{ hash: 'a' }, { hash: 'b' }];
      const event = createBuildCompleteEvent(data, 5000, true, false);

      expect(event.type).to.equal(IndexingEventType.BUILD_COMPLETE);
      expect(event.data).to.deep.equal(data);
      expect(event.itemCount).to.equal(2);
      expect(event.duration).to.equal(5000);
      expect(event.hasChanges).to.be.true;
      expect(event.lockRemoveFailed).to.be.false;
    });

    it('does not include timestamp field', () => {
      const event = createBuildCompleteEvent([], 1000, false, false);
      expect(event.timestamp).to.be.undefined;
    });

    it('calculates item count correctly', () => {
      const data = [1, 2, 3, 4, 5];
      const event = createBuildCompleteEvent(data, 1000, true, false);
      expect(event.itemCount).to.equal(5);
    });

    it('handles empty data array', () => {
      const event = createBuildCompleteEvent([], 500, false, false);
      expect(event.itemCount).to.equal(0);
    });
  });

  describe('createBuildErrorEvent', () => {
    it('creates error event with code and message', () => {
      const event = createBuildErrorEvent(
        IndexingErrorCode.BUILD_FAILED,
        'Build failed due to network error',
        { attempt: 1 },
        false,
      );

      expect(event.type).to.equal(IndexingEventType.BUILD_ERROR);
      expect(event.code).to.equal(IndexingErrorCode.BUILD_FAILED);
      expect(event.message).to.equal('Build failed due to network error');
      expect(event.context).to.deep.equal({ attempt: 1 });
      expect(event.isPersistent).to.be.false;
    });

    it('marks persistent errors correctly', () => {
      const event = createBuildErrorEvent(
        'DA_READ_DENIED',
        'Access denied',
        null,
        true,
      );

      expect(event.isPersistent).to.be.true;
    });

    it('does not include timestamp', () => {
      const event = createBuildErrorEvent('BUILD_FAILED', 'Error', null, false);
      expect(event.timestamp).to.be.undefined;
    });

    it('excludes null context from event', () => {
      const event = createBuildErrorEvent('BUILD_FAILED', 'Error', null, false);
      expect(event).to.not.have.property('context');
    });
  });

  describe('createLockDetectedEvent', () => {
    it('creates lock event with owner info', () => {
      const now = Date.now();
      const event = createLockDetectedEvent('browser-123', now, true);

      expect(event.type).to.equal(IndexingEventType.LOCK_DETECTED);
      expect(event.ownerId).to.equal('browser-123');
      expect(event.timestamp).to.equal(now);
      expect(event.fresh).to.be.true;
    });

    it('marks stale locks', () => {
      const event = createLockDetectedEvent('browser-456', Date.now(), false);
      expect(event.fresh).to.be.false;
    });
  });

  describe('createIndexMissingEvent', () => {
    it('creates event with site path', () => {
      const event = createIndexMissingEvent('/adobe/da-nx');

      expect(event.type).to.equal(IndexingEventType.INDEX_MISSING);
      expect(event.sitePath).to.equal('/adobe/da-nx');
    });
  });

  describe('createIndexLoadedEvent', () => {
    it('creates event with loaded data', () => {
      const data = [{ hash: 'x' }, { hash: 'y' }];
      const event = createIndexLoadedEvent(data);

      expect(event.type).to.equal(IndexingEventType.INDEX_LOADED);
      expect(event.data).to.deep.equal(data);
      expect(event.hasData).to.be.true;
    });

    it('detects empty data', () => {
      const event = createIndexLoadedEvent([]);
      expect(event.hasData).to.be.false;
    });
  });

  describe('event structure consistency', () => {
    it('all events have type field', () => {
      const events = [
        createBuildStartedEvent('full', false),
        createBuildProgressEvent('loading', 'Loading...'),
        createBuildDataEvent([]),
        createBuildCompleteEvent([], 1000, false, false),
        createBuildErrorEvent('BUILD_FAILED', 'Error', null, false),
        createLockDetectedEvent('owner', Date.now(), true),
        createIndexMissingEvent('/org/repo'),
        createIndexLoadedEvent([]),
      ];

      events.forEach((event) => {
        expect(event).to.have.property('type');
        expect(event.type).to.be.a('string');
      });
    });

    it('some events include timestamp', () => {
      // Only BUILD_STARTED and LOCK_DETECTED have timestamps
      const withTimestamp = [
        createBuildStartedEvent('full', false),
        createLockDetectedEvent('owner', Date.now(), true),
      ];

      withTimestamp.forEach((event) => {
        expect(event).to.have.property('timestamp');
        expect(event.timestamp).to.be.a('number');
      });
    });

    it('event types are unique strings', () => {
      const types = Object.values(IndexingEventType);
      const uniqueTypes = [...new Set(types)];

      expect(types.length).to.equal(uniqueTypes.length);
      types.forEach((type) => {
        expect(type).to.be.a('string');
        expect(type.length).to.be.greaterThan(0);
      });
    });

    it('error codes are unique strings', () => {
      const codes = Object.values(IndexingErrorCode);
      const uniqueCodes = [...new Set(codes)];

      expect(codes.length).to.equal(uniqueCodes.length);
      codes.forEach((code) => {
        expect(code).to.be.a('string');
        expect(code.length).to.be.greaterThan(0);
      });
    });
  });

  describe('event payload structure', () => {
    it('BUILD_STARTED has required fields', () => {
      const event = createBuildStartedEvent('incremental', false);

      expect(event).to.have.all.keys('type', 'mode', 'forceFull', 'timestamp');
    });

    it('BUILD_PROGRESS has required fields', () => {
      const event = createBuildProgressEvent('processing', 'msg', 5, 10);

      expect(event).to.include.all.keys('type', 'stage', 'detail');
      expect(event).to.have.property('itemsProcessed');
      expect(event).to.have.property('totalItems');
    });

    it('BUILD_DATA has required fields', () => {
      const event = createBuildDataEvent([{ hash: 'a' }], 1, 3);

      expect(event).to.include.all.keys('type', 'items');
      expect(event).to.have.property('batchIndex');
      expect(event).to.have.property('totalBatches');
    });

    it('BUILD_COMPLETE has required fields', () => {
      const event = createBuildCompleteEvent([{ hash: 'a' }], 1000, true, false);

      expect(event).to.have.all.keys('type', 'data', 'itemCount', 'duration', 'hasChanges', 'lockRemoveFailed');
    });

    it('BUILD_ERROR has required fields', () => {
      const event = createBuildErrorEvent('BUILD_FAILED', 'msg', { test: 1 }, false);

      expect(event).to.include.all.keys('type', 'code', 'message', 'isPersistent', 'context');
    });

    it('LOCK_DETECTED has required fields', () => {
      const event = createLockDetectedEvent('owner', Date.now(), true);

      expect(event).to.have.all.keys('type', 'ownerId', 'timestamp', 'fresh');
    });

    it('INDEX_MISSING has required fields', () => {
      const event = createIndexMissingEvent('/org/repo');

      expect(event).to.have.all.keys('type', 'sitePath');
    });

    it('INDEX_LOADED has required fields', () => {
      const event = createIndexLoadedEvent([]);

      expect(event).to.have.all.keys('type', 'data', 'hasData');
    });
  });
});
