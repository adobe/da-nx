// test/media-library/architecture/module-boundaries.test.js
import { expect } from '@esm-bundle/chai';

describe('Module boundaries', () => {
  // TODO: Fix fetch 404 issues in test environment
  it.skip('display/ does not import from indexing/', async () => {
    const displayFiles = [
      'loader.js',
      'state.js',
      'utils.js',
      'features/export.js',
      'features/filters.js',
      'features/pin.js',
      'features/templates.js',
      'components/topbar/topbar.js',
      'components/sidebar/sidebar.js',
      'components/grid/grid.js',
      'components/mediainfo/mediainfo.js',
    ];

    let checkedCount = 0;
    for (const file of displayFiles) {
      const response = await fetch(`/nx/blocks/media-library/display/${file}`);
      expect(response.ok, `Could not fetch display/${file}`).to.be.true;
      const content = await response.text();
      expect(content, `display/${file} imports from indexing/`)
        .to.not.match(/from ['"].*indexing/);
      checkedCount += 1;
    }
    expect(checkedCount).to.equal(displayFiles.length);
  });

  it.skip('indexing/ does not import from display/', async () => {
    const indexingFiles = [
      'indexer-worker.js',
      'indexer-service.js',
      'coordinator.js',
      'build.js',
      'load.js',
    ];

    let checkedCount = 0;
    for (const file of indexingFiles) {
      const response = await fetch(`/nx/blocks/media-library/indexing/${file}`);
      expect(response.ok, `Could not fetch indexing/${file}`).to.be.true;
      const content = await response.text();
      expect(content, `indexing/${file} imports from display/`)
        .to.not.match(/from ['"].*display/);
      checkedCount += 1;
    }
    expect(checkedCount).to.equal(indexingFiles.length);
  });

  it.skip('core/ does not import DOM or Lit', async () => {
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
      'params.js',
      'browser-storage.js',
    ];

    let checkedCount = 0;
    for (const file of coreFiles) {
      const response = await fetch(`/nx/blocks/media-library/core/${file}`);
      expect(response.ok, `Could not fetch core/${file}`).to.be.true;
      const content = await response.text();
      expect(content, `core/${file} imports Lit`).to.not.match(/from ['"].*lit/);
      expect(content, `core/${file} uses document`).to.not.match(/document\./);
      // Allow window.sessionStorage and window.crypto
      expect(content, `core/${file} uses window (non-worker APIs)`)
        .to.not.match(/window\.(?!sessionStorage|crypto)/);
      checkedCount += 1;
    }
    expect(checkedCount).to.equal(coreFiles.length);
  });

  it('media-library.js does not directly import indexing modules', async () => {
    const response = await fetch('/nx/blocks/media-library/media-library.js');
    const content = await response.text();

    // Should not import indexing modules (uses Worker instead)
    // Allow indexer-worker.js since that's the Worker entry point
    expect(content).to.not.match(/from ['"]\.\/indexing\/(?!indexer-worker)/);
  });
});
