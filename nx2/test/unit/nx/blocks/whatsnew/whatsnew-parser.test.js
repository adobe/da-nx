import { expect } from '@esm-bundle/chai';
import * as parser from '../../../../../blocks/whatsnew/whatsnew-parser.js';
import { loadEntries, fetchPublishedDate } from '../../../../../blocks/whatsnew/whatsnew-parser.js';

function mockFetch(handler) {
  const originalFetch = window.fetch;
  window.fetch = handler;
  return () => { window.fetch = originalFetch; };
}

describe('loadEntries', () => {
  let restoreFetch;

  afterEach(() => {
    restoreFetch?.();
    restoreFetch = undefined;
  });

  it('does not export parseEntries', () => {
    expect('parseEntries' in parser).to.be.false;
  });

  it('loads entries and rewrites relative media URLs without fragment decoration', async () => {
    restoreFetch = mockFetch(async () => new Response(`
      <html>
        <head><meta name="published-date" content="2026-09-10"></head>
        <body>
          <main>
            <div>
              <h3 id="entry-1">Feature</h3>
              <picture><img src="./media_1.png"></picture>
              <p><a href="./media_1.mp4">Video</a></p>
              <p>Body</p>
            </div>
          </main>
        </body>
      </html>
    `, {
      status: 200,
      headers: new Headers({ 'Content-Type': 'text/html' }),
    }));

    const result = await loadEntries('/nx/fragments/guides/whats-new');

    expect(result?.publishedDate).to.equal('2026-09-10');
    expect(result?.entries).to.have.lengthOf(1);
    expect(result?.entries[0].id).to.equal('entry-1');
    expect(result?.entries[0].title).to.equal('Feature');
    expect(result?.entries[0].picture.querySelector('img').src).to.match(/\/nx\/fragments\/guides\/media_1\.png$/);
    expect(result?.entries[0].videoSrc).to.match(/\/nx\/fragments\/guides\/media_1\.mp4$/);
    expect(result?.entries[0].body).to.equal('Body');
  });

  it('skips sections whose headings have no id', async () => {
    restoreFetch = mockFetch(async () => new Response(`
      <html><body><main>
        <div><h3>No id here</h3><p>Ignored</p></div>
        <div><h3 id="entry-1">Kept</h3><p>Body</p></div>
      </main></body></html>
    `, { status: 200, headers: new Headers({ 'Content-Type': 'text/html' }) }));

    const result = await loadEntries('/nx/fragments/guides/whats-new');

    expect(result?.entries).to.have.lengthOf(1);
    expect(result?.entries[0].id).to.equal('entry-1');
  });

  it('picks the body paragraph that does not wrap media and keeps videoSrc optional', async () => {
    restoreFetch = mockFetch(async () => new Response(`
      <html><body><main>
        <div>
          <h3 id="entry-1">Feature</h3>
          <p><picture><img src="./media_1.png"></picture></p>
          <p>Real body text</p>
        </div>
        <div>
          <h3 id="entry-2">Feature two</h3>
          <picture><img src="./media_2.png"></picture>
          <p>Body two</p>
        </div>
      </main></body></html>
    `, { status: 200, headers: new Headers({ 'Content-Type': 'text/html' }) }));

    const result = await loadEntries('/nx/fragments/guides/whats-new');

    expect(result?.entries[0].body).to.equal('Real body text');
    expect(result?.entries[1].videoSrc).to.equal(null);
  });

  it('returns an empty entry list when the fragment has no valid sections', async () => {
    restoreFetch = mockFetch(async () => new Response(
      '<html><body><main></main></body></html>',
      { status: 200, headers: new Headers({ 'Content-Type': 'text/html' }) },
    ));

    const result = await loadEntries('/nx/fragments/guides/whats-new');

    expect(result?.entries).to.deep.equal([]);
  });
});

describe('fetchPublishedDate', () => {
  let restoreFetch;

  afterEach(() => {
    restoreFetch?.();
    restoreFetch = undefined;
  });

  it('reads the published-date meta tag from the response', async () => {
    restoreFetch = mockFetch(async () => new Response(
      '<html><head><meta name="published-date" content="2026-09-10"></head><body></body></html>',
      { status: 200, headers: new Headers({ 'Content-Type': 'text/html' }) },
    ));
    const date = await fetchPublishedDate('/nx/fragments/guides/whats-new');
    expect(date).to.equal('2026-09-10');
  });

  it('returns null on a non-ok response', async () => {
    restoreFetch = mockFetch(async () => new Response('', { status: 404 }));
    const date = await fetchPublishedDate('/nx/fragments/guides/whats-new');
    expect(date).to.equal(null);
  });

  it('returns null when the meta tag is missing', async () => {
    restoreFetch = mockFetch(async () => new Response(
      '<html><head></head><body></body></html>',
      { status: 200, headers: new Headers({ 'Content-Type': 'text/html' }) },
    ));
    const date = await fetchPublishedDate('/nx/fragments/guides/whats-new');
    expect(date).to.equal(null);
  });

  it('returns null when fetch throws', async () => {
    restoreFetch = mockFetch(async () => {
      throw new Error('network error');
    });
    const date = await fetchPublishedDate('/nx/fragments/guides/whats-new');
    expect(date).to.equal(null);
  });
});
