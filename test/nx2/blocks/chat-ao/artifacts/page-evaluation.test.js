import { expect } from '@esm-bundle/chai';
import { render } from 'da-lit';
import { renderUiArtifact } from '../../../../../nx2/blocks/chat-ao/artifacts/index.js';
import { buildSuggestionPrompt, pagePathFromUrl } from '../../../../../nx2/blocks/chat-ao/artifacts/page-evaluation.js';
import { PANEL_EVENT } from '../../../../../nx2/utils/panel.js';
import { installFetch, restoreFetch } from '../../../mocks/fetch.js';

async function waitUntil(predicate, timeout = 2000) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) throw new Error('waitUntil timed out');
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { setTimeout(resolve, 10); });
  }
}

const item = {
  title: 'Use feature module content pattern',
  description: 'Item description',
  suggestion: {
    label: 'Image',
    assetLabel: 'Image 3',
    previewUrl: 'https://example.com/media/image-3.jpg',
    issue: 'Missing eyebrow and CTA.',
    suggested: 'Add an all-caps eyebrow and a CTA link.',
    context: { category: 'Imagery Content', description: 'Missing eyebrow and CTA.' },
  },
};

describe('pagePathFromUrl', () => {
  [
    ['https://main--site--org.preview.da.live/products/foo', '/org/site/products/foo'],
    ['https://feat--site--org.stage-preview.da.live/a/b.html', '/org/site/a/b'],
    ['https://main--site--org.aem.page/', '/org/site/index'],
    ['https://main--site--org.aem.live/folder/', '/org/site/folder/index'],
  ].forEach(([url, expected]) => {
    it(`maps ${url} to ${expected}`, () => {
      expect(pagePathFromUrl(url)).to.equal(expected);
    });
  });

  ['https://example.com/foo', 'not a url', '', undefined].forEach((url) => {
    it(`returns undefined for ${JSON.stringify(url)}`, () => {
      expect(pagePathFromUrl(url)).to.be.undefined;
    });
  });
});

