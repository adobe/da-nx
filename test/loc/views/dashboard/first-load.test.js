import { expect } from '@esm-bundle/chai';
import '../../../../nx/blocks/loc/views/dashboard/dashboard.js';

const Dashboard = customElements.get('nx-loc-dashboard');

describe('dashboard first load', () => {
  it('shows an error when the first load fails and loads again on the next try', async () => {
    const error = new TypeError('Failed to fetch');
    const attempts = [Promise.reject(error), Promise.resolve()];
    const ctx = { initializeProjectsAndUser: () => attempts.shift() };
    const first = await Dashboard.prototype.ensureInitialized.call(ctx)
      .then(() => undefined, (e) => e);
    expect(first).to.equal(error);
    expect(ctx._error).to.deep.equal({ message: 'Failed to fetch' });
    expect(ctx._isLoading).to.equal(false);
    await Dashboard.prototype.ensureInitialized.call(ctx);
    expect(attempts).to.deep.equal([]);
    expect(ctx._error).to.be.undefined;
  });

  it('loads again when a filter change cancels the first load', async () => {
    const applied = [];
    let loads = 0;
    const ctx = {
      abortCurrentAndGetNewController: Dashboard.prototype.abortCurrentAndGetNewController,
      ensureInitialized: Dashboard.prototype.ensureInitialized,
      updateShowRangeToFirstPage: () => {},
      updateProjectsToDisplay: async () => {},
      setErrorMessage: (text) => { ctx.errorText = text; },
      initializeProjectsAndUser() {
        loads += 1;
        this.abortCurrentAndGetNewController();
        const { signal } = this._dataAbortController;
        if (loads === 1) {
          return new Promise((resolve, reject) => {
            signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
          });
        }
        this._projectData = {
          applyFilters: async (filters, filterSignal) => {
            applied.push({ filters, aborted: filterSignal.aborted });
          },
        };
        return Promise.resolve();
      },
    };
    const firstLoad = Dashboard.prototype.ensureInitialized.call(ctx).catch((e) => e.name);
    await Dashboard.prototype.handleFilterChange.call(ctx, { status: 'done' });
    expect(await firstLoad).to.equal('AbortError');
    expect(loads).to.equal(2);
    expect(applied).to.deep.equal([{ filters: { status: 'done' }, aborted: false }]);
    expect(ctx.errorText).to.be.undefined;
  });
});
