import { expect } from '@esm-bundle/chai';
import downloadQueue from '../../../nx/blocks/loc/utils/downloadQueue.js';

const delay = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
const makeUrls = (n) => Array.from({ length: n }, (_, i) => ({ id: i }));

describe('downloadQueue', () => {
  it('processes every url and returns the same array', async () => {
    const urls = makeUrls(12);
    const result = await downloadQueue(urls, async (url) => { url.status = 'success'; });
    expect(result).to.equal(urls);
    expect(urls.every((url) => url.status === 'success')).to.be.true;
  });

  it('resolves immediately for an empty list', async () => {
    expect(await downloadQueue([], async () => {})).to.deep.equal([]);
  });

  it('never exceeds the concurrency limit', async () => {
    let active = 0;
    let peak = 0;
    await downloadQueue(makeUrls(10), async (url) => {
      active += 1;
      peak = Math.max(peak, active);
      await delay(5);
      active -= 1;
      url.status = 'success';
    }, 3);
    expect(peak).to.equal(3);
  });

  it('marks a throwing callback as an error and keeps going', async () => {
    const urls = makeUrls(4);
    await downloadQueue(urls, async (url) => {
      if (url.id === 1) throw new Error('boom');
      url.status = 'success';
    });
    expect(urls[1]).to.include({ status: 'error', error: 'boom' });
    expect(urls.filter((url) => url.status === 'success')).to.have.length(3);
  });

  it('marks a url left without a status as an error instead of hanging', async () => {
    const urls = makeUrls(2);
    await downloadQueue(urls, async (url) => {
      if (url.id === 0) url.status = 'success';
    });
    expect(urls[1].status).to.equal('error');
    expect(urls[1].error).to.be.a('string');
  });

  it('keeps an error message the callback already set', async () => {
    const urls = makeUrls(1);
    await downloadQueue(urls, async (url) => { url.error = 'custom'; });
    expect(urls[0]).to.include({ status: 'error', error: 'custom' });
  });

  it('spaces callback starts by minIntervalMs', async () => {
    const starts = [];
    await downloadQueue(makeUrls(4), async (url) => {
      starts.push(Date.now());
      url.status = 'success';
    }, 5, { minIntervalMs: 40 });
    const gaps = starts.slice(1).map((t, i) => t - starts[i]);
    gaps.forEach((gap) => expect(gap).to.be.at.least(35));
  });

  it('starts callbacks without delay by default', async () => {
    const start = Date.now();
    await downloadQueue(makeUrls(10), async (url) => { url.status = 'success'; });
    expect(Date.now() - start).to.be.below(100);
  });
});
