import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setConfig } from '../../../../../scripts/nx.js';

await setConfig({ hostnames: [] });
await import('../../../../../blocks/siteselector/siteselector.js');

describe('nx-siteselector presentation', () => {
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
    sinon.stub(selector, 'refresh').resolves();
  });

  afterEach(() => {
    selector.remove();
    sinon.restore();
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

  it('renders errors and focuses the picker trigger', async () => {
    selector.sites = [{ value: 'org/site', label: 'org/site' }];
    selector.error = 'Could not load sites.';
    document.body.append(selector);
    const picker = await settle();
    expect(selector.shadowRoot.querySelector('[role="alert"]').textContent).to.include(selector.error);
    selector.focus();
    expect(picker.shadowRoot.activeElement).to.equal(picker.shadowRoot.querySelector('button'));
    selector.error = undefined;
    await settle();
    expect(selector.shadowRoot.querySelector('[role="alert"]')).to.be.null;
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
    picker.show();
    const menu = picker.shadowRoot.querySelector('nx-popover');
    await menu.updateComplete;
    expect(menu.getBoundingClientRect().width).to.equal(240);
    expect(selector.getBoundingClientRect().width).to.equal(280);
    picker.close();
  });
});
