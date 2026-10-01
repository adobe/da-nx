import { expect } from '@esm-bundle/chai';
import {
  getStructuredContentEditorUrl,
  getStructuredContentDeliveryUrl,
  isStructuredContent,
} from '../../../nx2/utils/structuredContent.js';

const FORM_EDITOR = 'https://da.live/form#';
const sheet = (...values) => ({ data: values.map((value) => ({ key: 'editor.path', value })) });

describe('isStructuredContent', () => {
  const org = sheet('/org=https://org-editor#');
  const site = sheet(
    `/org/site/forms=${FORM_EDITOR}`,
    '/org/site/products=/form#',
    '/org/site/blog=/edit#',
  );
  const configs = [org, site];

  it('is true for pages under a prefix that points at the form editor', () => {
    expect(isStructuredContent({ path: '/org/site/forms/contact.html', configs })).to.be.true;
    expect(isStructuredContent({ path: '/org/site/products/sub/shoe', configs })).to.be.true;
  });

  it('is false for pages only matched by other editors', () => {
    expect(isStructuredContent({ path: '/org/site/blog/post.html', configs })).to.be.false;
    expect(isStructuredContent({ path: '/org/site/about.html', configs })).to.be.false;
  });

  it('reads the first sheet of multi-sheet configs', () => {
    const multi = {
      ':type': 'multi-sheet',
      ':names': ['data', 'flags'],
      data: sheet(`/org/site=${FORM_EDITOR}`),
      flags: sheet('/org/site=/edit#'),
    };
    expect(isStructuredContent({ path: '/org/site/a.html', configs: [null, multi] })).to.be.true;
  });

  it('is false for non-pages and missing, failed or malformed configs', () => {
    expect(isStructuredContent({ path: '/org/site/forms/data.json', configs })).to.be.false;
    expect(isStructuredContent({ path: '/org/site/forms/contact.html' })).to.be.false;
    expect(isStructuredContent({ path: '/org/site/a.html', configs: [null, { error: 'x', status: 404 }] })).to.be.false;
    expect(isStructuredContent({ path: '/org/site/a.html', configs: [sheet('malformed', '=/form#', '/org/site=http://')] })).to.be.false;
  });
});

describe('structured content urls', () => {
  it('builds the form editor and da-sc delivery urls without .html', () => {
    expect(getStructuredContentEditorUrl('/org/site/forms/contact.html')).to.equal('/form#/org/site/forms/contact');
    expect(getStructuredContentDeliveryUrl({ path: '/org/site/forms/contact.html' }))
      .to.equal('https://da-sc.adobeaem.workers.dev/preview/org/site/forms/contact');
    expect(getStructuredContentDeliveryUrl({ path: '/org/site/forms/contact', tier: 'publish' }))
      .to.equal('https://da-sc.adobeaem.workers.dev/publish/org/site/forms/contact');
  });
});
