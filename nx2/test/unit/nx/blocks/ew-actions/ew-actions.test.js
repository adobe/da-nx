import { expect } from '@esm-bundle/chai';
import '../../../../../blocks/ew-actions/ew-actions.js';

const mount = async () => {
  const el = document.createElement('nx-ew-actions');
  document.body.append(el);
  await el.updateComplete;
  return el;
};

describe('nx-ew-actions deploy popover', () => {
  afterEach(() => {
    document.querySelectorAll('nx-ew-actions').forEach((el) => el.remove());
  });

  describe('_hasUnpublished (unpublished-changes badge)', () => {
    it('is false for a draft (nothing previewed)', async () => {
      const el = await mount();
      el._status = { preview: { status: 404 }, live: { status: 404 } };
      expect(el._hasUnpublished).to.equal(false);
    });

    it('is true when previewed but never published', async () => {
      const el = await mount();
      el._status = { preview: { status: 200 }, live: { status: 404 } };
      expect(el._hasUnpublished).to.equal(true);
    });

    it('is true when the preview is newer than the last publish', async () => {
      const el = await mount();
      el._status = {
        preview: { status: 200, lastModified: '2024-06-18T14:32:00Z' },
        live: { status: 200, lastModified: '2024-06-17T16:02:00Z' },
      };
      expect(el._hasUnpublished).to.equal(true);
    });

    it('is false when live is up to date with preview', async () => {
      const el = await mount();
      el._status = {
        preview: { status: 200, lastModified: '2024-06-17T16:02:00Z' },
        live: { status: 200, lastModified: '2024-06-17T16:02:00Z' },
      };
      expect(el._hasUnpublished).to.equal(false);
    });

    it('is false when there is no status yet', async () => {
      const el = await mount();
      el._status = undefined;
      expect(el._hasUnpublished).to.equal(false);
    });
  });

  describe('_env / info getters', () => {
    it('maps a 200 environment to ok + url + time', async () => {
      const el = await mount();
      el._status = {
        preview: { status: 200, url: 'https://preview.example/page', lastModified: '2024-06-18T14:32:00Z' },
        live: { status: 404 },
      };
      expect(el._previewInfo).to.deep.equal({
        ok: true,
        url: 'https://preview.example/page',
        time: '2024-06-18T14:32:00Z',
      });
      expect(el._liveInfo).to.deep.equal({ ok: false, url: null, time: null });
    });

    it('returns a not-ok shape when an environment is missing', async () => {
      const el = await mount();
      el._status = {};
      expect(el._previewInfo).to.deep.equal({ ok: false, url: null, time: null });
    });
  });

  describe('rendering', () => {
    it('renders the unpublished-changes badge only when there are changes', async () => {
      const el = await mount();
      el._status = { preview: { status: 200 }, live: { status: 404 } };
      await el.updateComplete;
      expect(el.shadowRoot.querySelector('.send-badge')).to.not.equal(null);

      el._status = {
        preview: { status: 200, lastModified: '2024-06-17T16:02:00Z' },
        live: { status: 200, lastModified: '2024-06-17T16:02:00Z' },
      };
      await el.updateComplete;
      expect(el.shadowRoot.querySelector('.send-badge')).to.equal(null);
    });

    it('selects the target via the native radio inputs', async () => {
      const el = await mount();
      const radios = el.shadowRoot.querySelectorAll('.deploy-card-radio');
      expect(radios.length).to.equal(2);
      expect([...radios].every((r) => r.type === 'radio')).to.equal(true);
      expect(el._target).to.equal('preview');

      const publishRadio = el.shadowRoot.querySelector('.deploy-card-live .deploy-card-radio');
      publishRadio.checked = true;
      publishRadio.dispatchEvent(new Event('change', { bubbles: true }));
      await el.updateComplete;
      expect(el._target).to.equal('live');
    });

    it('labels the primary action "Update" for preview and "Publish" for live', async () => {
      const el = await mount();
      const label = () => el.shadowRoot.querySelector('.deploy-action').textContent.trim();

      expect(el._target).to.equal('preview');
      expect(label()).to.equal('Update');

      el._selectTarget('live');
      await el.updateComplete;
      expect(el._target).to.equal('live');
      expect(label()).to.equal('Publish');
    });

    it('shows the copy control with the selected environment URL', async () => {
      const el = await mount();
      el._status = {
        preview: { status: 200, url: 'https://preview.example/page' },
        live: { status: 404 },
      };
      el._selectTarget('preview');
      await el.updateComplete;
      const card = el.shadowRoot.querySelector('.deploy-card-preview');
      expect(card.querySelector('.deploy-url-text').textContent).to.equal('https://preview.example/page');
      expect(card.querySelector('.deploy-copy')).to.not.equal(null);
    });

    it('hides the URL for a not-published (404) environment even if a url is returned', async () => {
      const el = await mount();
      el._status = {
        preview: { status: 404, url: 'https://preview.example/page' },
        live: { status: 404, url: 'https://live.example/page' },
      };
      el._selectTarget('live');
      await el.updateComplete;
      const card = el.shadowRoot.querySelector('.deploy-card-live');
      expect(card.querySelector('.deploy-url')).to.equal(null);
    });

    it('labels the live card "Publish" for end users', async () => {
      const el = await mount();
      const titles = [...el.shadowRoot.querySelectorAll('.deploy-card-title')]
        .map((n) => n.textContent.trim());
      expect(titles).to.deep.equal(['Preview', 'Publish']);
    });

    it('hides the Publish card, badge, and publish action when publishing is disabled', async () => {
      const el = await mount();
      // Would normally show the badge (previewed, never published).
      el._status = { preview: { status: 200 }, live: { status: 404 } };
      el._hidePublish = true;
      await el.updateComplete;
      const titles = [...el.shadowRoot.querySelectorAll('.deploy-card-title')]
        .map((n) => n.textContent.trim());
      expect(titles).to.deep.equal(['Preview']);
      expect(el.shadowRoot.querySelector('.deploy-card-live')).to.equal(null);
      expect(el.shadowRoot.querySelector('.send-badge')).to.equal(null);
      // Even if the target is forced to live, the action stays a preview "Update".
      el._selectTarget('live');
      await el.updateComplete;
      expect(el.shadowRoot.querySelector('.deploy-action').textContent.trim()).to.equal('Update');
    });
  });

  describe('_copyUrl', () => {
    let originalClipboard;

    beforeEach(() => {
      originalClipboard = navigator.clipboard;
    });

    afterEach(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: originalClipboard });
    });

    it('copies the url and flags which environment was copied', async () => {
      const copied = [];
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (text) => { copied.push(text); } },
      });
      const el = await mount();
      await el._copyUrl('https://live.example/page', 'live');
      expect(copied).to.deep.equal(['https://live.example/page']);
      expect(el._copied).to.equal('live');
    });

    it('is a no-op when there is no url', async () => {
      let called = false;
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async () => { called = true; } },
      });
      const el = await mount();
      await el._copyUrl(null, 'preview');
      expect(called).to.equal(false);
      expect(el._copied).to.equal(undefined);
    });
  });
});
