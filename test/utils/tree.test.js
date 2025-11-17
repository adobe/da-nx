/* eslint-disable max-len */
import { expect } from '@esm-bundle/chai';
import { Queue, crawl } from '../../nx/public/utils/tree.js';

// Mock data based on list-response.json
const mockBasicResponse = [
  {
    path: '/adobecom/da-bacom/tools/bulk.html',
    name: 'bulk',
    ext: 'html',
    lastModified: 1753691701858,
  },
  {
    path: '/adobecom/da-bacom/tools/bulk-publish',
    name: 'bulk-publish',
  },
  {
    path: '/adobecom/da-bacom/tools/landing-page.json',
    name: 'landing-page',
    ext: 'json',
    lastModified: 1762282196814,
  },
  {
    path: '/adobecom/da-bacom/tools/',
    name: '',
  },
  {
    path: '/adobecom/da-bacom/tools/page-builder',
    name: 'page-builder',
  },
];

const mockFilesOnlyResponse = [
  {
    path: '/test/file1.html',
    name: 'file1',
    ext: 'html',
    lastModified: 1753691701858,
  },
  {
    path: '/test/file2.json',
    name: 'file2',
    ext: 'json',
    lastModified: 1762282196814,
  },
];

const mockNestedFolder1Response = [
  {
    path: '/test/nested/subfolder',
    name: 'subfolder',
  },
  {
    path: '/test/nested/file.html',
    name: 'file',
    ext: 'html',
    lastModified: 1753691701858,
  },
];

const mockNestedFolder2Response = [
  {
    path: '/test/nested/subfolder/deep.json',
    name: 'deep',
    ext: 'json',
    lastModified: 1762282196814,
  },
];

const mockPath1Response = [
  {
    path: '/path1/file1.html',
    name: 'file1',
    ext: 'html',
    lastModified: 1753691701858,
  },
];

const mockPath2Response = [
  {
    path: '/path2/file2.json',
    name: 'file2',
    ext: 'json',
    lastModified: 1762282196814,
  },
];

const mockParent1Response = [
  {
    path: '/parent1/file1.html',
    name: 'file1',
    ext: 'html',
    lastModified: 1753691701858,
  },
  {
    path: '/parent1/child',
    name: 'child',
  },
];

const mockParent1ChildResponse = [
  {
    path: '/parent1/child/deep1.html',
    name: 'deep1',
    ext: 'html',
    lastModified: 1753691701858,
  },
];

const mockParent2Response = [
  {
    path: '/parent2/file2.json',
    name: 'file2',
    ext: 'json',
    lastModified: 1762282196814,
  },
  {
    path: '/parent2/subfolder',
    name: 'subfolder',
  },
];

const mockParent2SubfolderResponse = [
  {
    path: '/parent2/subfolder/deep2.json',
    name: 'deep2',
    ext: 'json',
    lastModified: 1762282196814,
  },
];

describe('Queue', () => {
  it('Processes items with callback', async () => {
    const results = [];
    const callback = async (item) => {
      results.push(item);
    };
    const queue = new Queue(callback, 10);

    await queue.push('item1');
    await queue.push('item2');
    await queue.push('item3');

    expect(results).to.deep.equal(['item1', 'item2', 'item3']);
  });

  it('Respects maxConcurrent limit', async () => {
    let activeCount = 0;
    let maxActive = 0;
    const callback = async (item) => {
      activeCount += 1;
      maxActive = Math.max(maxActive, activeCount);
      await new Promise((resolve) => { setTimeout(resolve, 50); });
      activeCount -= 1;
    };
    const queue = new Queue(callback, 2);

    await Promise.all([
      queue.push('item1'),
      queue.push('item2'),
      queue.push('item3'),
      queue.push('item4'),
    ]);

    expect(maxActive).to.equal(2);
  });

  it('Handles errors with onError callback', async () => {
    const errors = [];
    const callback = async (item) => {
      if (item === 'bad') {
        throw new Error('Test error');
      }
    };
    const onError = (item, err) => {
      errors.push({ item, err });
    };
    const queue = new Queue(callback, 10, onError);

    await queue.push('good');
    await queue.push('bad');
    await queue.push('good2');

    expect(errors.length).to.equal(1);
    expect(errors[0].item).to.equal('bad');
    expect(errors[0].err.message).to.equal('Test error');
  });

  it('Applies throttle delay between items', async () => {
    const timestamps = [];
    const callback = async (item) => {
      timestamps.push(Date.now());
    };
    const queue = new Queue(callback, 1, null, 100);

    await queue.push('item1');
    await queue.push('item2');

    const timeDiff = timestamps[1] - timestamps[0];
    expect(timeDiff).to.be.at.least(100);
  });

  it('Processes items in FIFO order', async () => {
    const results = [];
    const callback = async (item) => {
      results.push(item);
    };
    const queue = new Queue(callback, 1);

    await queue.push('first');
    await queue.push('second');
    await queue.push('third');

    expect(results).to.deep.equal(['first', 'second', 'third']);
  });
});

