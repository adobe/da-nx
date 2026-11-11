import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';

describe('rollout plugin report', () => {
  let DaRollout;

  before(async () => {
    const localFetch = window.fetch;
    sinon.stub(window, 'fetch').callsFake((resource, opts) => (String(resource).startsWith('https://da.live/')
      ? Promise.resolve(new Response(''))
      : localFetch(resource, opts)));
    ({ default: DaRollout } = await import('../../../../../nx/public/plugins/rollout/rollout.js'));
    customElements.define('test-da-rollout', class extends DaRollout {
      async getRolloutInfo() {
        this._prefixes = this.prefixes;
      }
    });
  });

  after(() => {
    sinon.restore();
  });

  it('labels a destination left without a sync point', async () => {
    const el = document.createElement('test-da-rollout');
    el.prefixes = [{
      path: '/apac', active: true, status: 'success', outcome: 'no-sync-point',
    }];
    document.body.append(el);
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.skipped-count').textContent).to.equal('no sync point');
    el.remove();
  });
});
