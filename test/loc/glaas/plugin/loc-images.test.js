import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { DA_ORIGIN } from '../../../../nx/public/utils/constants.js';
import { parseSelections, writeSelections } from '../../../../nx/blocks/loc/connectors/glaas/imageSelections.js';
import { parseVideoSelections, writeVideoSelections } from '../../../../nx/blocks/loc/connectors/glaas/videoSelections.js';
import '../../../../nx/blocks/loc/connectors/glaas/plugin/loc-images.js';

describe('GLaaS image and video selector', () => {
  const sourceHref = `${DA_ORIGIN}/source/test-org/test-site/some/page.html`;
  const videoSrc = 'https://video.tv.adobe.com/v/333754?autoplay=false';
  const imageSrc = 'https://content.da.live/test-org/test-site/a.png';
  let panel;

  async function mountPanel(html, { saveResponse, loadStatus = 200 } = {}) {
    const saved = [];
    const fetchStub = sinon.stub(window, 'fetch').callsFake(async (href, opts = {}) => {
      if (href === sourceHref) {
        if (opts.method === 'POST') {
          saved.push(await opts.body.get('data').text());
          return saveResponse ? saveResponse() : new Response('', { status: 200 });
        }
        return new Response(html, { status: loadStatus });
      }
      if (href === imageSrc) {
        return new Response('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>', {
          headers: { 'Content-Type': 'image/svg+xml' },
        });
      }
      throw new Error(`Unexpected request: ${href}`);
    });
    panel = document.createElement('nx-glaas-loc-images');
    panel.org = 'test-org';
    panel.site = 'test-site';
    panel.path = '/some/page';
    panel.token = 'test-token';
    const setup = sinon.spy(panel, 'setup');
    document.body.append(panel);
    await setup.firstCall.returnValue;
    await panel.updateComplete;
    return { fetchStub, saved };
  }

  afterEach(() => {
    panel?.remove();
    sinon.restore();
  });

  it('shows supported videos on a video-only page without metadata or player requests', async () => {
    const { fetchStub } = await mountPanel(
      `<body><main><a href="${videoSrc}">Video</a><a href="https://example.com/video">Other</a></main></body>`,
    );
    const rows = panel.shadowRoot.querySelectorAll('.video-list .row');
    expect(rows).to.have.length(1);
    expect(rows[0].querySelector('input').checked).to.be.false;
    const link = rows[0].querySelector('a');
    expect(link.getAttribute('href')).to.equal(videoSrc);
    expect(link.getAttribute('target')).to.equal('_blank');
    expect(link.getAttribute('rel')).to.include('noopener');
    expect(panel.shadowRoot.querySelectorAll('video, iframe')).to.have.length(0);
    expect(panel.shadowRoot.textContent).to.include('0 of 1 videos marked for caption translation.');
    expect(panel.shadowRoot.querySelector('.save-btn')).not.to.equal(null);
    expect(fetchStub.calledOnceWithExactly(sourceHref, sinon.match.object)).to.be.true;
  });

  it('restores and toggles image and video selections independently', async () => {
    const html = writeVideoSelections(
      writeSelections(
        `<body><main><img src="${imageSrc}" alt="Hero"><a href="${videoSrc}">Video</a></main></body>`,
        [{ src: imageSrc, translate: 'true' }],
      ),
      [{ src: videoSrc, translate: 'true' }],
    );
    await mountPanel(html);
    const image = panel.shadowRoot.querySelector('.image-list input');
    const video = panel.shadowRoot.querySelector('.video-list input');
    expect(image.checked).to.be.true;
    expect(video.checked).to.be.true;
    expect(image.getAttribute('aria-label')).to.equal('Translate image: Hero');
    expect(video.getAttribute('aria-label')).to.include('Translate video captions:');
    video.click();
    await panel.updateComplete;
    expect(video.checked).to.be.false;
    expect(image.checked).to.be.true;
    expect(panel.shadowRoot.textContent).to.include('0 of 1 videos marked for caption translation.');
  });

  it('saves checked videos through the existing Save button', async () => {
    const { saved, fetchStub } = await mountPanel(
      `<body><main><a href="${videoSrc}">Video</a></main></body>`,
    );
    panel.shadowRoot.querySelector('.video-list input').click();
    await panel.updateComplete;
    const save = sinon.spy(panel, 'handleSave');
    panel.requestUpdate();
    await panel.updateComplete;
    panel.shadowRoot.querySelector('.save-btn').click();
    await save.firstCall.returnValue;
    await panel.updateComplete;
    expect(saved).to.have.length(1);
    expect([...parseVideoSelections(saved[0])]).to.deep.equal([videoSrc]);
    expect([...parseSelections(saved[0])]).to.deep.equal([]);
    expect(panel.shadowRoot.textContent).to.include('Saved.');
    expect(panel._initialVideoRows).to.deep.equal([{ src: videoSrc, checked: true }]);
    expect(fetchStub.callCount).to.equal(3);
  });

  it('keeps the existing image selector usable on an image-only page', async () => {
    await mountPanel(`<body><main><img src="${imageSrc}" alt="Hero"></main></body>`);
    expect(panel.shadowRoot.querySelectorAll('.image-list .row')).to.have.length(1);
    expect(panel.shadowRoot.querySelectorAll('.video-list .row')).to.have.length(0);
    expect(panel.shadowRoot.querySelector('.image-list input').disabled).to.be.false;
    expect(panel.shadowRoot.textContent).to.include('0 of 0 videos marked for caption translation.');
  });

  it('updates the image count independently when its shared checkbox is toggled', async () => {
    await mountPanel(
      `<body><main><img src="${imageSrc}" alt="Hero"><a href="${videoSrc}">Video</a></main></body>`,
    );
    panel.shadowRoot.querySelector('.image-list input').click();
    await panel.updateComplete;
    expect(panel.shadowRoot.textContent).to.include('1 of 1 images already marked for translation.');
    expect(panel.shadowRoot.textContent).to.include('0 of 1 videos marked for caption translation.');
    expect(panel.shadowRoot.querySelector('.video-list input').checked).to.be.false;
  });

  it('keeps ineligible image checkboxes disabled before and after saving', async () => {
    await mountPanel(
      `<body><main><img src="/icon.svg"><a href="${videoSrc}">Video</a></main></body>`,
    );
    const image = panel.shadowRoot.querySelector('.image-list input');
    expect(image.disabled).to.be.true;
    expect(image.getAttribute('aria-label')).to.equal('Translate image: /icon.svg');
    await panel.handleSave();
    await panel.updateComplete;
    expect(image.disabled).to.be.true;
    expect(panel.shadowRoot.querySelector('.video-list input').disabled).to.be.false;
  });

  it('grays out images with invalid names and explains the GLaaS naming guidelines', async () => {
    await mountPanel(
      '<body><main><img src="https://main--site--org.aem.live/acrobat_family.jpg"></main></body>',
    );
    const row = panel.shadowRoot.querySelector('.image-list .row');
    expect(row.classList.contains('is-ineligible')).to.be.true;
    expect(row.querySelector('input').disabled).to.be.true;
    expect(row.querySelector('.row-note').textContent)
      .to.include('Image name does not adhere to GLaaS guidelines.');
    expect(row.querySelector('.row-note').textContent).to.include('no spaces, underscores');
  });

  it('disables both media selectors during a save', async () => {
    const response = {};
    const pending = new Promise((resolve) => { response.resolve = resolve; });
    await mountPanel(
      `<body><main><img src="${imageSrc}"><a href="${videoSrc}">Video</a></main></body>`,
      { saveResponse: () => pending },
    );
    const saving = panel.handleSave();
    await panel.updateComplete;
    expect(panel.shadowRoot.querySelector('.image-list input').disabled).to.be.true;
    expect(panel.shadowRoot.querySelector('.video-list input').disabled).to.be.true;
    expect(panel.shadowRoot.querySelector('.save-btn').disabled).to.be.true;
    response.resolve(new Response('', { status: 200 }));
    await saving;
    await panel.updateComplete;
    expect(panel.shadowRoot.querySelector('.image-list input').disabled).to.be.false;
    expect(panel.shadowRoot.querySelector('.video-list input').disabled).to.be.false;
  });

  [
    { name: 'HTTP failure', saveResponse: async () => new Response('', { status: 503 }) },
    { name: 'network failure', saveResponse: async () => { throw new TypeError('Failed to fetch'); } },
  ].forEach(({ name, saveResponse }) => {
    it(`shows a save error and re-enables controls after a ${name}`, async () => {
      await mountPanel(`<body><main><a href="${videoSrc}">Video</a></main></body>`, { saveResponse });
      panel.shadowRoot.querySelector('.video-list input').click();
      await panel.handleSave();
      await panel.updateComplete;
      expect(panel.shadowRoot.querySelector('.status-error').textContent)
        .to.equal('Could not save your selection.');
      expect(panel.shadowRoot.querySelector('.save-btn').disabled).to.be.false;
      expect(panel.shadowRoot.querySelector('.video-list input').disabled).to.be.false;
      expect(panel._initialVideoRows[0].checked).to.be.false;
    });
  });

  it('shows a load error rather than remaining on the loading screen', async () => {
    await mountPanel('', { loadStatus: 404 });
    expect(panel.shadowRoot.querySelector('.status-error').textContent)
      .to.equal('Could not load this page.');
    expect(panel.shadowRoot.textContent).not.to.include('Loading');
  });

  it('shows an empty state when there are no images or supported video links', async () => {
    await mountPanel('<body><main><p>No media</p></main></body>');
    expect(panel.shadowRoot.textContent).to.include('No images or supported videos found on this page.');
    expect(panel.shadowRoot.querySelector('.save-btn')).to.equal(null);
  });
});
