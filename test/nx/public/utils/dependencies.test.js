import { expect } from '@esm-bundle/chai';

const names = ['da-lit', 'da-y-wrapper', 'da-parser'];
const paths = ['/deps/lit/dist/index.js', '/deps/da-y-wrapper/dist/index.js', '/deps/da-parser/dist/index.js'];

function runFrame({ variant, mapped = false, origin, crossOrigin = false } = {}) {
  const iframe = document.createElement('iframe');
  const url = new URL('./fixtures/dependencies.html', import.meta.url);
  url.searchParams.set('variant', variant);
  if (mapped) url.searchParams.set('mapped', mapped === 'legacy' ? 'legacy' : 'true');
  if (origin) url.searchParams.set('da-origin', origin);
  if (crossOrigin) {
    const moduleUrl = new URL(window.location.href);
    moduleUrl.hostname = '127.0.0.1';
    url.searchParams.set('module-origin', moduleUrl.origin);
  }
  iframe.src = url.href;
  return new Promise((resolve, reject) => {
    let timeout;
    function onMessage(event) {
      if (event.source !== iframe.contentWindow) return;
      clearTimeout(timeout);
      window.removeEventListener('message', onMessage);
      iframe.remove();
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(event.data);
    }
    timeout = setTimeout(() => {
      window.removeEventListener('message', onMessage);
      iframe.remove();
      reject(new Error('Dependency iframe timed out'));
    }, 10000);
    window.addEventListener('message', onMessage);
    document.body.append(iframe);
  });
}

['nx', 'nx2'].forEach((variant) => {
  describe(`${variant} shared dependencies`, () => {
    it('retains standalone defaults in a document without an import map', async () => {
      const result = await runFrame({ variant });
      const expected = paths.map((path) => `https://da.live${path}`);
      expect(result.before).to.deep.equal(expected);
      expect(result.after).to.deep.equal(expected);
      expect(result.legacy).to.deep.equal(expected);
    });

    it('configures dependencies independently in preview iframes', async () => {
      const origin = 'https://author.example';
      const result = await runFrame({ variant, origin });
      const expected = paths.map((path) => `${origin}${path}`);
      expect(result.before).to.deep.equal(expected);
      expect(result.after).to.deep.equal(expected);
      expect(result.legacy).to.deep.equal(expected);
      expect(result.daOrigin).to.equal(origin);
    });

    it('shares host-selected bundles with legacy imports and shared components', async () => {
      const result = await runFrame({ variant, mapped: true, origin: 'https://author.example' });
      const expected = names.map((name) => (
        new URL(`./fixtures/dependency.js?name=${name}`, import.meta.url).href
      ));
      expect(result.before).to.deep.equal(expected);
      expect(result.after).to.deep.equal(expected);
      expect(result.legacy).to.deep.equal(expected);
      expect(result.sameModules).to.deep.equal([true, true, true]);
      expect(result.sharedLit).to.equal(true);
    });

    it('derives the DA origin from the host-selected wrapper', async () => {
      const result = await runFrame({ variant, mapped: true });
      expect(result.daOrigin).to.equal(window.location.origin);
    });

    it('preserves existing legacy dependency aliases', async () => {
      const result = await runFrame({ variant, mapped: 'legacy' });
      expect(result.after).to.deep.equal(result.before);
      expect(result.legacy).to.deep.equal(result.after);
      expect(result.sameModules).to.deep.equal([true, true, true]);
      expect(result.sharedLit).to.equal(true);
    });

    it('uses document mappings when NX itself is served cross-origin', async () => {
      const result = await runFrame({ variant, mapped: true, crossOrigin: true });
      expect(result.sameModules).to.deep.equal([true, true, true]);
      expect(result.sharedLit).to.equal(true);
      expect(result.daOrigin).to.equal(window.location.origin);
    });
  });
});
