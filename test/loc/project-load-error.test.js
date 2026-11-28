import { expect } from '@esm-bundle/chai';
import '../../nx/blocks/loc/loc.js';

describe('loc project load', () => {
  it('shows an error when opening a project fails', async () => {
    const originalFetch = window.fetch;
    const el = document.createElement('nx-loc');
    el.org = 'org';
    el.site = 'site';
    el.path = '/.da/translation/active/1';
    window.fetch = async () => { throw new TypeError('Failed to fetch'); };
    try {
      document.body.append(el);
      await el.getProject();
      await el.updateComplete;
      expect(el.shadowRoot.querySelector('[role="alert"]')?.textContent).to.equal('Could not open the translation project. Failed to fetch');
    } finally {
      el.remove();
      window.fetch = originalFetch;
    }
  });
});
