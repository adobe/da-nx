import { expect } from '@esm-bundle/chai';
import { parseWhatsNewEntries, fetchPublishedDate } from '../../../../../blocks/whatsnew/parse-whatsnew.js';

function buildFragment(html) {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  return doc.body.firstElementChild;
}

function mockFetch(handler) {
  const originalFetch = window.fetch;
  window.fetch = handler;
  return () => { window.fetch = originalFetch; };
}

describe('parseWhatsNewEntries', () => {
  it('parses each section into an entry with id, title, picture, and body', () => {
    const fragment = buildFragment(`
      <div><h3 id="entry-1">First feature</h3><picture><img src="./media_1.png"></picture><p>Body one</p></div>
      <div><h3 id="entry-2">Second feature</h3><picture><img src="./media_2.png"></picture><p>Body two</p></div>
    `);
    const entries = parseWhatsNewEntries(fragment);
    expect(entries).to.have.lengthOf(2);
    expect(entries[0].id).to.equal('entry-1');
    expect(entries[0].title).to.equal('First feature');
    expect(entries[0].picture).to.exist;
    expect(entries[0].body).to.equal('Body one');
    expect(entries[1].id).to.equal('entry-2');
    expect(entries[1].body).to.equal('Body two');
  });

  it('skips a section whose h3 has no id', () => {
    const fragment = buildFragment(`
      <div><h3>No id here</h3><p>Ignored</p></div>
      <div><h3 id="entry-1">Kept</h3><p>Body</p></div>
    `);
    const entries = parseWhatsNewEntries(fragment);
    expect(entries).to.have.lengthOf(1);
    expect(entries[0].id).to.equal('entry-1');
  });

  it('picks the body <p> that does not wrap the picture', () => {
    const fragment = buildFragment(`
      <div>
        <h3 id="entry-1">Feature</h3>
        <p><picture><img src="./media_1.png"></picture></p>
        <p>Real body text</p>
      </div>
    `);
    const entries = parseWhatsNewEntries(fragment);
    expect(entries[0].body).to.equal('Real body text');
  });

  it('returns an empty array for a fragment with no sections', () => {
    const fragment = buildFragment('');
    expect(parseWhatsNewEntries(fragment)).to.deep.equal([]);
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
});
