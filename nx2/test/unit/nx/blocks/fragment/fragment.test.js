import { expect } from '@esm-bundle/chai';
import { setConfig } from '../../../../../scripts/nx.js';

// fragment.js captures getConfig() into a module-level constant at import
// time, so setConfig() must resolve before it's ever imported.
await setConfig({ hostnames: [] });
const { loadFragment } = await import('../../../../../blocks/fragment/fragment.js');

const HTML = `
  <html>
    <body>
      <main>
        <div>
          <p><img src="./media_1.png"></p>
          <p><a href="./media_2.mp4">https://elsewhere.example/media_2.mp4</a></p>
        </div>
      </main>
    </body>
  </html>
`;

describe('loadFragment', () => {
  let restoreFetch;

  afterEach(() => {
    restoreFetch?.();
    restoreFetch = undefined;
  });

  it('rewrites relative ./media_ image and link paths to absolute URLs', async () => {
    const originalFetch = window.fetch;
    window.fetch = async () => new Response(HTML, {
      status: 200,
      headers: new Headers({ 'Content-Type': 'text/html' }),
    });
    restoreFetch = () => { window.fetch = originalFetch; };

    const fragment = await loadFragment('/nx/fragments/guides/whats-new');

    const img = fragment.querySelector('img');
    const a = fragment.querySelector('a');
    expect(img.getAttribute('src')).to.equal(`${window.location.origin}/nx/fragments/guides/media_1.png`);
    expect(a.getAttribute('href')).to.equal(`${window.location.origin}/nx/fragments/guides/media_2.mp4`);
  });
});