describe('page evaluation suggestion actions', () => {
  it('names the evaluated page when the url is known', () => {
    const text = buildSuggestionPrompt({ item, evaluatedUrl: 'https://main--site--org.aem.page/products/foo' });
    expect(text.split('\n')[0]).to.equal('Fix this failed preflight page evaluation check on the page /org/site/products/foo.');
  });

  it('falls back to the current page when the url cannot be mapped', () => {
    const text = buildSuggestionPrompt({ item, evaluatedUrl: 'https://example.com/foo' });
    expect(text.split('\n')[0]).to.equal('Fix this failed preflight page evaluation check on the current page.');
  });
  it('builds the prompt from the available fields', () => {
    expect(buildSuggestionPrompt({ item })).to.equal(
      'Fix this failed preflight page evaluation check on the current page.\n'
      + 'Check: Use feature module content pattern\n'
      + 'Category: Imagery Content\n'
      + '\n'
      + 'Reason: Missing eyebrow and CTA.\n'
      + '\n'
      + 'Suggestion: Add an all-caps eyebrow and a CTA link.\n'
      + '\n'
      + 'Reference: https://example.com/media/image-3.jpg\n'
      + 'Only make the changes needed to resolve this check; leave the rest of the page as is.\n'
      + 'If you need to re-run preflight (before or after for confirmation), you can invoke the skill /aem-governance-evaluate-page.',
    );
  });

  it('omits the reference when there is no preview url, ignoring the asset label', () => {
    const { previewUrl: _, ...suggestion } = item.suggestion;
    const text = buildSuggestionPrompt({ item: { ...item, suggestion } });
    expect(text).to.not.contain('Reference:');
  });

  it('skips missing fields and falls back to the item description as reason', () => {
    const text = buildSuggestionPrompt({
      item: { title: 'Tone', description: 'Too casual.', suggestion: { label: 'Text', suggested: 'Be formal.' } },
    });
    expect(text).to.equal(
      'Fix this failed preflight page evaluation check on the current page.\n'
      + 'Check: Tone\n'
      + '\n'
      + 'Reason: Too casual.\n'
      + '\n'
      + 'Suggestion: Be formal.\n'
      + '\n'
      + 'Only make the changes needed to resolve this check; leave the rest of the page as is.\n'
      + 'If you need to re-run preflight (before or after for confirmation), you can invoke the skill /aem-governance-evaluate-page.',
    );
  });

  describe('chat actions', () => {
    let host;
    let userEnabled;
    let orgCounter = 0;

    const withChat = ({ org = `pe-org-${orgCounter += 1}`, flags = {} } = {}) => {
      localStorage.setItem('nx2:ew-user-enabled', 'true');
      installFetch({
        body: JSON.stringify({
          flags: { data: Object.entries(flags).map(([key, value]) => ({ key, value })) },
        }),
      });
      window.location.hash = org ? `#/${org}/site/page` : '';
    };

    const openSuggestion = async ({ evaluatedUrl } = {}) => {
      host = document.createElement('div');
      document.body.append(host);
      render(renderUiArtifact({
        components: [{
          type: 'PageEvaluationWithIcons',
          props: {
            title: 'Eval',
            ...(evaluatedUrl && { evaluatedUrl }),
            sections: [{ label: 'Failures', tone: 'negative', defaultOpen: true, items: [item] }],
          },
        }],
      }), host);
      const card = host.querySelector('nx-page-eval');
      await card.updateComplete;
      card.shadowRoot.querySelector('.ui-artifact-pe-item-action').click();
      await waitUntil(() => card.shadowRoot.querySelector('.ui-artifact-pe-modal-copy'));
      return card;
    };

    beforeEach(() => { userEnabled = localStorage.getItem('nx2:ew-user-enabled'); });

    afterEach(() => {
      host?.remove();
      restoreFetch();
      window.location.hash = '';
      if (userEnabled === null) localStorage.removeItem('nx2:ew-user-enabled');
      else localStorage.setItem('nx2:ew-user-enabled', userEnabled);
    });

    [
      { selector: '.ui-artifact-pe-modal-add', autoSend: false },
      { selector: '.ui-artifact-pe-modal-apply', autoSend: true },
    ].forEach(({ selector, autoSend }) => {
      it(`opens the chat panel with the prompt and closes the dialog on ${selector}`, async () => {
        withChat();
        const card = await openSuggestion();
        await waitUntil(() => card.shadowRoot.querySelector(selector));

        const events = [];
        const listener = (e) => events.push(e.detail);
        document.addEventListener(PANEL_EVENT.OPEN, listener);
        card.shadowRoot.querySelector(selector).click();
        await waitUntil(() => events.length === 1 && !card.shadowRoot.querySelector('nx-dialog'));
        document.removeEventListener(PANEL_EVENT.OPEN, listener);

        expect(events).to.deep.equal([{
          section: 'chat',
          options: { text: buildSuggestionPrompt({ item }), autoSend },
        }]);
      });
    });

    it('sends a prompt naming the evaluated page when the data includes its url', async () => {
      withChat();
      const evaluatedUrl = 'https://main--site--org.preview.da.live/products/foo';
      const card = await openSuggestion({ evaluatedUrl });
      await waitUntil(() => card.shadowRoot.querySelector('.ui-artifact-pe-modal-apply'));

      const events = [];
      const listener = (e) => events.push(e.detail);
      document.addEventListener(PANEL_EVENT.OPEN, listener);
      card.shadowRoot.querySelector('.ui-artifact-pe-modal-apply').click();
      await waitUntil(() => events.length === 1);
      document.removeEventListener(PANEL_EVENT.OPEN, listener);

      expect(events[0].options.text).to.equal(buildSuggestionPrompt({ item, evaluatedUrl }));
      expect(events[0].options.text).to.contain('on the page /org/site/products/foo.');
    });

    [
      { name: 'chat is disabled for the site', opts: { flags: { 'ew.disableChat': 'true' } } },
      { name: 'there is no org in the hash', opts: { org: '' } },
    ].forEach(({ name, opts }) => {
      it(`hides chat actions but keeps copy when ${name}`, async () => {
        withChat(opts);
        const card = await openSuggestion();
        await new Promise((resolve) => { setTimeout(resolve, 50); });
        await card.updateComplete;
        const root = card.shadowRoot;
        expect(root.querySelector('.ui-artifact-pe-modal-copy')).to.exist;
        expect(root.querySelector('.ui-artifact-pe-modal-chat-actions')).to.not.exist;
      });
    });
  });
});
