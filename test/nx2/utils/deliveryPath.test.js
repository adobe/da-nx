import { expect } from '@esm-bundle/chai';
import { applyUrlTemplate } from '../../../nx2/utils/deliveryPath.js';

describe('applyUrlTemplate', () => {
  it('substitutes the aemPath token into the template', () => {
    const url = applyUrlTemplate(
      // eslint-disable-next-line no-template-curly-in-string
      'https://da-sc.adobeaem.workers.dev/preview${aemPath}',
      '/kozmaadrian/da-sc/forms/ai-evolution',
    );
    expect(url).to.equal('https://da-sc.adobeaem.workers.dev/preview/kozmaadrian/da-sc/forms/ai-evolution');
  });

  it('collapses a duplicate slash from a trailing-slash template', () => {
    const url = applyUrlTemplate(
      // eslint-disable-next-line no-template-curly-in-string
      'https://example.com/preview/${aemPath}',
      '/org/site/page',
    );
    expect(url).to.equal('https://example.com/preview/org/site/page');
  });

  it('preserves the :// scheme separator', () => {
    const url = applyUrlTemplate(
      // eslint-disable-next-line no-template-curly-in-string
      'https://example.com${aemPath}',
      '/org/site/page',
    );
    expect(url).to.equal('https://example.com/org/site/page');
  });

  it('preserves a query string in the template', () => {
    const url = applyUrlTemplate(
      // eslint-disable-next-line no-template-curly-in-string
      'https://example.com/preview${aemPath}?mode=edit&x=1',
      '/org/site/page',
    );
    expect(url).to.equal('https://example.com/preview/org/site/page?mode=edit&x=1');
  });

  it('returns the template unchanged when there is no token', () => {
    const url = applyUrlTemplate('https://example.com/static', '/org/site/page');
    expect(url).to.equal('https://example.com/static');
  });
});
