import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import '../../nx/blocks/loc/views/translate/translate.js';

const NxLocTranslate = customElements.get('nx-loc-translate');
const proto = NxLocTranslate.prototype;

const makeLang = (status = 'in-progress') => ({
  code: 'fr',
  name: 'French',
  translation: { status },
});

// Plain stand-in for the component so Lit's lifecycle stays out of the way.
const makeHost = ({ cancelTranslation }) => {
  const host = {
    _service: { connector: { cancelTranslation } },
    handleMessage: sinon.stub(),
    requestUpdate: sinon.stub(),
    handleGetStatus: sinon.stub().resolves(),
  };
  host.cancelLang = proto.cancelLang.bind(host);
  return host;
};

describe('translate view: handleCancelLang', () => {
  afterEach(() => sinon.restore());

  it('refreshes status after a successful cancel', async () => {
    const lang = makeLang();
    const cancelTranslation = sinon.stub().resolves({ ok: true });
    const host = makeHost({ cancelTranslation });

    await proto.handleCancelLang.call(host, lang);

    expect(host.handleGetStatus.calledOnce).to.equal(true);
  });

  it('refreshes status when Smartling accepts the cancel asynchronously', async () => {
    const lang = makeLang();
    const cancelTranslation = sinon.stub().callsFake(async ({ lang: l }) => {
      l.translation.cancelPending = true;
      return { ok: false };
    });
    const host = makeHost({ cancelTranslation });

    await proto.handleCancelLang.call(host, lang);

    expect(host.handleGetStatus.calledOnce).to.equal(true);
    expect(lang.translation.status).to.equal('cancelling');
  });

  it('skips the refresh and restores the status when the cancel is rejected', async () => {
    const lang = makeLang('in-progress');
    const cancelTranslation = sinon.stub().resolves({ ok: false });
    const host = makeHost({ cancelTranslation });

    await proto.handleCancelLang.call(host, lang);

    expect(host.handleGetStatus.called).to.equal(false);
    expect(lang.translation.status).to.equal('in-progress');
  });

  it('tracks the language as canceling only while the cancel is in flight', async () => {
    const lang = makeLang();
    let release;
    const cancelTranslation = sinon.stub().callsFake(() => new Promise((resolve) => {
      release = () => resolve({ ok: true });
    }));
    const host = makeHost({ cancelTranslation });

    const pending = proto.handleCancelLang.call(host, lang);
    expect(host._cancelingLangs.has('fr')).to.equal(true);

    release();
    await pending;
    expect(host._cancelingLangs.has('fr')).to.equal(false);
  });
});

describe('translate view: renderCancelLang', () => {
  const makeRenderHost = ({ lang, busy }) => ({
    canCancel: true,
    _connected: true,
    _cancelingLangs: new Set(busy ? [lang.code] : []),
    canCancelLang: proto.canCancelLang,
    renderSpinner: () => 'spinner',
    handleCancelLang: sinon.stub(),
  });

  it('hides Cancel once the language is cancelling and not busy', () => {
    const lang = makeLang('cancelling');
    const host = makeRenderHost({ lang, busy: false });

    const result = proto.renderCancelLang.call(host, lang);

    expect(result.strings).to.equal(undefined);
  });

  it('keeps the busy Cancel button visible while the cancel is in flight', () => {
    const lang = makeLang('cancelling');
    const host = makeRenderHost({ lang, busy: true });

    const result = proto.renderCancelLang.call(host, lang);

    expect(result.strings).to.be.an('array');
  });
});
