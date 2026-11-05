import { expect } from '@esm-bundle/chai';
import { setConfig } from '../../../../../scripts/nx.js';

await setConfig({ hostnames: [] });
await import('../../../../../blocks/siteselector/siteselector.js');

describe('nx-siteselector', () => {
  let selector;
  const settle = async () => {
    await selector.updateComplete;
    const picker = selector.shadowRoot.querySelector('nx-picker');
    await picker?.updateComplete;
    return picker;
  };

  beforeEach(() => {
    selector = document.createElement('nx-siteselector');
    selector.sites = [];
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

  it('renders nothing and takes no space until there are sites to pick from', async () => {
    document.body.append(selector);
    for (const sites of [undefined, []]) {
      selector.sites = sites;
      expect(await settle()).to.be.null;
      expect(selector.hidden).to.be.true;
      expect(selector.shadowRoot.querySelector('button')).to.be.null;
      expect(selector.getBoundingClientRect().width).to.equal(0);
    }
    selector.sites = [
      { value: 'aemsites/devlive', label: 'devlive (aemsites)' },
      { value: 'exp-workspace/frescopaco', label: 'frescopaco (exp-workspace)' },
    ];
    selector.value = 'aemsites/devlive';
    selector.heading = 'Your recent sites';
    let picker = await settle();
    expect(selector.hidden).to.be.false;
    expect(picker.labelOverride).to.equal('devlive (aemsites)');
    expect(picker.items[0].section).to.equal('Your recent sites');
    expect(picker.items[1]).to.include({ label: 'Devlive', description: 'aemsites/devlive' });
    expect(picker.checkPosition).to.equal('start');
    expect(picker.size).to.equal('m');
    selector.size = 's';
    picker = await settle();
    expect(picker.size).to.equal('m');
    selector.sites = [];
    expect(await settle()).to.be.null;
    expect(selector.hidden).to.be.true;
  });

  it('capitalizes only the displayed site name without changing identifiers or descriptions', async () => {
    selector.sites = [
      { value: 'exp-workspace/frescopa', label: 'Frescopa, exp-workspace/frescopa' },
      { value: 'org/my-site_2', label: 'My-site_2, org/my-site_2' },
    ];
    selector.value = 'exp-workspace/frescopa';
    document.body.append(selector);
    const picker = await settle();
    expect(picker.items[1]).to.include({
      value: 'exp-workspace/frescopa', label: 'Frescopa', description: 'exp-workspace/frescopa',
    });
    expect(picker.items[2]).to.include({
      value: 'org/my-site_2', label: 'My-site_2', description: 'org/my-site_2',
    });
    expect(picker.value).to.equal('exp-workspace/frescopa');
    expect(picker.labelOverride).to.equal('Frescopa, exp-workspace/frescopa');
    expect(selector.sites[0].value).to.equal('exp-workspace/frescopa');
  });

  it('shows the heading until a site is selected and restores it when selection is cleared', async () => {
    selector.heading = 'Your recent sites';
    document.body.append(selector);
    selector.sites = [
      { value: 'org/site', label: '(org, site)' },
      { value: 'other/site', label: '(other, site)' },
    ];
    let picker = await settle();
    const trigger = () => picker.shadowRoot.querySelector('[part="label"]').textContent;
    expect(trigger()).to.equal('Your recent sites');
    expect(picker.value).to.equal('');
    expect(picker.shadowRoot.querySelector('[aria-selected="true"]')).to.be.null;
    selector.value = 'org/site';
    picker = await settle();
    expect(trigger()).to.equal('(org, site)');
    selector.value = '';
    picker = await settle();
    expect(trigger()).to.equal('Your recent sites');
    selector.sites = [];
    expect(await settle()).to.be.null;
  });

  it('emits selection and Add requests without owning navigation or changing current selection', async () => {
    selector.sites = [{ value: 'org/site', label: 'org/site' }];
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
    selector.sites = [{ value: 'org/site', label: 'org/site' }];
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
    selector.sites = [{ value: 'org/site', label: 'org/site' }];
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

  it('uses title typography for neutral and selected triggers in S, M and the default size', async () => {
    selector.heading = 'Your recent sites';
    selector.sites = [{ value: 'org/site', label: 'Site, org/site' }];
    selector.style.cssText = `
      --s2-font-family: adobe-clean, sans-serif;
      --s2-component-s-regular-font-size: 12px;
      --s2-component-s-regular-line-height: 16px;
      --s2-component-m-regular-font-size: 14px;
      --s2-component-m-regular-line-height: 18px;
      --s2-component-m-bold-font-size: 14px;
      --s2-component-m-bold-line-height: 18px;
      --s2-component-m-bold-font-weight: 700;
      --s2-component-l-bold-font-size: 16px;
      --s2-component-l-bold-line-height: 20px;
      --s2-component-l-bold-font-weight: 700;
      --s2-gray-800: light-dark(#292929, #dbdbdb);
    `;
    document.body.append(selector);
    for (const [scheme, color] of [['light', 'rgb(41, 41, 41)'], ['dark', 'rgb(219, 219, 219)']]) {
      selector.style.colorScheme = scheme;
      for (const [size, fontSize, lineHeight] of [
        ['s', '14px', '18px'], ['m', '16px', '20px'], [undefined, '16px', '20px'],
      ]) {
        selector.size = size;
        for (const value of ['', 'org/site']) {
          selector.value = value;
          const picker = await settle();
          const style = getComputedStyle(picker.shadowRoot.querySelector('[part="label"]'));
          expect(style.fontSize).to.equal(fontSize);
          expect(style.lineHeight).to.equal(lineHeight);
          expect(style.fontWeight).to.equal('700');
          expect(style.fontStyle).to.equal('normal');
          expect(style.letterSpacing).to.be.oneOf(['normal', '0px']);
          expect(style.fontFamily).to.equal('adobe-clean, sans-serif');
          expect(style.color).to.equal(color);
        }
      }
    }
  });

  it('sizes the pill to its content within its desktop minimum and maximum', async () => {
    selector.sites = [{ value: 'org/site', label: 'Site' }];
    selector.value = 'org/site';
    document.body.append(selector);
    await settle();
    expect(selector.getBoundingClientRect().width).to.equal(220);
    selector.sites = [{ value: 'org/site', label: 'A very long site name inside an organization with a very long name' }];
    const picker = await settle();
    expect(selector.getBoundingClientRect().width).to.equal(280);
    expect(picker.shadowRoot.querySelector('.picker-trigger').getBoundingClientRect().width).to.equal(280);
  });

  it('uses M bold sections and M medium menu labels independently of trigger size', async () => {
    selector.heading = 'Your recent sites';
    selector.sites = [{ value: 'org/site', label: 'Site, org/site' }];
    selector.style.cssText = `
      --s2-component-s-bold-font-size: 12px;
      --s2-component-s-medium-font-size: 12px;
      --s2-component-m-bold-font-size: 14px;
      --s2-component-m-bold-line-height: 18px;
      --s2-component-m-bold-font-weight: 700;
      --s2-component-m-medium-font-size: 14px;
      --s2-component-m-medium-line-height: 18px;
      --s2-component-m-medium-font-weight: 500;
    `;
    document.body.append(selector);
    for (const size of ['s', 'm', undefined]) {
      selector.size = size;
      const picker = await settle();
      const section = getComputedStyle(picker.shadowRoot.querySelector('.picker-section'));
      expect(section.fontSize).to.equal('14px');
      expect(section.lineHeight).to.equal('18px');
      expect(section.fontWeight).to.equal('700');
      for (const item of picker.shadowRoot.querySelectorAll('.picker-item')) {
        const style = getComputedStyle(item);
        expect(style.fontSize).to.equal('14px');
        expect(style.lineHeight).to.equal('18px');
        expect(style.fontWeight).to.equal('500');
      }
    }
  });

  it('uses S regular site paths and subdued theme colors independently of trigger size', async () => {
    selector.sites = [{ value: 'exp-workspace/frescopa', label: 'Frescopa, exp-workspace/frescopa' }];
    selector.style.cssText = `
      --s2-component-s-regular-font-size: 12px;
      --s2-component-s-regular-line-height: 16px;
      --s2-component-s-regular-font-weight: 400;
      --s2-component-m-regular-font-size: 14px;
      --s2-component-m-regular-line-height: 18px;
      --s2-component-m-regular-font-weight: 450;
      --s2-gray-700: light-dark(#505050, #afafaf);
    `;
    document.body.append(selector);
    for (const [scheme, color] of [['light', 'rgb(80, 80, 80)'], ['dark', 'rgb(175, 175, 175)']]) {
      selector.style.colorScheme = scheme;
      for (const size of ['s', 'm', undefined]) {
        selector.size = size;
        const picker = await settle();
        const description = picker.shadowRoot.querySelector('.picker-item-description');
        const style = getComputedStyle(description);
        expect(description.textContent).to.equal('exp-workspace/frescopa');
        expect(style.fontSize).to.equal('12px');
        expect(style.lineHeight).to.equal('16px');
        expect(style.fontWeight).to.equal('400');
        expect(style.color).to.equal(color);
      }
    }
  });

  it('keeps the outlined pill, bold trigger and medium menu labels in both sizes', async () => {
    selector.sites = [{ value: 'org/site', label: 'site (org)' }];
    selector.value = 'org/site';
    selector.style.cssText = `
      --s2-spacing-500: 40px;
      --s2-spacing-75: 6px;
      --s2-spacing-300: 24px;
      --s2-corner-radius-800: 24px;
      --s2-gray-25: #fafafa;
      --s2-gray-300: #ccc;
    `;
    document.body.append(selector);
    for (const [size, titleSize, bold] of [
      ['s', 'm', '650'], ['m', 'l', '660'],
    ]) {
      selector.size = size;
      selector.style.setProperty('--s2-component-s-regular-font-weight', '300');
      selector.style.setProperty('--s2-component-m-regular-font-weight', '350');
      selector.style.setProperty('--s2-component-m-medium-font-weight', '450');
      selector.style.setProperty(`--s2-component-${titleSize}-bold-font-weight`, bold);
      const picker = await settle();
      const trigger = getComputedStyle(picker.shadowRoot.querySelector('.picker-trigger'));
      expect(trigger.height).to.equal('40px');
      expect(trigger.borderWidth).to.equal('1px');
      expect(trigger.borderRadius).to.equal('24px');
      expect(trigger.backgroundColor).to.equal('rgb(250, 250, 250)');
      expect(getComputedStyle(picker.shadowRoot.querySelector('[part="label"]')).fontWeight).to.equal(bold);
      expect(picker.variant).to.equal('emphasized');
      expect(getComputedStyle(picker.shadowRoot.querySelector('.picker-item')).fontWeight).to.equal('450');
      expect(getComputedStyle(picker.shadowRoot.querySelector('.picker-item-description')).fontWeight).to.equal('300');
    }
  });
});
