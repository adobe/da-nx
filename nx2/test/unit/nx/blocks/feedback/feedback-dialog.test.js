import { expect } from '@esm-bundle/chai';
import { setConfig } from '../../../../../scripts/nx.js';
import { resetMockIms } from '../../../../mocks/ims.js';

// feedback-dialog.js pulls in picker.js, which reads getConfig() at import
// time, so setConfig() must resolve before feedback-dialog.js is ever
// imported — same pattern used in feedback.test.js and profile.test.js.
await setConfig({ hostnames: [] });
await import('../../../../../blocks/feedback/feedback-dialog.js');

async function createDialog() {
  const el = document.createElement('nx-feedback-dialog');
  el.label = 'Submit an idea';
  el.kind = 'idea';
  document.body.append(el);
  await el.updateComplete;
  return el;
}

function selectCategory(el, value) {
  const picker = el.shadowRoot.querySelector('nx-picker');
  picker.dispatchEvent(new CustomEvent('change', { detail: { value }, bubbles: true, composed: true }));
}

describe('nx-feedback-dialog checkbox auto-select', () => {
  afterEach(() => {
    resetMockIms();
    document.querySelectorAll('nx-feedback-dialog').forEach((el) => el.remove());
  });

  it('is unchecked by default (general category)', async () => {
    const el = await createDialog();
    const checkbox = el.shadowRoot.getElementById('feedback-include-chat');
    expect(checkbox.checked).to.be.false;
  });

  it('auto-checks the checkbox when the category is switched to AI Assistant', async () => {
    const el = await createDialog();
    selectCategory(el, 'assistant');
    await el.updateComplete;

    const checkbox = el.shadowRoot.getElementById('feedback-include-chat');
    expect(checkbox.checked).to.be.true;
  });

  it('does not uncheck the checkbox when switching away from AI Assistant', async () => {
    const el = await createDialog();
    selectCategory(el, 'assistant');
    await el.updateComplete;

    selectCategory(el, 'ui');
    await el.updateComplete;

    const checkbox = el.shadowRoot.getElementById('feedback-include-chat');
    expect(checkbox.checked).to.be.true;
  });

  it('does not re-check the checkbox if the user manually unchecked it while on AI Assistant', async () => {
    const el = await createDialog();
    selectCategory(el, 'assistant');
    await el.updateComplete;

    const checkbox = el.shadowRoot.getElementById('feedback-include-chat');
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change'));
    await el.updateComplete;

    expect(checkbox.checked).to.be.false;
  });
});
