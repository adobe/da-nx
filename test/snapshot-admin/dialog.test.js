import { expect } from '@esm-bundle/chai';
import { setConfig } from '../../nx2/scripts/nx.js';

await setConfig({ hostnames: [] });
await import('../../nx/blocks/snapshot-admin/views/dialog.js');

describe('nx-snapshot-dialog', () => {
  let el;
  let events;

  beforeEach(async () => {
    events = [];
    el = document.createElement('nx-snapshot-dialog');
    el.addEventListener('action', (e) => events.push(e.detail));
    document.body.append(el);
    el.details = {
      heading: 'Delete Snapshot',
      message: 'Are you sure?',
      open: true,
      actions: [
        { label: 'Cancel', value: 'cancel', variant: 'primary' },
        { label: 'Delete', value: 'delete', variant: 'negative' },
      ],
    };
    await el.updateComplete;
  });

  afterEach(() => el.remove());

  const dialog = () => el.shadowRoot.querySelector('nx-dialog');

  it('renders the shared dialog with the heading and actions', () => {
    expect(dialog().getAttribute('title')).to.equal('Delete Snapshot');
    const labels = [...el.shadowRoot.querySelectorAll('button[slot="actions"]')].map((b) => b.textContent);
    expect(labels).to.deep.equal(['Cancel', 'Delete']);
  });

  it('dispatches the action value once and closes', async () => {
    el.shadowRoot.querySelectorAll('button[slot="actions"]')[1].click();
    await el.updateComplete;
    expect(events).to.deep.equal(['delete']);
    expect(dialog()).to.be.null;
  });

  it('dispatches a null action when dismissed', async () => {
    await dialog().updateComplete;
    dialog().close();
    await el.updateComplete;
    expect(events).to.deep.equal([null]);
    expect(dialog()).to.be.null;
  });
});
