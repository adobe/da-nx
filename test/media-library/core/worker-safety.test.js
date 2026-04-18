import { expect } from '@esm-bundle/chai';

describe('core/ worker safety', () => {
  it('utils.js does not reference DOM APIs', async () => {
    const response = await fetch('/nx/blocks/media-library/core/utils.js');
    const content = await response.text();

    // Check for common DOM API references that would break in workers
    expect(content).to.not.match(/document\./);
    expect(content).to.not.match(/window\.location/);
    expect(content).to.not.match(/localStorage/);
  });

  it('state.js does not reference DOM APIs', async () => {
    const response = await fetch('/nx/blocks/media-library/core/state.js');
    const content = await response.text();

    // state.js should be pure - no DOM references
    expect(content).to.not.match(/document\./);
    expect(content).to.not.match(/window\./);
    expect(content).to.not.match(/localStorage/);
  });

  it('core files do not import Lit', async () => {
    const coreFiles = [
      'utils.js',
      'constants.js',
      'urls.js',
      'media.js',
      'paths.js',
      'messages.js',
      'errors.js',
      'storage.js',
      'state.js',
    ];

    for (const file of coreFiles) {
      const response = await fetch(`/nx/blocks/media-library/core/${file}`);
      if (response.ok) {
        const content = await response.text();
        expect(content, `${file} imports Lit`).to.not.match(/from ['"].*lit/);
      }
    }
  });
});