describe('getChildren (via crawl)', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = window.fetch;
  });

  afterEach(() => {
    window.fetch = originalFetch;
  });

  it('Parses files and folders correctly', async () => {
    window.fetch = async (url) => ({
      ok: true,
      json: async () => (url.includes('bulk-publish') || url.includes('page-builder') ? [] : mockBasicResponse),
      headers: { get: () => null },
    });

    const { results } = crawl({
      path: '/adobecom/da-bacom/tools',
      callback: null,
      concurrent: 10,
      throttle: 10,
    });

    const files = await results;
    const filesWithExt = files.filter((f) => f.ext);
    expect(filesWithExt.length).to.equal(2);
    expect(filesWithExt[0].name).to.equal('bulk');
    expect(filesWithExt[1].name).to.equal('landing-page');
  });

  it('Skips items with empty name', async () => {
    const consoleLogs = [];
    const originalLog = console.log;
    console.log = (...args) => {
      consoleLogs.push(args.join(' '));
    };

    window.fetch = async (url) => ({
      ok: true,
      json: async () => (url.includes('bulk-publish') || url.includes('page-builder') ? [] : mockBasicResponse),
      headers: { get: () => null },
    });

    const { results } = crawl({
      path: '/adobecom/da-bacom/tools',
      callback: null,
      concurrent: 10,
      throttle: 10,
    });

    await results;

    console.log = originalLog;

    const emptyNameLog = consoleLogs.find((log) => log.includes('empty name'));
    expect(emptyNameLog).to.include('/adobecom/da-bacom/tools/');
  });

  it('Separates files from folders', async () => {
    window.fetch = async (url) => ({
      ok: true,
      json: async () => (url.includes('bulk-publish') || url.includes('page-builder') ? [] : mockBasicResponse),
      headers: { get: () => null },
    });

    const { results } = crawl({
      path: '/adobecom/da-bacom/tools',
      callback: null,
      concurrent: 10,
      throttle: 10,
    });

    const files = await results;
    // Should have 2 files (bulk.html, landing-page.json)
    // and should have crawled 2 folders (bulk-publish, page-builder)
    expect(files.length).to.equal(2);
    expect(files.every((f) => f.ext)).to.equal(true);
  });

  it('Handles failed fetch gracefully', async () => {
    window.fetch = async (url) => ({
      ok: false,
      status: 404,
      headers: { get: () => null },
    });

    const { results } = crawl({
      path: '/nonexistent',
      callback: null,
      concurrent: 10,
      throttle: 10,
    });

    const files = await results;
    expect(files.length).to.equal(0);
  });
});

