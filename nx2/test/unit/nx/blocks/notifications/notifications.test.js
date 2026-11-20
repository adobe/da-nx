/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { setConfig } from '../../../../../scripts/nx.js';
import { setMockIms, resetMockIms } from '../../../../mocks/ims.js';

await setConfig({ hostnames: [] });
const { actionLabel } = await import('../../../../../blocks/notifications/notifications.js');

const ITEMS = [
  {
    id: 'a', type: 'comment-mention', org: 'o', site: 's', path: '/o/s/page', title: 'Page', link: '#a', actor: { name: 'Ann' }, description: 'Look', read: false, updatedAt: 1,
  },
  {
    id: 'b', type: 'comment-reply', org: 'o', site: 's', path: '/o/s/other', link: '#b', actor: { email: 'bo@x.com' }, read: true, updatedAt: 2,
  },
];

async function mount(items) {
  const el = document.createElement('nx-notifications');
  document.body.append(el);
  el._items = items;
  await el.updateComplete;
  return el;
}

describe('nx-notifications', () => {
  afterEach(() => {
    resetMockIms();
    document.querySelectorAll('nx-notifications').forEach((el) => el.remove());
  });

  it('labels producer and comment actions', () => {
    expect(actionLabel({ type: 'comment-mention' })).to.equal('mentioned you on');
    expect(actionLabel({ type: 'x', action: 'requested publish of' })).to.equal('requested publish of');
    expect(actionLabel({ type: 'x' })).to.equal('updated');
  });

  it('renders rows and the unread count', async () => {
    const el = await mount(ITEMS);
    const root = el.shadowRoot;
    expect(root.querySelector('.count-chip').textContent).to.equal('1');
    expect(root.querySelector('button.trigger').getAttribute('aria-label')).to.equal('Notifications, 1 unread');
    const rows = root.querySelectorAll('.item');
    expect(rows).to.have.length(2);
    expect(rows[0].classList.contains('unread')).to.be.true;
    expect(rows[0].querySelector('.summary').textContent).to.include('Ann').and.include('mentioned you on').and.include('Page');
    expect(rows[0].querySelector('.meta').textContent).to.include('o/s');
    expect(rows[0].querySelector('.item-link').target).to.equal('_blank');
    expect(rows[1].querySelector('.summary').textContent).to.include('bo@x.com').and.include('/o/s/other');
  });

  it('marks a row read on click and removes it on dismiss', async () => {
    const el = await mount(ITEMS);
    const link = el.shadowRoot.querySelector('.item-link');
    link.addEventListener('click', (e) => e.preventDefault());
    link.click();
    await el.updateComplete;
    expect(el._items[0].read).to.be.true;
    expect(el.shadowRoot.querySelector('.count-chip')).to.be.null;
    el.shadowRoot.querySelector('.item button').click();
    await el.updateComplete;
    expect(el.shadowRoot.querySelectorAll('.item')).to.have.length(1);
  });

  it('renders error and empty states', async () => {
    const el = await mount(null);
    expect(el.shadowRoot.querySelector('.empty').textContent).to.include("couldn't load");
    el._items = [];
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.empty').textContent).to.include('caught up');
  });

  it('opens and closes the shared popover from the bell', async () => {
    const el = await mount(ITEMS);
    const trigger = el.shadowRoot.querySelector('button.trigger');
    const popover = el.shadowRoot.querySelector('nx-popover');
    trigger.click();
    await popover.updateComplete;
    expect(popover.open).to.be.true;
    expect(popover.anchor).to.equal(trigger);
    trigger.click();
    await popover.updateComplete;
    expect(popover.open).to.be.false;
  });

  it('stays hidden when signed out', async () => {
    setMockIms({ anonymous: true });
    const el = document.createElement('nx-notifications');
    document.body.append(el);
    await new Promise((r) => { setTimeout(r, 20); });
    expect(el.hidden).to.be.true;
  });
});
