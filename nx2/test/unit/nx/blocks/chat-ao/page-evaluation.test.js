/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { setUISize } from '../../../../../utils/ui-size.js';
import '../../../../../blocks/chat-ao/artifacts/page-evaluation.js';

await new Promise((resolve) => {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/nx2/styles/styles.css';
  link.onload = resolve;
  document.head.append(link);
});

const items = Array.from({ length: 6 }, (_, index) => ({
  title: `Check ${index + 1}`,
  description: `Description ${index + 1}`,
  suggestion: {
    label: `Suggestion ${index + 1}`,
    issue: `Issue ${index + 1}`,
    suggested: `Change ${index + 1}`,
    context: { category: 'Content', description: 'Supporting context.' },
  },
}));

describe('nx-page-eval UI size', () => {
  let element;
  let savedSize;

  beforeEach(async () => {
    savedSize = localStorage.getItem('ui-size');
    setUISize({ size: 's' });
    element = document.createElement('nx-page-eval');
    element.data = {
      title: 'Preflight',
      summary: [{ label: 'Failures', value: '6', description: 'Needs attention' }],
      sections: [{ label: 'Failures', tone: 'negative', defaultOpen: true, items }],
    };
    document.body.append(element);
    await element.updateComplete;
  });

  afterEach(() => {
    element.remove();
    setUISize({ size: savedSize === 'm' ? 'm' : 's' });
    if (savedSize === null) localStorage.removeItem('ui-size');
    else localStorage.setItem('ui-size', savedSize);
  });

  it('scales shared row and paging buttons while retaining the selected page', async () => {
    const root = element.shadowRoot;
    const action = root.querySelector('.ui-artifact-pe-item-action');
    const next = root.querySelector('.ui-artifact-pe-paging-next');
    expect(getComputedStyle(action).height).to.equal('24px');
    expect(getComputedStyle(next).height).to.equal('24px');
    next.click();
    await element.updateComplete;
    expect(root.querySelector('.ui-artifact-pe-paging-label').textContent).to.equal('6 of 6 checks');

    setUISize({ size: 'm' });
    await element.updateComplete;
    expect(getComputedStyle(action).height).to.equal('32px');
    expect(getComputedStyle(next).height).to.equal('32px');
    expect(getComputedStyle(action).fontSize).to.equal('14px');
    expect(getComputedStyle(root.querySelector('.ui-artifact-pe-item-title')).fontSize).to.equal('16px');
    expect(getComputedStyle(root.querySelector('.ui-artifact-pe-item-desc')).fontSize).to.equal('14px');
    expect(root.querySelector('.ui-artifact-pe-paging-label').textContent).to.equal('6 of 6 checks');
    expect(next.disabled).to.be.true;
    expect(getComputedStyle(next, '::after').width).to.equal('16px');

    setUISize({ size: 's' });
    await element.updateComplete;
    expect(getComputedStyle(action).height).to.equal('24px');
    expect(getComputedStyle(next).height).to.equal('24px');
    expect(getComputedStyle(next, '::after').width).to.equal('14px');
  });

  it('scales an open suggestion dialog and keeps its current suggestion', async () => {
    await element._openModal(items[0], items, 'negative', 'Preflight');
    await element.updateComplete;
    const root = element.shadowRoot;
    const dialog = root.querySelector('nx-dialog');
    await dialog.updateComplete;
    const next = root.querySelector('.ui-artifact-pe-modal-paging-next');
    const copy = root.querySelector('.ui-artifact-pe-modal-copy');
    expect(getComputedStyle(next).height).to.equal('32px');
    expect(getComputedStyle(copy).height).to.equal('32px');
    next.click();
    await element.updateComplete;
    expect(root.querySelector('.ui-artifact-pe-modal-asset-label').textContent).to.equal('Suggestion 2');

    setUISize({ size: 'm' });
    await element.updateComplete;
    await dialog.updateComplete;
    expect(root.querySelector('nx-dialog')).to.equal(dialog);
    expect(dialog.shadowRoot.querySelector('dialog').open).to.be.true;
    expect(root.querySelector('.ui-artifact-pe-modal-asset-label').textContent).to.equal('Suggestion 2');
    expect(getComputedStyle(next).height).to.equal('40px');
    expect(getComputedStyle(next).width).to.equal('40px');
    expect(getComputedStyle(copy).height).to.equal('40px');
    expect(getComputedStyle(copy).fontSize).to.equal('16px');
    expect(getComputedStyle(root.querySelector('.ui-artifact-pe-modal-body')).lineHeight).to.equal('24px');
    expect(getComputedStyle(root.querySelector('.ui-artifact-pe-modal-context-desc')).lineHeight).to.equal('24px');
    expect(getComputedStyle(dialog.shadowRoot.querySelector('.title')).fontSize).to.equal('20px');

    setUISize({ size: 's' });
    await element.updateComplete;
    expect(getComputedStyle(next).height).to.equal('32px');
    expect(getComputedStyle(copy).height).to.equal('32px');
    expect(root.querySelector('.ui-artifact-pe-modal-asset-label').textContent).to.equal('Suggestion 2');
  });
});
