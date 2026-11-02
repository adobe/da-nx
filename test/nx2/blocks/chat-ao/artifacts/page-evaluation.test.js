import { expect } from '@esm-bundle/chai';
import { render } from 'da-lit';
import { renderUiArtifact } from '../../../../../nx2/blocks/chat-ao/artifacts/index.js';
import { buildSuggestionPrompt } from '../../../../../nx2/blocks/chat-ao/artifacts/page-evaluation.js';
import { CHAT_EVENT } from '../../../../../nx2/utils/chat.js';

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

describe('page evaluation suggestion actions', () => {
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

  it('wires Add to chat and Apply change in the page evaluation dialog', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    render(renderUiArtifact({
      components: [{
        type: 'PageEvaluationWithIcons',
        props: { title: 'Eval', sections: [{ label: 'Failures', tone: 'negative', defaultOpen: true, items: [item] }] },
      }],
    }), host);
    const card = host.querySelector('nx-page-eval');
    await card.updateComplete;
    card.shadowRoot.querySelector('.ui-artifact-pe-item-action').click();
    await waitUntil(() => card.shadowRoot.querySelector('.ui-artifact-pe-modal-apply'));

    const events = [];
    const listener = (e) => events.push(e.detail);
    document.addEventListener(CHAT_EVENT.SET_PROMPT, listener);
    card.shadowRoot.querySelector('.ui-artifact-pe-modal-add').click();
    card.shadowRoot.querySelector('.ui-artifact-pe-modal-apply').click();
    await waitUntil(() => events.length === 2);
    document.removeEventListener(CHAT_EVENT.SET_PROMPT, listener);
    host.remove();

    const expected = buildSuggestionPrompt({ item });
    expect(events).to.deep.equal([
      { text: expected, autoSend: false },
      { text: expected, autoSend: true },
    ]);
  });
});
