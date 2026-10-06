import { expect } from '@esm-bundle/chai';
import { getEditor } from '../../../nx2/utils/editor.js';

const sheet = (...values) => ({ data: values.map((value) => ({ key: 'editor.path', value })) });

describe('getEditor', () => {
  const org = sheet('/org=https://org-editor#');
  const site = sheet(
    '/org/site=https://site-editor#',
    '/org/site/forms=https://da.live/form#',
  );

  it('returns the editor of the longest matching prefix', () => {
    const configs = [org, site];
    expect(getEditor({ path: '/org/site/forms/contact.html', configs })).to.equal('https://da.live/form#');
    expect(getEditor({ path: '/org/site/blog/post.html', configs })).to.equal('https://site-editor#');
    expect(getEditor({ path: '/org/other/page.html', configs })).to.equal('https://org-editor#');
  });

  it('lets site rows win a prefix tie against org rows', () => {
    const configs = [sheet('/org/site=/edit#'), sheet('/org/site=/form#')];
    expect(getEditor({ path: '/org/site/a.html', configs })).to.equal('/form#');
  });

  it('reads the first sheet of multi-sheet configs', () => {
    const multi = {
      ':type': 'multi-sheet',
      ':names': ['data', 'flags'],
      data: sheet('/org/site=/form#'),
      flags: sheet('/org/site/a=/edit#'),
    };
    expect(getEditor({ path: '/org/site/a.html', configs: [null, multi] })).to.equal('/form#');
  });

  it('returns undefined when no rule matches or configs are missing or failed', () => {
    expect(getEditor({ path: '/other/site/a.html', configs: [org, site] })).to.be.undefined;
    expect(getEditor({ path: '/org/site/a.html' })).to.be.undefined;
    expect(getEditor({ path: '/org/site/a.html', configs: [null, { error: 'x', status: 404 }] })).to.be.undefined;
  });
});
