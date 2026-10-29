import { expect } from '@esm-bundle/chai';
import { setConfig } from '../../../../../scripts/nx.js';

await setConfig({ hostnames: [] });
await import('../../../../../blocks/siteselector/siteselector.js');

describe('nx-siteselector', () => {
  let selector;
  const settle = async () => {
    await selector.updateComplete;
    const picker = selector.shadowRoot.querySelector('nx-picker');
    await picker.updateComplete;
    return picker;
  };

  beforeEach(() => {
    selector = document.createElement('nx-siteselector');
  });

  afterEach(() => selector.remove());

  it('announces each connection across shadow DOM and aborts its old connection on removal', async () => {
    const host = document.createElement('div');
    host.attachShadow({ mode: 'open' });
    document.body.append(host);
    const ready = [];
    const listener = ({ detail }) => ready.push(detail);
    document.addEventListener('site-selector-ready', listener);
    try {
      host.shadowRoot.append(selector);
      await settle();
      expect(ready).to.have.length(1);
      expect(ready[0].selector).to.equal(selector);
      selector.remove();
      expect(ready[0].signal.aborted).to.be.true;
      host.shadowRoot.append(selector);
      expect(ready).to.have.length(2);
      expect(ready[1].signal.aborted).to.be.false;
    } finally {
      document.removeEventListener('site-selector-ready', listener);
      selector.remove();
      host.remove();
    }
  });

  it('renders current site, shared descriptions, heading and Add with no remembered sites', async () => {
    selector.sites = [];
    document.body.append(selector);
    let picker = await settle();
    expect(picker.placeholder).to.equal('Choose a site');
    expect(picker.items.at(-1)).to.include({ value: 'add-site', action: true });
    selector.sites = [
      { value: 'aemsites/devlive', label: 'devlive (aemsites)' },
      { value: 'exp-workspace/frescopaco', label: 'frescopaco (exp-workspace)' },
    ];
    selector.value = 'aemsites/devlive';
    selector.heading = 'Your recent sites';
    picker = await settle();
    expect(picker.labelOverride).to.equal('devlive (aemsites)');
    expect(picker.items[0].section).to.equal('Your recent sites');
    expect(picker.items[1]).to.include({ label: 'devlive', description: 'aemsites/devlive' });
    expect(picker.checkPosition).to.equal('start');
    expect(picker.size).to.equal('m');
    selector.size = 's';
    picker = await settle();
    expect(picker.size).to.equal('s');
  });

  it('does not accept input before the host attaches its adapter', async () => {
    document.body.append(selector);
    let picker = await settle();
    expect(picker.inert).to.be.true;
    expect(picker.placeholder).to.equal('Loading sites...');
    selector.sites = [];
    picker = await settle();
    expect(picker.inert).to.be.false;
    expect(picker.placeholder).to.equal('Choose a site');
  });

  it('emits selection and Add requests without owning navigation or changing current selection', async () => {
    document.body.append(selector);
    const picker = await settle();
    const events = [];
    selector.addEventListener('site-select', ({ detail }) => events.push(detail.value));
    selector.addEventListener('site-add', () => events.push('add'));
    picker.dispatchEvent(new CustomEvent('change', { detail: { value: 'org/site' }, bubbles: true }));
    picker.dispatchEvent(new CustomEvent('change', { detail: { value: 'add-site' }, bubbles: true }));
    expect(events).to.deep.equal(['org/site', 'add']);
    expect(selector.value).to.be.undefined;
  });

  it('shows host errors and delegates focus to its trigger', async () => {
    selector.sites = [];
    selector.error = 'Could not load sites.';
    document.body.append(selector);
    const picker = await settle();
    expect(selector.shadowRoot.querySelector('[role="alert"]').textContent).to.include(selector.error);
    let retries = 0;
    selector.addEventListener('site-retry', () => { retries += 1; });
    selector.shadowRoot.querySelector('button').click();
    expect(retries).to.equal(1);
    selector.focus();
    expect(picker.shadowRoot.activeElement).to.equal(picker.shadowRoot.querySelector('button'));
    selector.error = undefined;
    await settle();
    expect(selector.shadowRoot.querySelector('[role="alert"]')).to.be.null;
  });

  it('uses matching component typography for error and retry text in S and M', async () => {
    selector.error = 'Could not load sites.';
    document.body.append(selector);
    for (const size of ['s', 'm']) {
      selector.size = size;
      selector.style.setProperty(`--s2-component-${size}-regular-font-size`, '13px');
      selector.style.setProperty(`--s2-component-${size}-regular-line-height`, '21px');
      selector.style.setProperty(`--s2-component-${size}-regular-font-weight`, '350');
      await settle();
      for (const element of selector.shadowRoot.querySelectorAll('p, button')) {
        const style = getComputedStyle(element);
        expect(style.fontSize).to.equal('13px');
        expect(style.lineHeight).to.equal('21px');
        expect(style.fontWeight).to.equal('350');
      }
    }
  });
});
