import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setImsDetails } from '../../nx/utils/daFetch.js';
import { rolloutLang, setSaveError } from '../../nx/blocks/loc/views/rollout/index.js';
import '../../nx/blocks/loc/views/rollout/rollout.js';

const proto = customElements.get('nx-loc-rollout').prototype;

const page = (text) => `<body><header></header><main><div><p>${text}</p></div></main><footer></footer></body>`;

const makeFetch = ({ failSave, rejectSave } = {}) => sinon.stub().callsFake(async (input, opts) => {
  const url = input.toString();
  const method = opts?.method || 'GET';
  if (method === 'POST') {
    if (rejectSave && url.endsWith(rejectSave)) throw new TypeError('Failed to fetch');
    return new Response('', { status: failSave && url.endsWith(failSave) ? 500 : 200 });
  }
  if (url.endsWith('.json')) return new Response('', { status: 404 });
  if (url.includes('/source/org/site/en/')) return new Response(page('source'), { status: 200 });
  return new Response(page('regional'), { status: 200 });
});

const makeLang = () => ({
  name: 'English',
  code: 'en',
  location: '/en',
  locales: [{ code: '/en-gb' }],
  rollout: { status: 'not started' },
});

const makeProject = (behavior = 'overwrite') => ({
  org: 'org',
  site: 'site',
  title: 'Project',
  options: { 'source.language': { location: '/' }, 'rollout.conflict.behavior': behavior },
  urls: ['/a', '/b', '/c'].map((suppliedPath) => ({ suppliedPath })),
});

const makeConf = (lang, behavior) => ({
  ...makeProject(behavior),
  lang,
  actions: { requestUpdate: () => {} },
});

describe('rolloutLang', () => {
  let originalFetch;

  beforeEach(() => {
    setImsDetails('test-token');
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    sinon.restore();
  });

  ['overwrite', 'merge'].forEach((behavior) => {
    it(`does not mark the language complete when one of three saves fails (${behavior})`, async () => {
      globalThis.fetch = makeFetch({ failSave: '/en-gb/b.html' });
      const lang = makeLang();

      const { errors, message } = await rolloutLang(makeConf(lang, behavior));

      expect(lang.rollout.status).to.equal('not started');
      expect(lang.rollout.saved).to.equal(2);
      expect(lang.locales[0].saved).to.equal(2);
      expect(message.type).to.equal('error');
      expect(errors).to.have.length(1);
      expect(errors[0].error).to.include('/org/site/en-gb/b.html');
      expect(errors[0].error).to.include('500');
    });
  });

  it('records a save that throws and still saves the other pages', async () => {
    globalThis.fetch = makeFetch({ rejectSave: '/en-gb/b.html' });
    const lang = makeLang();

    const { errors } = await rolloutLang(makeConf(lang));

    expect(lang.rollout.status).to.equal('not started');
    expect(lang.rollout.saved).to.equal(2);
    expect(errors).to.have.length(1);
    expect(errors[0].error).to.include('/org/site/en-gb/b.html');
  });

  it('marks the language complete when every save succeeds', async () => {
    globalThis.fetch = makeFetch();
    const lang = makeLang();

    const result = await rolloutLang(makeConf(lang));

    expect(result).to.deep.equal({});
    expect(lang.rollout).to.deep.equal({ status: 'complete', saved: 3 });
    expect(lang.locales[0].saved).to.equal(3);
  });
});

describe('rollout view: handleRolloutLang', () => {
  let originalFetch;

  beforeEach(() => {
    setImsDetails('test-token');
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    sinon.restore();
  });

  it('persists the language and lists the errors when a save fails', async () => {
    globalThis.fetch = makeFetch({ failSave: '/en-gb/b.html' });
    const lang = makeLang();
    const host = {
      project: makeProject(),
      _langs: [lang],
      requestUpdate: () => {},
      dispatchEvent: sinon.stub(),
    };

    await proto.handleRolloutLang.call(host, lang);

    expect(host._errors).to.have.length(1);
    expect(host.dispatchEvent.calledOnce).to.equal(true);
    const { langs } = host.dispatchEvent.firstCall.args[0].detail.data;
    expect(langs[0].rollout).to.deep.equal({ status: 'not started', saved: 2 });
  });
});

describe('rollout view: errors list', () => {
  let originalFetch;

  const makeHost = (langs) => {
    const host = {
      project: makeProject(),
      _langs: langs,
      requestUpdate: () => {},
      dispatchEvent: sinon.stub(),
    };
    host.handleRolloutLang = proto.handleRolloutLang.bind(host);
    return host;
  };

  beforeEach(() => {
    setImsDetails('test-token');
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    sinon.restore();
  });

  it('clears the errors of an earlier rollout once a retry succeeds', async () => {
    globalThis.fetch = makeFetch();
    const lang = makeLang();
    const host = makeHost([lang]);
    host._errors = [{ error: 'Error saving /org/site/en-gb/b.html - 500' }];

    await proto.handleRolloutLang.call(host, lang);

    expect(host._errors).to.equal(undefined);
  });

  it('keeps the errors of every language in a group rollout', async () => {
    globalThis.fetch = makeFetch({ failSave: '/b.html' });
    const en = makeLang();
    const de = { ...makeLang(), name: 'German', code: 'de', location: '/de', locales: [{ code: '/de-ch' }] };
    const host = makeHost([en, de]);

    await proto.handleRolloutGroup.call(host, { langs: [en, de] });

    expect(host._errors.map((url) => url.destination)).to.deep.equal([
      '/org/site/en-gb/b.html',
      '/org/site/de-ch/b.html',
    ]);
  });
});

describe('setSaveError', () => {
  it('names the page and the reason', () => {
    const url = { destination: '/org/site/en-gb/b.html' };

    setSaveError(url, 500);

    expect(url.error).to.equal('Error saving /org/site/en-gb/b.html - 500');
  });

  it('keeps a message the copy helper already set', () => {
    const url = { destination: '/org/site/en-gb/b.html', error: '/org/site/en-gb/b.html: Save failed (500)' };

    setSaveError(url, 500);

    expect(url.error).to.equal('/org/site/en-gb/b.html: Save failed (500)');
  });
});
