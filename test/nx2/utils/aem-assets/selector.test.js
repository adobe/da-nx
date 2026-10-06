import { expect } from '@esm-bundle/chai';
import { ASSET_SELECTOR_URL, loadAssetSelector } from '../../../../nx2/utils/aem-assets/selector.js';

const fixtureSrc = (id) => `data:text/javascript,window.PureJSSelectors={fixture:${id}}`;
const scriptsFor = (src) => document.head.querySelectorAll(`script[src="${src}"]`);

describe('loadAssetSelector', () => {
  let originalSelectors;
  beforeEach(() => { originalSelectors = window.PureJSSelectors; });
  afterEach(() => {
    window.PureJSSelectors = originalSelectors;
    document.head.querySelectorAll('script[src^="data:text/javascript"]').forEach((el) => el.remove());
  });

  it('points at the hosted AEM Assets selector by default', () => {
    expect(ASSET_SELECTOR_URL).to.equal('https://experience.adobe.com/solutions/CQ-assets-selectors/static-assets/resources/assets-selectors.js');
  });

  it('resolves the selectors global once the script loads', async () => {
    const result = await loadAssetSelector({ src: fixtureSrc(1) });
    expect(result).to.deep.equal({ selectors: { fixture: 1 } });
  });

  it('memoizes concurrent calls into one promise and one script tag', async () => {
    const src = fixtureSrc(2);
    const first = loadAssetSelector({ src });
    const second = loadAssetSelector({ src });
    expect(first).to.equal(second);
    await first;
    expect(loadAssetSelector({ src })).to.equal(first);
    expect(scriptsFor(src)).to.have.length(1);
  });

  it('resolves an error, removes the tag and retries after a failed load', async () => {
    const src = '/test/nx2/utils/aem-assets/missing-selector.js';
    const failed = loadAssetSelector({ src });
    expect(await failed).to.deep.equal({ error: 'The AEM Assets selector could not be loaded.' });
    expect(scriptsFor(src)).to.have.length(0);

    const retry = loadAssetSelector({ src });
    expect(retry).to.not.equal(failed);
    expect(await retry).to.have.property('error');
    expect(scriptsFor(src)).to.have.length(0);
  });
});
