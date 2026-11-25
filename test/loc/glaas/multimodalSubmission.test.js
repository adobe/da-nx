import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { sendAllLanguages } from '../../../nx/blocks/loc/connectors/glaas/index.js';
import {
  createMultimodalTask, resetPutUrlRateLimitGateForTests,
} from '../../../nx/blocks/loc/connectors/glaas/multimodalApi.js';
import { writeSelections } from '../../../nx/blocks/loc/connectors/glaas/imageSelections.js';
import { writeVideoSelections } from '../../../nx/blocks/loc/connectors/glaas/videoSelections.js';

describe('GLaaS multimodal video submission', () => {
  const origin = 'https://glaas.example';
  const videoHref = 'https://video.tv.adobe.com/v/333754?autoplay=false';
  const brokenHref = 'https://video.tv.adobe.com/v/2';
  const mp4 = 'https://images-tv.adobe.com/medium.mp4';
  const videoId = 'baac64d8-f931-4a14-b0e4-6574cb1a6846';
  const imageHref = 'https://content.da.live/org/site/hero.jpg';
  let requests;
  let fetchStub;
  let actions;

  function page(path, { selected = [videoHref], links = selected, image = false } = {}) {
    const content = `<body><main><p>Text</p>${image ? `<img src="${imageHref}">` : ''}
      ${links.map((href) => `<a href="${href}">Video</a>`).join('')}
      </main></body>`;
    return {
      suppliedPath: path,
      daBasePath: path,
      aemHref: `https://main--site--org.aem.page${path}`,
      content: writeVideoSelections(
        image ? writeSelections(content, [{ src: imageHref, translate: 'true' }]) : content,
        selected.map((src) => ({ src, translate: 'true' })),
      ),
    };
  }

  function languages(workflow = 'Product/Project') {
    return [
      { code: 'fr-FR', name: 'French', workflow, workflowName: 'MULTIMODAL' },
      { code: 'de-DE', name: 'German', workflow, workflowName: 'MULTIMODAL' },
    ];
  }

  async function send({ urls = [page('/page')], langs = languages(), preview = true } = {}) {
    await sendAllLanguages({
      org: 'org',
      site: 'site',
      title: 'Video test',
      service: { origin, clientid: 'client', ...(preview && { preview: 'preview.example' }) },
      langs,
      urls,
      actions,
    });
    return requests.filter(({ href }) => href.endsWith('/create')).map(({ body }) => body);
  }

  beforeEach(() => {
    resetPutUrlRateLimitGateForTests();
    localStorage.removeItem('glaas.log');
    requests = [];
    actions = { sendMessage: sinon.spy(), saveState: sinon.stub().resolves() };
    fetchStub = sinon.stub(window, 'fetch').callsFake(async (input, opts = {}) => {
      const href = String(input);
      const body = typeof opts.body === 'string' && opts.headers?.['Content-Type'] === 'application/json'
        ? JSON.parse(opts.body) : opts.body;
      requests.push({ href, opts, body });
      if (href.includes('/getPutURL')) {
        return new Response(JSON.stringify({ putURL: 'https://put.example/blob' }));
      }
      if (href.startsWith('https://put.example/')) return new Response('', { status: 200 });
      if (href.includes('/api/l10n/v2.0/') && href.endsWith('/create')) {
        return new Response('{}');
      }
      if (href.includes('/daloc/init-target')) return new Response('{}');
      if (href.startsWith(videoHref)) {
        return new Response(JSON.stringify({
          sources: [{ label: 'Medium', format: 'mpeg4', src: mp4, videoID: videoId }],
        }));
      }
      if (href.startsWith(brokenHref)) return new Response('', { status: 404 });
      if (href === imageHref || href.includes('/source/org/site/hero.jpg')) {
        return new Response(new Blob(['image'], { type: 'image/jpeg' }));
      }
      if (href.includes('translate.json')) {
        return new Response(JSON.stringify({ config: { data: [] } }));
      }
      if (href.includes('/.da/')) return new Response('', { status: 404 });
      if (href.includes('/nx2/') && new URL(href).pathname.endsWith('.css')) return new Response('');
      if (href.includes('/nx2/img/icons/')) {
        return new Response('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
      }
      throw new Error(`Unexpected request: ${href}`);
    });
  });

  afterEach(() => {
    document.querySelectorAll('nx-toast').forEach((toast) => toast.remove());
    sinon.restore();
    resetPutUrlRateLimitGateForTests();
  });

  it('sends VIDEO assets with callback config and keeps synthetic locales out of text/images and DA', async () => {
    const langs = languages();
    const [body] = await send({ urls: [page('/page', { image: true })], langs });
    expect(body.videoLocalizationWorkflow).to.equal('Caption_Only');
    expect(body.targetLocales).to.deep.equal(['fr-FR', 'de-DE']);
    const video = body.assets.find(({ type }) => type === 'VIDEO');
    langs.forEach((lang) => {
      const task = Object.values(lang.translation.workflowTasks)[0];
      expect(task.pageAssets['/page'].videos[0]).to.deep.equal({
        glaasName: video.name, videoId, originalUrls: [videoHref],
      });
      expect(task).not.to.have.property('videoAssets');
    });
    expect(video).to.deep.equal({
      type: 'VIDEO',
      name: `/page/${videoId}.mp4`,
      parentAsset: '/page.html',
      signedUrl: mp4,
      sourcePreviewUrl: videoHref,
      sourcePreviewUrlPage: 'https://main--site--org.aem.page/page',
      contentType: 'video/mp4',
      targetLocales: ['fr-FR', 'de-DE', 'en-x-cc'],
    });
    expect(body.assets.filter(({ type }) => type !== 'VIDEO').map(({ type }) => type))
      .to.deep.equal(['TEXT', 'IMAGE']);
    body.assets.filter(({ type }) => type !== 'VIDEO').forEach((asset) => {
      expect(asset.targetLocales).to.deep.equal(['fr-FR', 'de-DE']);
    });
    expect(body.config).to.deep.include({ key: 'businessUnit', value: 'Digital Media' });
    expect(body.config.some(({ key }) => key === 'dalocProjectKey')).to.be.true;
    expect(body.config.some(({ key }) => key === 'dalocVideoAssets')).to.be.false;
    expect(body.callbackConfig).to.have.length(2);
    expect(langs.map(({ code }) => code)).to.deep.equal(['fr-FR', 'de-DE']);
    expect(requests.find(({ href }) => href.includes('/daloc/init-target')).body.targetLocales)
      .to.deep.equal(['fr-FR', 'de-DE']);
    expect(langs.every((lang) => lang.translation.status === 'created')).to.be.true;
    expect(actions.sendMessage.getCalls().some(({ args }) => args[0]?.type === 'warning')).to.be.false;
  });

  it('reuses metadata across pages in one task and retains their separate asset paths', async () => {
    const [body] = await send({ urls: [page('/first'), page('/second')], preview: false });
    const videos = body.assets.filter(({ type }) => type === 'VIDEO');
    expect(videos.map(({ name }) => name)).to.deep.equal([
      `/first/${videoId}.mp4`, `/second/${videoId}.mp4`,
    ]);
    expect(requests.filter(({ href }) => href.startsWith(videoHref))).to.have.length(1);
    expect(body.config.some(({ key }) => key === 'dalocVideoAssets')).to.be.false;
  });

  it('collects failed videos across pages into one final warning and submits the successes', async () => {
    const [body] = await send({
      urls: [
        page('/first', { selected: [brokenHref, videoHref] }),
        page('/second', { selected: [brokenHref] }),
      ],
    });
    expect(body.assets.filter(({ type }) => type === 'TEXT')).to.have.length(2);
    expect(body.assets.filter(({ type }) => type === 'VIDEO')).to.have.length(1);
    const warnings = actions.sendMessage.getCalls().filter(({ args }) => args[0]?.type === 'warning');
    expect(warnings).to.have.length(1);
    expect(warnings[0].args[0].text).to.include('1 selected video(s)');
    expect(warnings[0].args[0].text).to.include(brokenHref);
    expect(warnings[0].args[0].text).to.include('HTTP 404');
    expect(actions.sendMessage.lastCall.args[0].type).to.equal('warning');
    const toasts = document.querySelectorAll('nx-toast');
    expect(toasts).to.have.length(1);
    expect(toasts[0].message).to.include(brokenHref);
    expect(toasts[0].duration).to.equal(null);
    expect(toasts[0].variant).to.equal('warning');
    actions.sendMessage({ text: 'Checking for languages to save' });
    expect(toasts[0].isConnected).to.be.true;
    await toasts[0].updateComplete;
    expect(toasts[0].shadowRoot.querySelector('[role="alert"]').textContent)
      .to.include(brokenHref);
    toasts[0].shadowRoot.querySelector('button[aria-label="Dismiss"]').click();
    expect(toasts[0].isConnected).to.be.false;
  });

  it('continues text-only submission when every selected video fails', async () => {
    const [body] = await send({ urls: [page('/page', { selected: [brokenHref] })] });
    expect(body.videoLocalizationWorkflow).to.equal(null);
    expect(body.targetLocales).to.deep.equal(['fr-FR', 'de-DE']);
    expect(body.assets.map(({ type }) => type)).to.deep.equal(['TEXT']);
    expect(body.config.some(({ key }) => key === 'dalocVideoAssets')).to.be.false;
    expect(actions.sendMessage.lastCall.args[0].type).to.equal('warning');
  });

  it('does not resolve unselected or stale video links', async () => {
    const removed = 'https://video.tv.adobe.com/v/3';
    const [body] = await send({
      urls: [page('/page', { selected: [removed], links: [videoHref] })],
    });
    expect(body.assets.map(({ type }) => type)).to.deep.equal(['TEXT']);
    expect(body.targetLocales).to.deep.equal(['fr-FR', 'de-DE']);
    expect(requests.some(({ href }) => href.includes('video.tv.adobe.com'))).to.be.false;
  });

  it('creates independent metadata caches for separate workflow tasks', async () => {
    const langs = [
      languages('Product/First')[0],
      languages('Product/Second')[1],
    ];
    const bodies = await send({ langs });
    expect(bodies).to.have.length(2);
    expect(requests.filter(({ href }) => href.startsWith(videoHref))).to.have.length(2);
    bodies.forEach((body) => {
      expect(body.assets.filter(({ type }) => type === 'VIDEO')).to.have.length(1);
    });
  });

  it('shows one combined warning across separate workflow tasks', async () => {
    const langs = [
      languages('Product/First')[0],
      languages('Product/Second')[1],
    ];
    const bodies = await send({ langs, urls: [page('/page', { selected: [brokenHref] })] });
    expect(bodies).to.have.length(2);
    const warnings = actions.sendMessage.getCalls().filter(({ args }) => args[0]?.type === 'warning');
    expect(warnings).to.have.length(1);
    expect(warnings[0].args[0].text).to.include('1 selected video(s)');
    expect(document.querySelectorAll('nx-toast')).to.have.length(1);
  });

  it('does not replace a task creation error with a success-shaped video warning', async () => {
    fetchStub.withArgs(
      sinon.match((href) => href.endsWith('/create')),
      sinon.match.any,
    ).resolves(new Response('{}', { status: 500 }));
    const langs = languages();
    await send({ langs, urls: [page('/page', { selected: [brokenHref] })] });
    expect(actions.sendMessage.lastCall.args[0].type).to.equal('error');
    expect(actions.sendMessage.lastCall.args[0].text).to.include('Error creating multimodal task');
    expect(actions.sendMessage.lastCall.args[0].text).to.include(brokenHref);
    expect(langs.every((lang) => lang.translation.error === 1)).to.be.true;
    expect(requests.some(({ href }) => href.includes('/daloc/init-target'))).to.be.false;
  });

  it('enables caption workflow only for actual VIDEO assets at task creation', async () => {
    await createMultimodalTask({
      origin,
      clientid: 'client',
      token: 'token',
      service: {},
      task: {
        name: 'no-video',
        workflow: 'Product/Project',
        workflowName: 'MULTIMODAL',
        targetLocales: ['fr-FR'],
        assets: [{ type: 'TEXT', name: '/page.html' }],
      },
    });
    const { body } = requests.find(({ href }) => href.endsWith('/create'));
    expect(body.videoLocalizationWorkflow).to.equal(null);
    expect(body.config.some(({ key }) => key === 'dalocVideoAssets')).to.be.false;
    expect(fetchStub.calledOnce).to.be.true;
  });
});
