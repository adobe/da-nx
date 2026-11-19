import { expect } from '@esm-bundle/chai';
import '../../../../nx/blocks/loc/views/basics/basics.js';
import { clearConfigCache } from '../../../../nx/blocks/loc/utils/utils.js';

// Dynamic-expression import so the import-map plugin does not rewrite it.
const imsPath = '../../../../nx2/utils/ims.js';
const { resetMockIms } = await import(imsPath);

const URL_INPUT = 'https://main--site1--acme.aem.page/path/doc';
const VALID_SHEETS = {
  languages: { data: [{ name: 'French', code: 'fr', location: '/fr', actions: 'translate' }] },
  config: { data: [{ key: 'translation.service.name', value: 'google' }] },
};
const INVALID_SHEETS = {
  languages: { data: [] },
  config: { data: [{ key: 'translation.service.name', value: 'google' }] },
};

let origFetch;

/**
 * Creates a basics element whose form returns the given values.
 * @param {{ title: string, urls: string }} values - Form field values.
 * @returns {HTMLElement} The element.
 */
function createBasicsEl({ title, urls }) {
  const form = document.createElement('form');
  Object.entries({ title, urls }).forEach(([name, value]) => {
    const input = document.createElement('input');
    input.name = name;
    input.value = value;
    form.append(input);
  });
  const el = document.createElement('nx-loc-basics');
  Object.defineProperty(el, 'form', { get: () => form });
  return el;
}

describe('NxLocBasics - getUpdates config gate', () => {
  beforeEach(() => {
    resetMockIms();
    clearConfigCache();
    origFetch = window.fetch;
  });

  afterEach(() => {
    window.fetch = origFetch;
    clearConfigCache();
  });

  it('returns the project data when the config is valid', async () => {
    window.fetch = async () => new Response(JSON.stringify(VALID_SHEETS), { status: 200 });
    const el = createBasicsEl({ title: 'my-project', urls: URL_INPUT });

    const result = await el.getUpdates('options');

    expect(result.data).to.include({ view: 'options', org: 'acme', site: 'site1', title: 'my-project' });
    expect(el._message).to.equal(undefined);
  });

  it('blocks with the config error when the config is invalid', async () => {
    window.fetch = async () => new Response(JSON.stringify(INVALID_SHEETS), { status: 200 });
    const el = createBasicsEl({ title: 'my-project', urls: URL_INPUT });

    const result = await el.getUpdates('options');

    expect(result).to.equal(null);
    expect(el._message.type).to.equal('error');
    expect(el._message.text).to.include('No languages are configured');
  });

  it('skips the config fetch when the form itself is invalid', async () => {
    let calls = 0;
    window.fetch = async () => {
      calls += 1;
      return new Response('{}', { status: 200 });
    };
    const el = createBasicsEl({ title: '', urls: URL_INPUT });

    const result = await el.getUpdates('options');

    expect(result).to.equal(null);
    expect(el._message.text).to.equal('Please enter a title');
    expect(calls).to.equal(0);
  });

  it('rereads the config on every call instead of using a stale cache', async () => {
    window.fetch = async () => new Response(JSON.stringify(INVALID_SHEETS), { status: 200 });
    const el = createBasicsEl({ title: 'my-project', urls: URL_INPUT });
    expect(await el.getUpdates('options')).to.equal(null);

    window.fetch = async () => new Response(JSON.stringify(VALID_SHEETS), { status: 200 });
    const result = await el.getUpdates('options');

    expect(result.data.org).to.equal('acme');
  });
});
