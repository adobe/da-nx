import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import {
  parseSelections, writeSelections, mergeSelections,
} from '../../../nx/blocks/loc/connectors/glaas/imageSelections.js';
import {
  LOC_VIDEOS_KEY, parseVideoSelections, writeVideoSelections,
} from '../../../nx/blocks/loc/connectors/glaas/videoSelections.js';

describe('GLaaS video selections', () => {
  const src = 'https://video.tv.adobe.com/v/333754?autoplay=false#t=10';
  const stageSrc = 'https://stage-video.tv.adobe.com/v/32079';
  const imageSrc = 'https://content.da.live/org/site/Media_Abc.png';
  const selectedRows = [{ src, translate: 'true' }];
  const imageRows = [{ src: imageSrc, translate: 'true' }];
  const html = '<body><main><p>Page content</p></main></body>';

  afterEach(() => sinon.restore());

  it('defaults to no selected videos when metadata is absent or only images are selected', () => {
    expect([...parseVideoSelections(html)]).to.deep.equal([]);
    expect([...parseVideoSelections(writeSelections(html, imageRows))]).to.deep.equal([]);
  });

  it('round-trips selected video URLs without mixing them with image selections', () => {
    const withImages = writeSelections(html, imageRows);
    const result = writeVideoSelections(withImages, [
      ...selectedRows,
      { src: stageSrc, translate: 'true' },
      { src: 'https://video.tv.adobe.com/v/2', translate: 'false' },
    ]);
    expect([...parseVideoSelections(result)]).to.deep.equal([src, stageSrc]);
    expect([...parseSelections(result)]).to.deep.equal([imageSrc]);
    expect(result).to.include('<p>Page content</p>');
  });

  it('preserves mixed-case query values and fragments in video selections', () => {
    const mixedCase = 'https://video.tv.adobe.com/v/333754?token=AbC%2F123#PartOne';
    const result = writeVideoSelections(html, [{ src: mixedCase, translate: 'true' }]);
    expect([...parseVideoSelections(result)]).to.deep.equal([mixedCase]);
  });

  it('updates an existing mixed-case key without duplicating it or changing other metadata', () => {
    const source = `<body><main></main><div class="da-metadata">
      <div><div>Loc-Videos</div><div>[]</div></div>
      <div><div>acceptedhashes</div><div>abc123</div></div>
    </div></body>`;
    const result = writeVideoSelections(source, selectedRows);
    const doc = new DOMParser().parseFromString(result, 'text/html');
    expect(doc.querySelector('.da-metadata').children).to.have.length(2);
    expect([...parseVideoSelections(doc)]).to.deep.equal([src]);
    expect(result).to.include('<div>acceptedhashes</div><div>abc123</div>');
  });

  it('persists explicit empty video selections without clearing selected images', () => {
    const initial = writeVideoSelections(writeSelections(html, imageRows), selectedRows);
    const result = writeVideoSelections(initial, []);
    expect(result).to.include(`<div>${LOC_VIDEOS_KEY}</div><div>[]</div>`);
    expect([...parseVideoSelections(result)]).to.deep.equal([]);
    expect([...parseSelections(result)]).to.deep.equal([imageSrc]);
  });

  it('preserves selected videos when the existing image writer updates or clears images', () => {
    const withVideos = writeVideoSelections(html, selectedRows);
    const result = writeSelections(writeSelections(withVideos, imageRows), []);
    expect([...parseVideoSelections(result)]).to.deep.equal([src]);
    expect([...parseSelections(result)]).to.deep.equal([]);
  });

  it('creates explicit empty video selections and does not duplicate metadata on repeated writes', () => {
    const result = writeVideoSelections(writeVideoSelections(html, []), []);
    const doc = new DOMParser().parseFromString(result, 'text/html');
    expect(doc.querySelectorAll('body > .da-metadata')).to.have.length(1);
    expect(doc.querySelector('.da-metadata').children).to.have.length(1);
    expect(result).to.include(`<div>${LOC_VIDEOS_KEY}</div><div>[]</div>`);
  });

  it('reads and writes an existing document without parsing it again', () => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const parseSpy = sinon.spy(DOMParser.prototype, 'parseFromString');
    writeVideoSelections(doc, selectedRows);
    expect([...parseVideoSelections(doc)]).to.deep.equal([src]);
    expect(parseSpy.called).to.be.false;
  });

  ['not json', '{}', 'null'].forEach((value) => {
    it(`defaults to no selected videos for invalid selection data ${value}`, () => {
      const source = `<body><div class="da-metadata">
        <div><div>${LOC_VIDEOS_KEY}</div><div>${value}</div></div>
      </div></body>`;
      expect([...parseVideoSelections(source)]).to.deep.equal([]);
    });
  });

  it('ignores unchecked, malformed and duplicate selection entries', () => {
    const result = writeVideoSelections(html, [
      ...selectedRows,
      ...selectedRows,
      null,
      { src: stageSrc, translate: true },
      { src: stageSrc, translate: 'false' },
      { src: '/v/1', translate: 'true' },
      { translate: 'true' },
    ]);
    expect([...parseVideoSelections(result)]).to.deep.equal([src]);
  });

  it('reuses delta merging to preserve concurrent selections and remove deselected or stale videos', () => {
    const removed = 'https://video.tv.adobe.com/v/3';
    const rows = mergeSelections(
      [...selectedRows, { src: stageSrc, translate: 'true' }, { src: removed, translate: 'true' }],
      [...selectedRows, { src: stageSrc, translate: 'false' }],
      [{ src, translate: 'false' }, { src: stageSrc, translate: 'false' }],
    );
    const result = writeVideoSelections(html, rows);
    expect([...parseVideoSelections(result)]).to.deep.equal([stageSrc]);
  });
});
