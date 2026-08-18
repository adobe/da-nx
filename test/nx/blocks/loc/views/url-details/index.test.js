import { expect } from '@esm-bundle/chai';
import { DA_ADMIN } from '../../../../../../nx2/utils/utils.js';
import { getEditPath } from '../../../../../../nx/blocks/loc/views/url-details/index.js';

let counter = 0;
const uniq = (label) => {
  counter += 1;
  return `${label}${counter}`;
};

let origFetch;
let calls;

const installFetch = (org, site, {
  orgFlags = [], orgRows = [], siteFlags = [], siteRows = [],
} = {}) => {
  calls = [];
  origFetch = window.fetch;
  const orgUrl = `${DA_ADMIN}/config/${org}/`;
  const siteUrl = `${DA_ADMIN}/config/${org}/${site}/`;
  window.fetch = async (url) => {
    const u = url.toString();
    calls.push(u);
    if (u === siteUrl) {
      return { ok: true, json: async () => ({ data: siteRows, flags: { data: siteFlags } }) };
    }
    if (u === orgUrl) {
      return { ok: true, json: async () => ({ data: orgRows, flags: { data: orgFlags } }) };
    }
    return { ok: false, status: 404 };
  };
};

afterEach(() => {
  if (origFetch) window.fetch = origFetch;
  origFetch = null;
});

describe('getEditPath', () => {
  it('returns a sheet link for json paths without checking editor config', async () => {
    origFetch = window.fetch;
    window.fetch = async () => { throw new Error('fetch should not be called for json paths'); };

    const org = uniq('org');
    const site = uniq('site');
    const path = await getEditPath(`/${org}/${site}/data.json`);
    expect(path).to.equal(`https://da.live/sheet#/${org}/${site}/data`);
  });

  it('defaults to /edit# when EW is disabled and there is no editor.path config', async () => {
    const org = uniq('org');
    const site = uniq('site');
    installFetch(org, site);

    const path = await getEditPath(`/${org}/${site}/page`);
    expect(path).to.equal(`https://da.live/edit#/${org}/${site}/page`);
  });

  it('defaults to /canvas# when EW is enabled', async () => {
    const org = uniq('org');
    const site = uniq('site');
    installFetch(org, site, { siteFlags: [{ key: 'ew.enabled', value: 'true' }] });

    const path = await getEditPath(`/${org}/${site}/page`);
    expect(path).to.equal(`https://da.live/canvas#/${org}/${site}/page`);
  });

  it('uses a matching editor.path config over the default route', async () => {
    const org = uniq('org');
    const site = uniq('site');
    installFetch(org, site, {
      siteRows: [{ key: 'editor.path', value: `/${org}/${site}/blog=/custom-edit#` }],
    });

    const path = await getEditPath(`/${org}/${site}/blog/post`);
    expect(path).to.equal(`https://da.live/custom-edit#/${org}/${site}/blog/post`);
  });

  it('ignores a non-matching editor.path config and falls back to the default', async () => {
    const org = uniq('org');
    const site = uniq('site');
    installFetch(org, site, {
      siteRows: [{ key: 'editor.path', value: `/${org}/${site}/other=/custom-edit#` }],
    });

    const path = await getEditPath(`/${org}/${site}/blog/post`);
    expect(path).to.equal(`https://da.live/edit#/${org}/${site}/blog/post`);
  });

  it('picks the longest matching prefix when multiple editor.path configs match', async () => {
    const org = uniq('org');
    const site = uniq('site');
    installFetch(org, site, {
      siteRows: [
        { key: 'editor.path', value: `/${org}/${site}=/short-edit#` },
        { key: 'editor.path', value: `/${org}/${site}/blog=/long-edit#` },
      ],
    });

    const path = await getEditPath(`/${org}/${site}/blog/post`);
    expect(path).to.equal(`https://da.live/long-edit#/${org}/${site}/blog/post`);
  });

  it('org-level editor.path config applies when there is no site-level override', async () => {
    const org = uniq('org');
    const site = uniq('site');
    installFetch(org, site, {
      orgRows: [{ key: 'editor.path', value: `/${org}/${site}/blog=/org-edit#` }],
    });

    const path = await getEditPath(`/${org}/${site}/blog/post`);
    expect(path).to.equal(`https://da.live/org-edit#/${org}/${site}/blog/post`);
  });

  it('builds an experience.adobe.com link stripped of the org/site prefix', async () => {
    const org = uniq('org');
    const site = uniq('site');
    installFetch(org, site, {
      siteRows: [{
        key: 'editor.path',
        value: `/${org}/${site}/blog=https://experience.adobe.com/#/@myorg/app`,
      }],
    });

    const path = await getEditPath(`/${org}/${site}/blog/post`);
    expect(path).to.equal('https://experience.adobe.com/#/@myorg/app/blog/post');
  });

  it('appends index for paths ending in a trailing slash', async () => {
    const org = uniq('org');
    const site = uniq('site');
    installFetch(org, site);

    const path = await getEditPath(`/${org}/${site}/folder/`);
    expect(path).to.equal(`https://da.live/edit#/${org}/${site}/folder/index`);
  });
});
