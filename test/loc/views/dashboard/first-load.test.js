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

  it('lets the first load finish when a filter changes during it', async () => {
    const applied = [];
    let loads = 0;
    let finishLoad;
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
        return new Promise((resolve, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
          finishLoad = () => {
            this._projectData = {
              applyFilters: async (filters, filterSignal) => {
                applied.push({ filters, aborted: filterSignal.aborted });
              },
            };
            resolve();
          };
        });
      },
    };
    const firstLoad = Dashboard.prototype.ensureInitialized.call(ctx).catch((e) => e.name);
    const filterChange = Dashboard.prototype.handleFilterChange.call(ctx, { status: 'done' });
    finishLoad();
    expect(await firstLoad).to.be.undefined;
    await filterChange;
    expect(loads).to.equal(1);
    expect(applied).to.deep.equal([{ filters: { status: 'done' }, aborted: false }]);
    expect(ctx.errorText).to.be.undefined;
  });
});
