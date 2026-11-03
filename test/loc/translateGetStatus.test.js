import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import '../../nx/blocks/loc/views/translate/translate.js';

const proto = customElements.get('nx-loc-translate').prototype;

const makeHost = (getStatusAll) => ({
  _service: { connector: { getStatusAll } },
  getBaseTranslationConf: sinon.stub().resolves({ langs: [] }),
  checkAndSaveLangs: sinon.stub().resolves(),
  handleSaveLangs: sinon.stub(),
});

describe('translate view: handleGetStatus', () => {
  afterEach(() => sinon.restore());

  it('shows the errors the connector still reports', async () => {
    const failed = { error: 'Error translating /page to fr - 500' };
    const host = makeHost(sinon.stub().resolves({ errors: [failed] }));
    host._urlErrors = [{ error: 'old' }];

    await proto.handleGetStatus.call(host);

    expect(host._urlErrors).to.deep.equal([failed]);
  });

  it('clears the errors once the connector reports none', async () => {
    const host = makeHost(sinon.stub().resolves({ errors: [] }));
    host._urlErrors = [{ error: 'old' }];

    await proto.handleGetStatus.call(host);

    expect(host._urlErrors).to.equal(undefined);
  });

  it('keeps the errors when the connector does not report any', async () => {
    const host = makeHost(sinon.stub().resolves());
    host._urlErrors = [{ error: 'old' }];

    await proto.handleGetStatus.call(host);

    expect(host._urlErrors).to.deep.equal([{ error: 'old' }]);
  });
});
