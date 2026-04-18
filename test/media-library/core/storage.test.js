import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setImsDetails } from '../../../nx/utils/daFetch.js';
import {
  loadIndexMetadata,
  loadIndexChunk,
  writeIndexChunk,
  getMediaLibraryPath,
} from '../../../nx/blocks/media-library/core/storage.js';

describe('storage', () => {
  let originalFetch;
  let fetchStub;

  beforeEach(() => {
    setImsDetails('test-token');
    originalFetch = globalThis.fetch;
    fetchStub = sinon.stub();
    globalThis.fetch = fetchStub;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    sinon.restore();
  });

  describe('getMediaLibraryPath', () => {
    it('should construct the media library path', () => {
      const result = getMediaLibraryPath('/org/repo');
      expect(result).to.equal('/org/repo/.da/media-insights');
    });
  });

  describe('loadIndexMetadata', () => {
    it('should return null when metadata file does not exist', async () => {
      fetchStub.resolves({
        ok: false,
        headers: new Headers(),
      });
      const result = await loadIndexMetadata('/org/repo');
      expect(result).to.be.null;
    });

    it('should return metadata object when file exists', async () => {
      const metadata = { chunks: 5, totalEntries: 100 };
      fetchStub.resolves({
        ok: true,
        headers: new Headers(),
        json: sinon.stub().resolves(metadata),
      });
      const result = await loadIndexMetadata('/org/repo');
      expect(result).to.deep.equal(metadata);
    });

    it('should return null on fetch error', async () => {
      fetchStub.rejects(new Error('Network error'));
      const result = await loadIndexMetadata('/org/repo');
      expect(result).to.be.null;
    });
  });

  describe('loadIndexChunk', () => {
    it('should return empty array when chunk file does not exist', async () => {
      fetchStub.resolves({
        ok: false,
        headers: new Headers(),
      });
      const result = await loadIndexChunk('/org/repo', 0);
      expect(result).to.deep.equal([]);
    });

    it('should return chunk data when file exists', async () => {
      const chunkData = [{ url: '/media/image.png' }];
      fetchStub.resolves({
        ok: true,
        headers: new Headers(),
        json: sinon.stub().resolves(chunkData),
      });
      const result = await loadIndexChunk('/org/repo', 0);
      expect(result).to.deep.equal(chunkData);
    });

    it('should return empty array on fetch error', async () => {
      fetchStub.rejects(new Error('Network error'));
      const result = await loadIndexChunk('/org/repo', 0);
      expect(result).to.deep.equal([]);
    });
  });

  describe('writeIndexChunk', () => {
    it('should return false when write fails', async () => {
      fetchStub.resolves({
        ok: false,
        headers: new Headers(),
      });
      const result = await writeIndexChunk('/org/repo', 0, []);
      expect(result).to.be.false;
    });

    it('should return true when write succeeds', async () => {
      fetchStub.resolves({
        ok: true,
        headers: new Headers(),
      });
      const result = await writeIndexChunk('/org/repo', 0, [{ url: '/media/image.png' }]);
      expect(result).to.be.true;
    });

    it('should return false on fetch error', async () => {
      fetchStub.rejects(new Error('Network error'));
      const result = await writeIndexChunk('/org/repo', 0, []);
      expect(result).to.be.false;
    });
  });
});
