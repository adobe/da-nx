import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import { buildMediaIndexStructures } from '../../../nx/blocks/media-library/ui/data.js';
import '../../../nx/blocks/media-library/ui/views/grid/grid.js';

const MEDIA = [
  { url: 'https://main--site--org.aem.page/media_1.png', name: 'one.png', type: 'img > png', usageCount: 2 },
  { url: 'https://main--site--org.aem.page/media_2.png', name: 'two.png', type: 'img > png', usageCount: 1 },
];

describe('media reference counts', () => {
  it('counts distinct documents across URL variants and ignores standalone rows', () => {
    const rows = [
      { url: 'https://main--site--org.aem.live/media_abc.svg#width=1200&height=300', doc: '/a.md', timestamp: 1 },
      { url: 'https://main--site--org.preview.da.live/media_abc.svg', doc: '/a.md', timestamp: 2 },
      { url: 'https://main--site--org.aem.page/media_abc.svg', doc: '/b.md', timestamp: 3 },
      { url: 'https://main--site--org.aem.page/media_abc.svg', doc: '', timestamp: 4 },
    ];
    const { uniqueItems, usageIndex } = buildMediaIndexStructures(rows);
    expect(uniqueItems).to.have.length(1);
    expect(usageIndex.get('media_abc.svg').map((row) => row.doc)).to.deep.equal(['/a.md', '/b.md']);
    expect(usageIndex.get('media_abc.svg')[0].timestamp).to.equal(2);
  });
});

async function waitForCards(el) {
  for (let i = 0; i < 50; i += 1) {
    const btn = el.shadowRoot.querySelector('.media-open');
    if (btn) return;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { requestAnimationFrame(resolve); });
  }
}

describe('nx-media-grid', () => {
  let el;

  beforeEach(async () => {
    el = document.createElement('nx-media-grid');
    el.org = 'org';
    el.repo = 'site';
    el.mediaData = MEDIA;
    el.style.height = '800px';
    document.body.append(el);
    await el.updateComplete;
    await waitForCards(el);
  });

  afterEach(() => {
    el.remove();
  });

  it('renders a labelled button to open media details on each card', () => {
    const buttons = el.shadowRoot.querySelectorAll('.media-card .media-open');
    expect(buttons.length).to.equal(MEDIA.length);
    const [first] = buttons;
    expect(first.tagName).to.equal('BUTTON');
    expect(first.getAttribute('type')).to.equal('button');
    expect(first.getAttribute('aria-label')).to.equal('View details for one.png');
  });

  it('opens media details with the keyboard', async () => {
    const opened = [];
    el.addEventListener('mediaClick', (e) => opened.push(e.detail.media));

    const btn = el.shadowRoot.querySelector('.media-open');
    btn.focus();
    await sendKeys({ press: 'Enter' });
    await sendKeys({ press: 'Space' });

    expect(opened).to.have.length(2);
    expect(opened[0]).to.equal(MEDIA[0]);
  });

  it('opens media details with the mouse', () => {
    const opened = [];
    el.addEventListener('mediaClick', (e) => opened.push(e.detail.media));
    el.shadowRoot.querySelector('.media-open').click();
    expect(opened).to.deep.equal([MEDIA[0]]);
  });
});
