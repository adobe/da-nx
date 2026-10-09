import { expect } from '@esm-bundle/chai';
import { HLX_ADMIN } from '../../../nx2/utils/utils.js';
import { getAemDetails } from '../../../nx/blocks/loc/views/url-details/index.js';
import {
  AEM_API, calls, installFetch, makeSite, restoreFetch,
} from './mock-fetch.js';

const STATUS = {
  preview: { lastModified: 'Thu, 08 Oct 2026 10:00:00 GMT' },
  live: {},
};

describe('loc url details', () => {
  beforeEach(() => installFetch(() => new Response(JSON.stringify(STATUS), { status: 200 })));
  afterEach(() => restoreFetch());

  it('reads the status from api.aem.live on Helix 6', async () => {
    const { org, site } = makeSite({ hlx6: true });
    const details = await getAemDetails(`/${org}/${site}/en/index`);
    expect(calls[0].url).to.equal(`${AEM_API}/${org}/sites/${site}/status/en/`);
    expect(details.publish).to.equal('Never');
    expect(details.preview).to.not.equal('Never');
  });

  it('keeps admin.hlx.page for legacy sites', async () => {
    const { org, site } = makeSite();
    await getAemDetails(`/${org}/${site}/en/page`);
    expect(calls[0].url).to.equal(`${HLX_ADMIN}/status/${org}/${site}/main/en/page`);
  });
});
