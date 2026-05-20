import { expect } from '@esm-bundle/chai';
import {
  aemBasePathFromLangstoreSource,
  buildMultimodalRolloutMediaEntries,
} from '../../../nx/blocks/loc/views/rollout/multimodalRollout.js';

describe('MULTIMODAL rollout media entries', () => {
  it('builds entries with locale-safe aemBasePath', () => {
    const shared = '/adobecom/da-dc/langstore/de/acrobat/foo/rect.png';
    const entries = buildMultimodalRolloutMediaEntries({
      org: 'adobecom',
      site: 'da-dc',
      langLocation: '/langstore/de',
      daSourcePaths: [shared],
    });
    expect(entries).to.have.length(1);
    expect(entries[0].source).to.equal(shared);
    expect(entries[0].aemBasePath).to.equal('/acrobat/foo/rect.png');
    expect(aemBasePathFromLangstoreSource({
      org: 'adobecom',
      site: 'da-dc',
      langLocation: '/langstore/de',
      daSourcePath: shared,
    })).to.equal('/acrobat/foo/rect.png');
  });

  it('dedupes duplicate da source paths', () => {
    const path = '/adobecom/da-dc/langstore/de/acrobat/a.png';
    const entries = buildMultimodalRolloutMediaEntries({
      org: 'adobecom',
      site: 'da-dc',
      langLocation: '/langstore/de',
      daSourcePaths: [path, path],
    });
    expect(entries).to.have.length(1);
  });
});
