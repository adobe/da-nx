import { expect } from '@esm-bundle/chai';
import { buildMediaSheet } from '../../../nx/blocks/media-library/indexing/sheets.js';

describe('media index sheets', () => {
  it('buildMediaSheet keeps the stage of rows from saved pages only', () => {
    const [saved, previewed] = buildMediaSheet([
      { hash: '1a', doc: '/post.md', stage: 'source' },
      { hash: '1b', doc: '/post.md' },
    ]);
    expect(saved.stage).to.equal('source');
    expect(Object.keys(previewed)).to.not.include('stage');
  });
});
