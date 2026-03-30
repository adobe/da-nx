import { expect } from '@esm-bundle/chai';
import { findFragments } from '../../nx/blocks/snapshot-admin/utils/fragments.js';

function mockHtml(links = [], imgAlts = []) {
  const anchors = links.map((href) => `<a href="${href}">link</a>`).join('');
  const imgs = imgAlts.map((alt) => `<img alt="${alt}" />`).join('');
  return `<html><body>${anchors}${imgs}</body></html>`;
}

describe('findFragments', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = window.fetch;
  });

  afterEach(() => {
    window.fetch = originalFetch;
  });

  it('Discovers fragment URLs from anchor hrefs', async () => {
    window.fetch = async (url) => {
      if (url.toString().startsWith('/') || url.toString().startsWith('http://localhost')) {
        return originalFetch.call(window, url);
      }
      const html = mockHtml(['https://example.com/fragments/header']);
      return new Response(html, { status: 200, headers: new Headers({ 'x-da-actions': '' }) });
    };

    const resources = [{ path: '/page1' }];
    const result = await findFragments(resources, 'org', 'site');
    expect(result).to.have.length(1);
    expect(result[0].path).to.equal('/fragments/header');
    expect(result[0].selected).to.equal(true);
  });

  it('Discovers fragment URLs from image alt attributes', async () => {
    window.fetch = async (url) => {
      if (url.toString().startsWith('/') || url.toString().startsWith('http://localhost')) {
        return originalFetch.call(window, url);
      }
      const html = mockHtml([], ['https://example.com/fragments/video-modal | Video | :play:']);
      return new Response(html, { status: 200, headers: new Headers({ 'x-da-actions': '' }) });
    };

    const resources = [{ path: '/page1' }];
    const result = await findFragments(resources, 'org', 'site');
    expect(result).to.have.length(1);
    expect(result[0].path).to.equal('/fragments/video-modal');
  });

  it('Deduplicates against existing resource paths', async () => {
    window.fetch = async (url) => {
      if (url.toString().startsWith('/') || url.toString().startsWith('http://localhost')) {
        return originalFetch.call(window, url);
      }
      const html = mockHtml(['https://example.com/fragments/header']);
      return new Response(html, { status: 200, headers: new Headers({ 'x-da-actions': '' }) });
    };

    const resources = [{ path: '/page1' }, { path: '/fragments/header' }];
    const result = await findFragments(resources, 'org', 'site');
    expect(result).to.have.length(0);
  });

  it('Deduplicates fragments found across multiple pages', async () => {
    window.fetch = async (url) => {
      if (url.toString().startsWith('/') || url.toString().startsWith('http://localhost')) {
        return originalFetch.call(window, url);
      }
      const html = mockHtml(['https://example.com/fragments/shared']);
      return new Response(html, { status: 200, headers: new Headers({ 'x-da-actions': '' }) });
    };

    const resources = [{ path: '/page1' }, { path: '/page2' }];
    const result = await findFragments(resources, 'org', 'site');
    expect(result).to.have.length(1);
  });

  it('Recursively discovers nested fragments', async () => {
    const responses = {
      '/page1.html': mockHtml(['https://example.com/fragments/level1']),
      '/fragments/level1.html': mockHtml(['https://example.com/fragments/level2']),
      '/fragments/level2.html': mockHtml([]),
    };

    window.fetch = async (url) => {
      const urlStr = url.toString();
      if (urlStr.startsWith('/') || urlStr.startsWith('http://localhost')) {
        return originalFetch.call(window, url);
      }
      for (const [path, html] of Object.entries(responses)) {
        if (urlStr.includes(path)) {
          return new Response(html, { status: 200, headers: new Headers({ 'x-da-actions': '' }) });
        }
      }
      return new Response('', { status: 200, headers: new Headers({ 'x-da-actions': '' }) });
    };

    const resources = [{ path: '/page1' }];
    const result = await findFragments(resources, 'org', 'site');
    expect(result).to.have.length(2);
    expect(result[0].path).to.equal('/fragments/level1');
    expect(result[1].path).to.equal('/fragments/level2');
  });

  it('Handles circular references without infinite loop', async () => {
    const responses = {
      '/page1.html': mockHtml(['https://example.com/fragments/a']),
      '/fragments/a.html': mockHtml(['https://example.com/fragments/b']),
      '/fragments/b.html': mockHtml(['https://example.com/fragments/a']),
    };

    window.fetch = async (url) => {
      const urlStr = url.toString();
      if (urlStr.startsWith('/') || urlStr.startsWith('http://localhost')) {
        return originalFetch.call(window, url);
      }
      for (const [path, html] of Object.entries(responses)) {
        if (urlStr.includes(path)) {
          return new Response(html, { status: 200, headers: new Headers({ 'x-da-actions': '' }) });
        }
      }
      return new Response('', { status: 200, headers: new Headers({ 'x-da-actions': '' }) });
    };

    const resources = [{ path: '/page1' }];
    const result = await findFragments(resources, 'org', 'site');
    expect(result).to.have.length(2);
  });

  it('Returns empty array when no fragments found', async () => {
    window.fetch = async (url) => {
      if (url.toString().startsWith('/') || url.toString().startsWith('http://localhost')) {
        return originalFetch.call(window, url);
      }
      const html = mockHtml([]);
      return new Response(html, { status: 200, headers: new Headers({ 'x-da-actions': '' }) });
    };

    const resources = [{ path: '/page1' }];
    const result = await findFragments(resources, 'org', 'site');
    expect(result).to.have.length(0);
  });

  it('Skips non-fragment URLs', async () => {
    window.fetch = async (url) => {
      if (url.toString().startsWith('/') || url.toString().startsWith('http://localhost')) {
        return originalFetch.call(window, url);
      }
      const html = mockHtml(['https://example.com/about', 'https://example.com/contact']);
      return new Response(html, { status: 200, headers: new Headers({ 'x-da-actions': '' }) });
    };

    const resources = [{ path: '/page1' }];
    const result = await findFragments(resources, 'org', 'site');
    expect(result).to.have.length(0);
  });

  it('Handles fetch errors gracefully', async () => {
    window.fetch = async (url) => {
      if (url.toString().startsWith('/') || url.toString().startsWith('http://localhost')) {
        return originalFetch.call(window, url);
      }
      return new Response('', { status: 404, headers: new Headers() });
    };

    const resources = [{ path: '/page1' }];
    const result = await findFragments(resources, 'org', 'site');
    expect(result).to.have.length(0);
  });

  it('Strips .html extension from discovered paths', async () => {
    window.fetch = async (url) => {
      if (url.toString().startsWith('/') || url.toString().startsWith('http://localhost')) {
        return originalFetch.call(window, url);
      }
      const html = mockHtml(['https://example.com/fragments/header.html']);
      return new Response(html, { status: 200, headers: new Headers({ 'x-da-actions': '' }) });
    };

    const resources = [{ path: '/page1' }];
    const result = await findFragments(resources, 'org', 'site');
    expect(result).to.have.length(1);
    expect(result[0].path).to.equal('/fragments/header');
  });
});
