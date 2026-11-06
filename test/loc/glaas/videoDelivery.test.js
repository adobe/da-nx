import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { render } from 'da-lit';
import { getStatusAll } from '../../../nx/blocks/loc/connectors/glaas/index.js';
import { resetV2AssetCacheForTests } from '../../../nx/blocks/loc/connectors/glaas/multimodalApi.js';
import '../../../nx/blocks/loc/views/translate/translate.js';

const videoId = '08aeb35d-e0f0-4b07-9f7b-b64e1fd28983';
const assetName = `/page/${videoId}.mp4`;
const service = { origin: 'https://glaas.example', clientid: 'client' };
const language = (code = 'fr') => ({
  code,
  translation: {
    status: 'complete',
    workflowTasks: {
      Task: {
        name: 'Task',
        workflow: 'Product/Project',
        workflowName: 'MULTIMODAL',
        status: { status: 'complete' },
        pageAssets: {
          '/page': { videos: [{ glaasName: assetName, videoId }] },
        },
      },
    },
  },
});

describe('GLaaS video delivery from Get Status', () => {
  let fetchStub;
  let actions;
  let originalIms;
  let delivered;
  let originalDebug;
  let clock;
  let now = Date.now();

  beforeEach(() => {
    now += 600_000;
    clock = sinon.useFakeTimers({ now, toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    originalIms = window.adobeIMS;
    originalDebug = localStorage.getItem('glaas.log');
    localStorage.removeItem('glaas.log');
    window.adobeIMS = { getAccessToken: () => ({ token: 'fixture-adobe-user' }) };
    resetV2AssetCacheForTests();
    delivered = { status: 'queued' };
    actions = { sendMessage: sinon.stub(), saveState: sinon.stub().resolves() };
    fetchStub = sinon.stub(window, 'fetch').callsFake(async (href) => {
      if (String(href).includes('/assets/')) {
        return new Response(JSON.stringify({ signedURL: 'https://signed.example/srt?secret=value', taskVersion: 7 }));
      }
      if (String(href).endsWith('/video-delivery')) return new Response(JSON.stringify(delivered), { status: 202 });
      throw new Error(`Unexpected request: ${href}`);
    });
  });

  afterEach(() => {
    clock.restore();
    window.adobeIMS = originalIms;
    if (originalDebug === null) localStorage.removeItem('glaas.log');
    else localStorage.setItem('glaas.log', originalDebug);
    sinon.restore();
    resetV2AssetCacheForTests();
  });

  const check = async (langs, signal) => {
    let settled = false;
    const result = getStatusAll({
      service, langs, actions, signal, urls: [],
    }).then((value) => ({ value }), (error) => ({ error })).finally(() => { settled = true; });
    while (!settled) await clock.tickAsync(1000);
    const outcome = await result;
    if (outcome.error) throw outcome.error;
    return outcome.value;
  };
  const submissions = () => fetchStub.getCalls().filter(({ args }) => (
    String(args[0]).endsWith('/video-delivery') && !JSON.parse(args[1].body).statusOnly
  ));

  it('queues completed English captions from an SRT reference without a top-level URL', async () => {
    fetchStub.callsFake(async (href) => {
      if (String(href).endsWith('/video-delivery')) {
        return new Response(JSON.stringify({ status: 'queued' }), { status: 202 });
      }
      const english = String(href).includes('/assets/en-x-cc/');
      return new Response(JSON.stringify({
        referencedAssets: english ? [
          { assetType: 'VIDEO', signedURL: 'https://example.com/video.mp4' },
          { assetType: 'SRT' },
          { assetType: 'SRT', signedURL: 'https://signed.example/english.srt?secret=value' },
        ] : [{ assetType: 'VIDEO', signedURL: 'https://example.com/video.mp4' }],
      }));
    });
    const langs = [language()];
    await check(langs);
    const calls = submissions();
    expect(calls).to.have.length(1);
    expect(JSON.parse(calls[0].args[1].body).targetLocale).to.equal('en-x-cc');
    expect(calls[0].args[1].body).not.to.include('signed.example');
    expect(langs[0].translation.workflowTasks.Task.sourceCaptionDelivery[assetName].status)
      .to.equal('queued');
  });

  it('does not queue captions when referencedAssets is malformed or has no usable SRT', async () => {
    fetchStub.resolves(new Response(JSON.stringify({ referencedAssets: {} })));
    await check([language()]);
    expect(fetchStub.getCalls().some(({ args }) => String(args[0]).endsWith('/video-delivery')))
      .to.equal(false);
  });

  it('logs opt-in readiness and handoff diagnostics without signed URLs or tokens', async () => {
    const info = sinon.spy(console, 'info');
    await check([language()]);
    expect(info.called).to.equal(false);
    localStorage.setItem('glaas.log', 'true');
    await check([language()]);
    const result = info.getCalls().find(({ args }) => (
      args[1] === 'video-caption-result' && args[2].targetLocale === 'en-x-cc'
    ));
    expect(result.args[2]).to.include({ httpStatus: 200, hasSignedURL: true, ready: true });
    expect(info.getCalls().some(({ args }) => args[1] === 'video-delivery-result')).to.equal(true);
    const logs = JSON.stringify(info.getCalls().map(({ args }) => args));
    expect(logs).not.to.include('secret=value');
    expect(logs).not.to.include('fixture-adobe-user');
  });

  it('checks legacy completed tasks and sends identity, not a signed URL, to AIO', async () => {
    const langs = [language()];
    const result = await check(langs);
    const call = fetchStub.getCalls().find(({ args }) => String(args[0]).endsWith('/video-delivery'));
    expect(call.args[1].headers.Authorization).to.equal('Bearer fixture-adobe-user');
    expect(JSON.parse(call.args[1].body)).to.deep.equal({
      productName: 'Product',
      projectName: 'Project',
      taskName: 'Task',
      assetName,
      targetLocale: 'fr',
      videoId,
      taskVersion: 7,
    });
    expect(langs[0].translation.workflowTasks.Task.videoDelivery[assetName].status).to.equal('queued');
    expect(langs[0].translation.status).to.equal('complete');
    expect(actions.saveState.called).to.equal(true);
    expect(result.message.text).to.equal('Video captions are still processing. Click Get Status again shortly to refresh.');
    const calls = submissions();
    expect(calls.map(({ args }) => JSON.parse(args[1].body).targetLocale))
      .to.deep.equal(['fr', 'en-x-cc']);
    expect(langs[0].translation.workflowTasks.Task.sourceCaptionDelivery[assetName].status)
      .to.equal('queued');
  });

  it('checks AIO again on the next click and stops after confirmed MPC delivery', async () => {
    const langs = [language()];
    const saved = [];
    actions.saveState.callsFake(async () => { saved.push(structuredClone(langs)); });
    await check(langs);
    delivered = { status: 'delivered' };
    await check(langs);
    expect(submissions()).to.have.length(2);
    const count = fetchStub.callCount;
    await check(langs);
    expect(fetchStub.callCount).to.equal(count);
    expect(langs[0].translation.workflowTasks.Task.videoDelivery[assetName].status).to.equal('delivered');
    expect(saved.at(-1)[0].translation.workflowTasks.Task.videoDelivery[assetName].status).to.equal('delivered');
  });

  it('marks Get Status submissions as manual retries but not status polls', async () => {
    const lang = language();
    const task = lang.translation.workflowTasks.Task;
    task.videoDelivery = { [assetName]: { status: 'error', taskVersion: 7 } };
    fetchStub.callsFake(async (href, options) => {
      if (!String(href).endsWith('/video-delivery')) {
        return new Response(JSON.stringify({ signedURL: 'https://signed.example/srt', taskVersion: 7 }));
      }
      const { statusOnly, manualRetry, targetLocale } = JSON.parse(options.body);
      if (!statusOnly) {
        expect(Boolean(manualRetry)).to.equal(targetLocale === 'fr');
        return new Response(JSON.stringify({ status: 'queued' }), { status: 202 });
      }
      expect(manualRetry).to.equal(undefined);
      return new Response(JSON.stringify({ status: 'delivered' }));
    });

    await check([lang]);

    const calls = submissions().map(({ args }) => JSON.parse(args[1].body));
    expect(calls).to.have.length(2);
    expect(calls.find(({ targetLocale }) => targetLocale === 'fr').manualRetry).to.equal(true);
    expect(calls.find(({ targetLocale }) => targetLocale === 'en-x-cc').manualRetry).to.equal(undefined);
    expect(lang.translation.workflowTasks.Task.videoDelivery[assetName].status).to.equal('delivered');
  });

  it('keeps an HTML-ready language unsavable until MPC confirms both caption deliveries', async () => {
    const lang = language();
    lang.translation.status = 'translated';
    const task = lang.translation.workflowTasks.Task;
    task.urls = ['/page'];
    task.status = { status: 'translated', sent: 1, translated: 1, error: 0 };
    task.pageAssets['/page'].htmlGlaasName = '/page.html';
    task.pageAssets['/page'].images = [];
    await check([lang]);
    expect(lang.translation.translated).to.equal(0);
    expect(lang.translation.status).to.equal('created');
    delivered = { status: 'delivered' };
    await check([lang]);
    expect(lang.translation.translated).to.equal(1);
    expect(lang.translation.status).to.equal('translated');
  });

  it('checks incomplete English captions once per task and skips cancelled languages', async () => {
    fetchStub.resolves(new Response('{}', { status: 404 }));
    const cancelled = language('de');
    cancelled.translation.status = 'cancelled';
    await check([language(), language('en-x-cc'), cancelled]);
    expect(fetchStub.callCount).to.equal(2);
    expect(String(fetchStub.firstCall.args[0])).to.include('/assets/fr/');
    expect(String(fetchStub.secondCall.args[0])).to.include('/assets/en-x-cc/');
    expect(actions.sendMessage.lastCall.args[0].text).to.equal('Video captions are still translating. Click Get Status again shortly to refresh.');
  });

  it('delivers English once per shared task without adding an English DA language', async () => {
    const langs = [language('fr'), language('de')];
    await check(langs);
    const calls = submissions();
    expect(calls.map(({ args }) => JSON.parse(args[1].body).targetLocale))
      .to.deep.equal(['fr', 'en-x-cc', 'de']);
    expect(langs.map(({ code }) => code)).to.deep.equal(['fr', 'de']);
  });

  it('does not repeat delivered English when language order changes or its previous owner is cancelled', async () => {
    const langs = [language('fr'), language('de')];
    langs[1].translation.workflowTasks.Task.sourceCaptionDelivery = { [assetName]: { status: 'delivered' } };
    await check(langs);
    langs.reverse();
    langs[0].translation.status = 'cancelled';
    await check(langs);
    const locales = fetchStub.getCalls().filter(({ args }) => String(args[0]).endsWith('/video-delivery'))
      .map(({ args }) => JSON.parse(args[1].body).targetLocale);
    expect(locales).not.to.include('en-x-cc');
    expect(langs[1].translation.workflowTasks.Task.sourceCaptionDelivery[assetName].status).to.equal('delivered');
  });

  it('shares newly delivered English with a second language before the next status check', async () => {
    const langs = [language('fr'), language('de')];
    delivered = { status: 'delivered' };
    await check(langs);
    langs.reverse();
    langs[0].translation.workflowTasks.Task.videoDelivery = {};
    const before = fetchStub.callCount;
    await check(langs);
    const locales = fetchStub.getCalls().slice(before).filter(({ args }) => String(args[0]).endsWith('/video-delivery'))
      .map(({ args }) => JSON.parse(args[1].body).targetLocale);
    expect(locales).to.deep.equal(['de']);
  });

  it('deduplicates video inventory across pages in a legacy completed task', async () => {
    const lang = language();
    const task = lang.translation.workflowTasks.Task;
    task.pageAssets['/other-page'] = structuredClone(task.pageAssets['/page']);
    await check([lang]);
    const calls = submissions();
    expect(calls.map(({ args }) => JSON.parse(args[1].body).targetLocale))
      .to.deep.equal(['fr', 'en-x-cc']);
    expect(lang.translation.status).to.equal('complete');
  });

  it('rejects missing Adobe sessions without calling AIO', async () => {
    window.adobeIMS = undefined;
    const result = await check([language()]);
    expect(result.message).to.include({ type: 'error' });
    expect(result.message.text).to.include('Sign in to Adobe');
    expect(fetchStub.called).to.equal(false);
  });

  it('surfaces AIO failures rather than marking captions delivered', async () => {
    fetchStub.withArgs(sinon.match(/video-delivery$/)).resolves(
      new Response(JSON.stringify({ error: 'Invalid Adobe user token.' }), { status: 401 }),
    );
    const langs = [language()];
    const result = await check(langs);
    expect(result.message).to.include({ type: 'error' });
    expect(result.message.text).to.include('Invalid Adobe user token.');
    expect(langs[0].translation.workflowTasks.Task.videoDelivery).to.equal(undefined);
  });

  it('does not enqueue work after cancellation', async () => {
    const controller = new AbortController();
    controller.abort();
    try {
      await check([language()], controller.signal);
      expect.fail('Expected cancellation');
    } catch (error) {
      expect(error.name).to.equal('AbortError');
    }
    expect(fetchStub.called).to.equal(false);
  });

  it('finishes queued captions in one click without repeating GLaaS lookups or queue writes', async () => {
    const lang = language();
    fetchStub.callsFake(async (href, options) => {
      if (String(href).endsWith('/video-delivery')) {
        const { statusOnly } = JSON.parse(options.body);
        return new Response(JSON.stringify({ status: statusOnly ? 'delivered' : 'queued' }));
      }
      return new Response(JSON.stringify({ signedURL: 'https://signed.example/srt', taskVersion: 7 }));
    });
    expect(await check([lang])).to.equal(undefined);
    expect(submissions()).to.have.length(2);
    expect(fetchStub.getCalls().filter(({ args }) => String(args[0]).includes('/assets/')))
      .to.have.length(2);
    expect(lang.translation.workflowTasks.Task.videoDelivery[assetName])
      .to.deep.equal({ status: 'delivered', taskVersion: 7 });
    expect(actions.sendMessage.calledWith({ text: 'Preparing video captions...' })).to.equal(true);
  });

  it('cancels polling immediately and preserves queued identities for the next click', async () => {
    const controller = new AbortController();
    const lang = language();
    actions.sendMessage.callsFake((message) => {
      if (message?.text === 'Preparing video captions...') controller.abort();
    });
    try {
      await check([lang], controller.signal);
      expect.fail('Expected cancellation');
    } catch (error) {
      expect(error.name).to.equal('AbortError');
    }
    expect(fetchStub.callCount).to.equal(4);
    expect(lang.translation.workflowTasks.Task.videoDelivery[assetName])
      .to.deep.equal({ status: 'queued', taskVersion: 7 });
    expect(actions.saveState.called).to.equal(true);
    expect(clock.countTimers()).to.equal(0);
  });

  it('bounds an in-flight status request and returns an actionable refresh message', async () => {
    const lang = language();
    lang.translation.workflowTasks.Task.sourceCaptionDelivery = {
      [assetName]: { status: 'delivered' },
    };
    fetchStub.callsFake(async (href, options) => {
      if (!String(href).endsWith('/video-delivery')) {
        return new Response(JSON.stringify({ signedURL: 'https://signed.example/srt', taskVersion: 7 }));
      }
      if (!JSON.parse(options.body).statusOnly) {
        return new Response(JSON.stringify({ status: 'queued' }));
      }
      return new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
      });
    });
    const start = clock.now;
    const result = await check([lang]);
    expect(result.message.text).to.include('Click Get Status again');
    expect(clock.now - start).to.be.lessThan(78_000);
    expect(submissions()).to.have.length(1);
    expect(actions.saveState.callCount).to.equal(3);
    expect(clock.countTimers()).to.equal(0);
  });

  it('persists partial delivery progress when a later caption fails during polling', async () => {
    const lang = language();
    const saved = [];
    actions.saveState.callsFake(async () => { saved.push(structuredClone(lang)); });
    fetchStub.callsFake(async (href, options) => {
      if (!String(href).endsWith('/video-delivery')) {
        return new Response(JSON.stringify({ signedURL: 'https://signed.example/srt' }));
      }
      const { statusOnly, targetLocale } = JSON.parse(options.body);
      if (!statusOnly) return new Response(JSON.stringify({ status: 'queued' }));
      const body = targetLocale === 'fr' ? { status: 'delivered' }
        : { status: 'error', error: 'Upload requires review.' };
      return new Response(JSON.stringify(body));
    });
    const result = await check([lang]);
    expect(result.message).to.include({ type: 'error' });
    expect(result.message.text).to.include('Upload requires review.');
    const task = saved.at(-1).translation.workflowTasks.Task;
    expect(task.videoDelivery[assetName].status).to.equal('delivered');
    expect(task.sourceCaptionDelivery[assetName].status).to.equal('error');
    expect(clock.countTimers()).to.equal(0);
  });

  ['initial pass', 'polling'].forEach((phase) => it(`isolates a terminal caption error during ${phase}`, async () => {
    const lang = language();
    const saved = [];
    actions.saveState.callsFake(async () => { saved.push(structuredClone(lang)); });
    fetchStub.callsFake(async (href, options) => {
      if (!String(href).endsWith('/video-delivery')) {
        return new Response(JSON.stringify({ signedURL: 'https://signed.example/srt' }));
      }
      const { statusOnly, targetLocale } = JSON.parse(options.body);
      if (targetLocale === 'fr' && (phase === 'initial pass' || statusOnly)) {
        return new Response(JSON.stringify({ status: 'error', error: 'French upload requires review.' }));
      }
      return new Response(JSON.stringify({ status: statusOnly ? 'delivered' : 'queued' }));
    });
    const result = await check([lang]);
    expect(result.message).to.include({ type: 'error' });
    expect(result.message.text).to.include('French upload requires review.');
    const task = saved.at(-1).translation.workflowTasks.Task;
    expect(task.videoDelivery[assetName].status).to.equal('error');
    expect(task.sourceCaptionDelivery[assetName].status).to.equal('delivered');
    expect(submissions().map(({ args }) => JSON.parse(args[1].body).targetLocale))
      .to.deep.equal(['fr', 'en-x-cc']);
    expect(clock.countTimers()).to.equal(0);
  }));

  ['initial pass', 'polling'].forEach((phase) => it(`separates video delivery errors by newline during ${phase}`, async () => {
    const langs = ['ja', 'bg'].map((code) => {
      const lang = language(code);
      lang.translation.workflowTasks.Task.sourceCaptionDelivery = {
        [assetName]: { status: 'delivered' },
      };
      return lang;
    });
    fetchStub.callsFake(async (href, options) => {
      if (!String(href).endsWith('/video-delivery')) {
        return new Response(JSON.stringify({ signedURL: 'https://signed.example/srt' }));
      }
      const { statusOnly } = JSON.parse(options.body);
      const body = phase === 'initial pass' || statusOnly
        ? { status: 'error', error: 'GLaaS caption download failed (404).' }
        : { status: 'queued' };
      return new Response(JSON.stringify(body));
    });
    const result = await check(langs);
    expect(result.message).to.include({ type: 'error' });
    expect(result.message.text).to.equal(
      `Video delivery failed for ${assetName} (ja): GLaaS caption download failed (404).\n`
      + `Video delivery failed for ${assetName} (bg): GLaaS caption download failed (404).`,
    );
    expect(clock.countTimers()).to.equal(0);
  }));

  it('skips blocked page probes while still checking unrelated video-free languages', async () => {
    const blocked = language('fr');
    blocked.translation.status = 'created';
    blocked.translation.workflowTasks.Task.status = { status: 'created', sent: 1 };
    const other = language('de');
    other.translation.status = 'created';
    other.translation.workflowTasks.Task = {
      ...other.translation.workflowTasks.Task,
      status: { status: 'created', sent: 1 },
      pageAssets: { '/page': { htmlGlaasName: '/page.html', images: [] } },
    };
    await check([blocked, other]);
    const pageCalls = fetchStub.getCalls().filter(({ args }) => String(args[0]).includes('page.html'));
    expect(pageCalls.length).to.be.greaterThan(0);
    expect(pageCalls.every(({ args }) => String(args[0]).includes('/assets/de/'))).to.equal(true);
    expect(blocked.translation.status).to.equal('created');
  });

  it('saves a ready language while reporting another language’s caption failure', async () => {
    const blocked = language('fr');
    blocked.location = '/fr';
    blocked.translation.status = 'created';
    blocked.translation.workflowTasks.Task.status = { status: 'created', sent: 1, translated: 0 };
    blocked.translation.workflowTasks.Task.sourceCaptionDelivery = {
      [assetName]: { status: 'delivered' },
    };
    const ready = language('de');
    ready.location = '/de';
    ready.translation.status = 'created';
    ready.translation.workflowTasks.Task.status = { status: 'created', sent: 1, translated: 0 };
    ready.translation.workflowTasks.Task.pageAssets = {
      '/page': { htmlGlaasName: '/page.html', images: [] },
    };
    const langs = [blocked, ready];
    const urls = [{ suppliedPath: '/page', basePath: '/page', ext: 'html' }];
    fetchStub.callsFake(async (href) => {
      if (String(href).endsWith('/video-delivery')) {
        return new Response(JSON.stringify({ status: 'error', error: 'Caption upload failed.' }));
      }
      return new Response(JSON.stringify({ signedURL: 'https://signed.example/srt' }));
    });

    const el = document.createElement('nx-loc-translate');
    el._translateLangs = langs;
    el._urls = urls;
    el._options = { 'translate.conflict.behavior': 'overwrite', 'source.language': { location: '/' } };
    const saveItems = sinon.stub().callsFake(async ({ urls: items }) => (
      items.map((item) => ({ ...item, status: 'success' }))
    ));
    el._service = {
      connector: {
        supportsManagedStatus: true, saveLangConcurrency: 3, getStatusAll, saveItems,
      },
    };
    sinon.stub(el, 'getBaseTranslationConf').resolves({
      org: 'org',
      site: 'site',
      title: 'Project',
      service,
      langs,
      urls,
      options: el._options,
      actions: { saveState: actions.saveState, sendMessage: el.handleMessage.bind(el) },
    });

    let settled = false;
    const pending = el.handleGetStatus().finally(() => { settled = true; });
    while (!settled) await clock.tickAsync(1000);
    await pending;

    expect(saveItems.calledOnce).to.equal(true);
    expect(saveItems.firstCall.args[0].lang.code).to.equal('de');
    expect(ready.translation.status).to.equal('complete');
    expect(blocked.translation.status).to.equal('created');
    expect(el._message.type).to.equal('error');
    expect(el._message.text).to.include('Caption upload failed.');
  });

  it('preserves both caption and GLaaS status errors when they occur together', async () => {
    const blocked = language('fr');
    blocked.translation.status = 'created';
    blocked.translation.workflowTasks.Task.status = { status: 'created', sent: 1 };
    blocked.translation.workflowTasks.Task.sourceCaptionDelivery = {
      [assetName]: { status: 'delivered' },
    };
    const other = language('de');
    other.translation.status = 'created';
    other.translation.workflowTasks.Task.status = { status: 'created', sent: 1 };
    other.translation.workflowTasks.Task.pageAssets = {
      '/page': { htmlGlaasName: '/page.html', images: [] },
    };
    fetchStub.callsFake(async (href) => {
      if (String(href).endsWith('/video-delivery')) {
        return new Response(JSON.stringify({ status: 'error', error: 'Caption upload failed.' }));
      }
      if (String(href).includes('/assets/de/')) return new Response('', { status: 403 });
      return new Response(JSON.stringify({ signedURL: 'https://signed.example/srt' }));
    });

    let result;
    try {
      await check([blocked, other]);
    } catch (error) {
      result = error;
    }
    expect(result).to.be.instanceOf(Error);
    expect(result.message).to.include('Caption upload failed.');
    expect(result.message).to.include('Could not check GLaaS status for de');
  });

  it('reports both caption failure and rate limiting while retaining unfinished status', async () => {
    const blocked = language('fr');
    blocked.translation.status = 'created';
    blocked.translation.workflowTasks.Task.status = { status: 'created', sent: 1 };
    blocked.translation.workflowTasks.Task.sourceCaptionDelivery = {
      [assetName]: { status: 'delivered' },
    };
    const limited = language('de');
    limited.translation.status = 'created';
    limited.translation.workflowTasks.Task.status = { status: 'created', sent: 1 };
    limited.translation.workflowTasks.Task.pageAssets = {
      '/page': { htmlGlaasName: '/page.html', images: [] },
    };
    fetchStub.callsFake(async (href) => {
      if (String(href).endsWith('/video-delivery')) {
        return new Response(JSON.stringify({ status: 'error', error: 'Caption upload failed.' }));
      }
      if (String(href).includes('/assets/de/')) return new Response('', { status: 429 });
      return new Response(JSON.stringify({ signedURL: 'https://signed.example/srt' }));
    });

    const result = await check([blocked, limited]);
    expect(result.message.type).to.equal('error');
    expect(result.message.text).to.include('Caption upload failed.');
    expect(result.message.text).to.include('HTTP 429');
    expect(limited.translation.status).to.equal('created');
  });

  it('uses normal incomplete-language Get Status visibility while captions are pending', () => {
    const el = document.createElement('nx-loc-translate');
    const lang = language();
    lang.translation.status = 'created';
    el._translateLangs = [lang];
    el._connected = true;
    el._options = {};
    el._service = { connector: {} };
    const container = document.createElement('div');
    render(el.renderTranslateAction(), container);
    expect(container.textContent).to.include('Get status');
    expect(container.textContent).not.to.include('Cancel project');
    lang.translation.status = 'complete';
    render(el.renderTranslateAction(), container);
    expect(container.textContent).not.to.include('Get status');
  });
});
