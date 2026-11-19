import { expect } from '@esm-bundle/chai';
import '../../../../nx/blocks/loc/views/translate/translate.js';

/**
 * Creates a translate element with a project carrying the given service.
 * @param {object} [service] - Service entry stored in the project options.
 * @param {object[]} [langs] - Project languages; defaults to one translate language.
 * @returns {HTMLElement} The element.
 */
function createTranslateEl(service, langs = [{ name: 'German', action: 'translate' }]) {
  const el = document.createElement('nx-loc-translate');
  el.renderRoot = document.createElement('div');
  el.project = { org: 'acme', site: 'site1', options: { service }, langs };
  return el;
}

describe('NxLocTranslate - setupService config gate', () => {
  it('skips service setup when no language uses Translate', async () => {
    const el = createTranslateEl(undefined, [{ name: 'German', action: 'copy' }]);

    await el.setupService();

    expect(el._configErrors).to.equal(undefined);
    expect(el._message).to.equal(undefined);
    expect(el._service).to.equal(undefined);
  });

  it('blocks with the config error when the service is not set', async () => {
    const el = createTranslateEl(undefined);

    await el.setupService();

    expect(el._configErrors).to.have.length.greaterThan(0);
    expect(el._message.type).to.equal('error');
    expect(el._service).to.equal(undefined);
  });

  it('keeps the connector usable when a required connector value is missing', async () => {
    const el = createTranslateEl({ name: 'glaas', env: 'prod' });

    await el.setupService();

    expect(el._configErrors).to.have.length.greaterThan(0);
    expect(el._message.text).to.include('glaas');
    expect(el._service.name).to.equal('glaas');
    expect(el._connected).to.equal(false);
  });

  it('reports an unknown service without throwing', async () => {
    const el = createTranslateEl({ name: 'not-a-connector' });

    await el.setupService();

    expect(el._message.text).to.include('Unknown translation service');
    expect(el._service).to.equal(undefined);
    expect(el._connected).to.equal(undefined);
  });

  it('sets up the service and clears stale errors when valid', async () => {
    const el = createTranslateEl({ name: 'google' });
    el._configErrors = ['stale'];

    await el.setupService();

    expect(el._configErrors).to.equal(undefined);
    expect(el._service.name).to.equal('google');
    expect(el._service.org).to.equal('acme');
    expect(el._connected).to.equal(true);
  });
});

describe('NxLocTranslate - handleConnect with config errors', () => {
  it('still connects so in-flight projects can check status', async () => {
    const el = createTranslateEl({ name: 'google' });
    el._configErrors = ['Translation service "glaas" is missing "origin".'];
    el._service = { connector: { connect: async () => true } };

    await el.handleConnect();

    expect(el._connected).to.equal(true);
  });
});

describe('NxLocTranslate - handleSendAll config gate', () => {
  it('blocks with the config error and never prepares the translation', async () => {
    const el = createTranslateEl({ name: 'google' });
    el._configErrors = ['Translation service "glaas" is missing "origin".'];
    el.getBaseTranslationConf = async () => { throw new Error('should not run'); };

    await el.handleSendAll();

    expect(el._message.type).to.equal('error');
    expect(el._message.text).to.include('missing "origin"');
    expect(el._sendAllBusy).to.not.equal(true);
  });

  it('blocks with a generic message when no service is set up', async () => {
    const el = createTranslateEl({ name: 'google' });
    el.getBaseTranslationConf = async () => { throw new Error('should not run'); };

    await el.handleSendAll();

    expect(el._message).to.deep.equal({ text: 'Translation service is not configured.', type: 'error' });
  });
});
