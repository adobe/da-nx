import { expect } from '@esm-bundle/chai';
import { render } from 'da-lit';
import { renderUiArtifact } from '../../../../../nx2/blocks/chat-ao/artifacts/index.js';
import { buildSuggestionPrompt, sendSuggestionToChat } from '../../../../../nx2/blocks/chat-ao/artifacts/suggestion-prompt.js';
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
    issue: 'Missing eyebrow and CTA.',
    suggested: 'Add an all-caps eyebrow and a CTA link.',
    context: { category: 'Imagery Content', description: 'Missing eyebrow and CTA.' },
  },
};

describe('suggestion-prompt', () => {
  it('builds the prompt from the available fields', () => {
    expect(buildSuggestionPrompt({ item, aligned: false })).to.equal(
      'Apply the following suggestion from preflight for the check that failed to the page I have open.\n'
      + 'Check: Use feature module content pattern\n'
      + 'Alignment: No\n'
      + '\n\n'
      + 'Reason: Missing eyebrow and CTA.\n'
      + '\n\n'
      + 'Suggestion: Add an all-caps eyebrow and a CTA link.\n'
      + 'Asset: Image 3\n'
      + '\n\n'
      + 'Only change what this suggestion covers; leave the rest of the page unchanged.\n'
      + 'If you need to re-run preflight, you can invoke the skill /aem-governance-evaluate-page',
    );
  });

  it('skips missing fields and falls back to the item description as reason', () => {
    const text = buildSuggestionPrompt({
      item: { title: 'Tone', description: 'Too casual.', suggestion: { label: 'Text', suggested: 'Be formal.' } },
    });
    expect(text).to.equal(
      'Apply the following suggestion from preflight for the check that failed to the page I have open.\n'
      + 'Check: Tone\n'
      + '\n\n'
      + 'Reason: Too casual.\n'
      + '\n\n'
      + 'Suggestion: Be formal.\n'
      + '\n\n'
      + 'Only change what this suggestion covers; leave the rest of the page unchanged.\n'
      + 'If you need to re-run preflight, you can invoke the skill /aem-governance-evaluate-page',
    );
  });

  [false, true].forEach((autoSend) => {
    it(`dispatches SET_PROMPT with autoSend ${autoSend}`, async () => {
      let detail;
      const listener = (e) => { detail = e.detail; };
      document.addEventListener(CHAT_EVENT.SET_PROMPT, listener);
      await sendSuggestionToChat({ text: 'hello', autoSend });
      document.removeEventListener(CHAT_EVENT.SET_PROMPT, listener);
      expect(detail).to.deep.equal({ text: 'hello', autoSend });
    });
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

    const expected = buildSuggestionPrompt({ item, aligned: false });
    expect(events).to.deep.equal([
      { text: expected, autoSend: false },
      { text: expected, autoSend: true },
    ]);
  });
});
