import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setConfig } from '../../../../nx2/scripts/nx.js';
import { HLX_ADMIN } from '../../../../nx2/utils/utils.js';
import { calls, restoreFetch } from '../../../../nx2/test/mocks/fetch.js';

// Dynamic-expression import (not a literal string) so @web/dev-server-import-maps does not
// rewrite this to ...?wds-import-map=0 — see test/nx2/utils/api.test.js for the same note.
// The same mock URL is reached at runtime via the inline importmap when api.js's dynamic IIFE
// imports ims.js, so both this test and ew-actions.js receive the *same* mock module instance.
const imsPath = '../../../../nx2/utils/ims.js';
const { resetMockIms } = await import(imsPath);

await setConfig({ hostnames: [] });
await import('../../../../nx2/blocks/ew-actions/ew-actions.js');

const DA_SC_URL = 'https://da-sc.adobeaem.workers.dev/preview/org/site/schemas/modals/lightbox-config';
const EXCHANGE_URL = `${HLX_ADMIN}/auth/adobe/exchange`;

// Dialog/sl-component CSS is lazy-loaded (via nx-dialog import chain) as a side effect of
// opening the preview dialog; only the two explicit URLs below matter to these tests, so
// anything else (static assets) gets a generic 200 rather than failing the test.
function mockFetch(responses) {
  calls.length = 0;
  window.fetch = async (url, opts = {}) => {
    const u = url.toString();
    calls.push({ url: u, method: opts.method || 'GET', headers: opts.headers || {} });
    const entry = responses[u];
    if (!entry) return new Response('', { status: 200 });
    return new Response(JSON.stringify(entry.body ?? {}), { status: entry.status ?? 200 });
  };
}

async function createEl(hashState) {
  const el = document.createElement('nx-ew-actions');
  document.body.append(el);
  await el.updateComplete;
  el._hashState = hashState;
  return el;
}

describe('nx-ew-actions structured-content preview', () => {
  let counter = 0;
  const uniqSite = () => {
    counter += 1;
    return { org: `org-${counter}`, site: `site-${counter}` };
  };

  beforeEach(() => {
    resetMockIms();
  });

  afterEach(() => {
    restoreFetch();
    document.querySelectorAll('nx-ew-actions').forEach((el) => el.remove());
  });

  it('fetches with the exchanged site token (token field) and skips window.open', async () => {
    mockFetch({
      [EXCHANGE_URL]: { body: { token: 'secret-abc' } },
      [DA_SC_URL]: { body: { metadata: {}, data: { foo: 'bar' } } },
    });
    const openStub = sinon.stub(window, 'open');

    const el = await createEl(uniqSite());
    await el._openStructuredContentPreview(DA_SC_URL, 'preview');

    const scCall = calls.find((c) => c.url === DA_SC_URL);
    expect(scCall.headers.Authorization).to.equal('token secret-abc');
    expect(openStub.called).to.be.false;
    expect(el._scPreview.json).to.deep.equal({ metadata: {}, data: { foo: 'bar' } });
    expect(el._scPreview.error).to.be.undefined;

    openStub.restore();
  });

  it('falls back to the siteToken field when present', async () => {
    mockFetch({
      [EXCHANGE_URL]: { body: { siteToken: 'secret-xyz' } },
      [DA_SC_URL]: { body: { data: {} } },
    });

    const el = await createEl(uniqSite());
    await el._openStructuredContentPreview(DA_SC_URL, 'preview');

    const scCall = calls.find((c) => c.url === DA_SC_URL);
    expect(scCall.headers.Authorization).to.equal('token secret-xyz');
  });

  it('shows an error and never fetches da-sc when no site token is available', async () => {
    mockFetch({
      [EXCHANGE_URL]: { body: {} },
    });

    const el = await createEl(uniqSite());
    await el._openStructuredContentPreview(DA_SC_URL, 'preview');

    expect(calls.find((c) => c.url === DA_SC_URL)).to.be.undefined;
    expect(el._scPreview.json).to.be.undefined;
    expect(el._scPreview.error?.message).to.be.a('string');
  });

  it('shows the response status in the error state on a non-2xx da-sc response, keeping the url', async () => {
    mockFetch({
      [EXCHANGE_URL]: { body: { token: 'secret-401' } },
      [DA_SC_URL]: { body: {}, status: 401 },
    });

    const el = await createEl(uniqSite());
    await el._openStructuredContentPreview(DA_SC_URL, 'preview');

    expect(el._scPreview.error?.status).to.equal(401);
    expect(el._scPreview.url).to.equal(DA_SC_URL);
  });

  it('copies the preview url to the clipboard', async () => {
    const writeText = sinon.stub().resolves();
    sinon.stub(navigator, 'clipboard').value({ writeText });

    const el = await createEl(uniqSite());
    el._scPreview = { action: 'preview', url: DA_SC_URL, json: {} };
    await el._copyScPreviewUrl();

    expect(writeText.calledWith(DA_SC_URL)).to.be.true;
    expect(el._scCopyDone).to.be.true;

    sinon.restore();
  });
});