describe('crawl', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = window.fetch;
  });

  afterEach(() => {
    window.fetch = originalFetch;
  });

  it('Crawls single folder with only files', async () => {
    window.fetch = async (url) => ({
      ok: true,
      json: async () => mockFilesOnlyResponse,
      headers: { get: () => null },
    });

    const { results } = crawl({
      path: '/test',
      callback: null,
      concurrent: 10,
      throttle: 10,
    });

    const files = await results;
    expect(files.length).to.equal(2);
    expect(files[0].name).to.equal('file1');
    expect(files[1].name).to.equal('file2');
  });

  it('Crawls nested folders recursively', async () => {
    window.fetch = async (url) => {
      if (url.includes('/test/nested/subfolder')) {
        return { ok: true, json: async () => mockNestedFolder2Response, headers: { get: () => null } };
      }
      if (url.includes('/test/nested')) {
        return { ok: true, json: async () => mockNestedFolder1Response, headers: { get: () => null } };
      }
      return { ok: true, json: async () => [{ path: '/test/nested', name: 'nested' }], headers: { get: () => null } };
    };

    const { results } = crawl({
      path: '/test',
      callback: null,
      concurrent: 10,
      throttle: 10,
    });

    const files = await results;
    expect(files.length).to.equal(2);
    expect(files.some((f) => f.name === 'file')).to.equal(true);
    expect(files.some((f) => f.name === 'deep')).to.equal(true);
  });

  it('Skips items with empty names', async () => {
    window.fetch = async (url) => ({
      ok: true,
      json: async () => (url.includes('bulk-publish') || url.includes('page-builder') ? [] : mockBasicResponse),
      headers: { get: () => null },
    });

    const { results } = crawl({
      path: '/adobecom/da-bacom/tools',
      callback: null,
      concurrent: 10,
      throttle: 10,
    });

    const files = await results;
    expect(files.every((f) => f.name)).to.equal(true);
  });

  it('Executes callback for each file', async () => {
    window.fetch = async (url) => ({
      ok: true,
      json: async () => mockFilesOnlyResponse,
      headers: { get: () => null },
    });

    const callbackResults = [];
    const callback = async (file) => {
      callbackResults.push(file.name);
    };

    const { results } = crawl({
      path: '/test',
      callback,
      concurrent: 10,
      throttle: 10,
    });

    await results;
    expect(callbackResults).to.deep.equal(['file1', 'file2']);
  });

  it('Captures callback errors', async () => {
    window.fetch = async (url) => ({
      ok: true,
      json: async () => mockFilesOnlyResponse,
      headers: { get: () => null },
    });

    const callback = async (file) => {
      if (file.name === 'file2') {
        throw new Error('Callback error');
      }
    };

    const { results, getCallbackErrors } = crawl({
      path: '/test',
      callback,
      concurrent: 10,
      throttle: 10,
    });

    await results;
    const errors = getCallbackErrors();
    expect(errors.length).to.equal(1);
    expect(errors[0].item.name).to.equal('file2');
    expect(errors[0].err.message).to.equal('Callback error');
  });

  it('Cancels crawl when requested', async () => {
    let fetchCount = 0;
    window.fetch = async (url) => {
      fetchCount += 1;
      await new Promise((resolve) => { setTimeout(resolve, 20); });
      return { ok: true, json: async () => (url.includes('bulk-publish') || url.includes('page-builder') ? [] : mockBasicResponse), headers: { get: () => null } };
    };

    const { results, cancelCrawl } = crawl({
      path: '/test',
      callback: null,
      concurrent: 10,
      throttle: 50,
    });

    setTimeout(() => {
      cancelCrawl();
    }, 10);

    await results;
    expect(fetchCount).to.be.lessThan(10);
  });

  it('Tracks duration correctly', async () => {
    window.fetch = async (url) => ({
      ok: true,
      json: async () => mockFilesOnlyResponse,
      headers: { get: () => null },
    });

    const { results, getDuration } = crawl({
      path: '/test',
      callback: null,
      concurrent: 10,
      throttle: 50,
    });

    const durationBefore = getDuration();
    expect(parseFloat(durationBefore)).to.be.at.least(0);

    await results;

    const durationAfter = getDuration();
    expect(parseFloat(durationAfter)).to.be.at.least(0.05);
  });

  it('Works without callback', async () => {
    window.fetch = async (url) => ({
      ok: true,
      json: async () => mockFilesOnlyResponse,
      headers: { get: () => null },
    });

    const { results } = crawl({
      path: '/test',
      callback: null,
      concurrent: 10,
      throttle: 10,
    });

    const files = await results;
    expect(files.length).to.equal(2);
  });

  it('Respects throttle parameter', async () => {
    let firstFetchTime;
    let secondFetchTime;
    let fetchCount = 0;

    window.fetch = async (url) => {
      fetchCount += 1;
      if (fetchCount === 1) {
        firstFetchTime = Date.now();
        return { ok: true, json: async () => [{ path: '/test/folder1', name: 'folder1' }], headers: { get: () => null } };
      }
      if (fetchCount === 2) {
        secondFetchTime = Date.now();
        return { ok: true, json: async () => mockFilesOnlyResponse, headers: { get: () => null } };
      }
      return { ok: true, json: async () => [], headers: { get: () => null } };
    };

    const { results } = crawl({
      path: '/test',
      callback: null,
      concurrent: 10,
      throttle: 50,
    });

    await results;

    const timeDiff = secondFetchTime - firstFetchTime;
    expect(timeDiff).to.be.at.least(50);
  });

  it('Resolves results promise with all files', async () => {
    window.fetch = async (url) => {
      if (url.includes('/test/nested/subfolder')) {
        return { ok: true, json: async () => mockNestedFolder2Response, headers: { get: () => null } };
      }
      if (url.includes('/test/nested')) {
        return { ok: true, json: async () => mockNestedFolder1Response, headers: { get: () => null } };
      }
      return { ok: true, json: async () => [{ path: '/test/nested', name: 'nested' }], headers: { get: () => null } };
    };

    const { results } = crawl({
      path: '/test',
      callback: null,
      concurrent: 10,
      throttle: 10,
    });

    const files = await results;
    expect(Array.isArray(files)).to.equal(true);
    expect(files.length).to.equal(2);
    expect(files.every((f) => f.name && f.ext)).to.equal(true);
  });

  it('Handles path as an array of multiple paths', async () => {
    const mockResponses = {
      '/path1': mockPath1Response,
      '/path2': mockPath2Response,
    };

    window.fetch = async (url) => {
      const matchingPath = Object.keys(mockResponses).find((path) => url.includes(path));
      return {
        ok: true,
        json: async () => (matchingPath ? mockResponses[matchingPath] : []),
        headers: { get: () => null },
      };
    };

    const { results } = crawl({
      path: ['/path1', '/path2'],
      callback: null,
      concurrent: 10,
      throttle: 10,
    });

    const files = await results;
    expect(files.length).to.equal(2);
    expect(files.some((f) => f.name === 'file1' && f.ext === 'html')).to.equal(true);
    expect(files.some((f) => f.name === 'file2' && f.ext === 'json')).to.equal(true);
  });

  it('Crawls children of paths when path is an array', async () => {
    const mockResponses = {
      '/parent1/child': mockParent1ChildResponse,
      '/parent1': mockParent1Response,
      '/parent2/subfolder': mockParent2SubfolderResponse,
      '/parent2': mockParent2Response,
    };

    window.fetch = async (url) => {
      const matchingPath = Object.keys(mockResponses).find((path) => url.includes(path));
      return {
        ok: true,
        json: async () => (matchingPath ? mockResponses[matchingPath] : []),
        headers: { get: () => null },
      };
    };

    const { results } = crawl({
      path: ['/parent1', '/parent2'],
      callback: null,
      concurrent: 10,
      throttle: 10,
    });

    const files = await results;
    expect(files.length).to.equal(4);
    expect(files.some((f) => f.name === 'file1')).to.equal(true);
    expect(files.some((f) => f.name === 'deep1')).to.equal(true);
    expect(files.some((f) => f.name === 'file2')).to.equal(true);
    expect(files.some((f) => f.name === 'deep2')).to.equal(true);
  });
});
