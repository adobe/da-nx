import { expect } from '@esm-bundle/chai';
import '../../../../../blocks/ew-actions/ew-actions.js';

const create = () => document.createElement('nx-ew-actions');

describe('nx-ew-actions cache-bust', () => {
  afterEach(() => {
    document.querySelectorAll('nx-ew-actions').forEach((el) => el.remove());
  });

  it('memoizes the cache-bust import so preload and call site share one promise', () => {
    const el = create();
    const first = el._ensureCacheBust();
    const second = el._ensureCacheBust();
    expect(first).to.equal(second);
  });

  it('reuses an already-resolved cache-bust function without re-importing', async () => {
    const el = create();
    const sidekickCacheBust = () => {};
    el._cacheBust = Promise.resolve(sidekickCacheBust);
    const resolved = await el._ensureCacheBust();
    expect(resolved).to.equal(sidekickCacheBust);
  });

  it('resolves to null when the da-live sidekick module cannot be loaded', async () => {
    // In the test env there is no da-live origin serving /blocks/shared/sidekick.js,
    // so the dynamic import rejects and _ensureCacheBust must swallow it and yield
    // null — the preview/publish call site relies on `bustCache?.(url)` no-opping.
    const el = create();
    const resolved = await el._ensureCacheBust();
    expect(resolved).to.equal(null);
  });
});
