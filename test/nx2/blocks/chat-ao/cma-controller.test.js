import { expect } from '@esm-bundle/chai';
import CmaChatController from '../../../../nx2/blocks/chat-ao/cma-chat-controller.js';
import { CMA_BRIDGE_WS_BASE, CMA_BRIDGE_HTTP_BASE } from '../../../../nx2/blocks/chat-ao/ao-constants.js';
import { resetMockIms, setMockIms } from '../../../../nx2/test/mocks/ims.js';

function reset() {
  sessionStorage.clear();
  resetMockIms();
}

function makeController({ context = { org: 'o', site: 's' } } = {}) {
  const updates = [];
  const sent = [];
  const controller = new CmaChatController({ onUpdate: (u) => updates.push(u) });
  controller.setContext(context);
  // Keep tests off the network/socket.
  controller._ensureSocket = async () => { };
  controller._attach = async () => { };
  controller._resolveManifest = async () => ({ manifestId: 'experience-workspace', debugMode: false });
  controller._ws = { send: (msg) => sent.push(JSON.parse(msg)), close: () => { } };
  return { controller, updates, sent };
}

describe('cma-controller connection', () => {
  beforeEach(reset);
  afterEach(reset);

  it('routes the socket to the CMA bridge and carries x-site, no activation key', async () => {
    const { controller } = makeController({ context: { org: 'acme', site: 'www' } });

    const { authFrame, wsBase } = await controller._connectionInfo();

    expect(wsBase).to.equal(CMA_BRIDGE_WS_BASE);
    expect(authFrame).to.not.have.property('activationKey');
    expect(authFrame['x-site']).to.equal('acme/www');
    expect(authFrame.type).to.equal('AUTH');
  });

  it('does not advertise an A2UI component catalog on a new session', async () => {
    const { controller, sent } = makeController();

    await controller.sendMessage('hello bridge');

    expect(sent[0].type).to.equal('USER_INPUT');
    expect(sent[0]).to.not.have.property('catalogUrl');
  });
});

describe('cma-controller reload resume', () => {
  beforeEach(reset);
  afterEach(reset);

  it('persists the episode id per site on session-ready', () => {
    const { controller } = makeController({ context: { org: 'o', site: 's' } });
    controller._onSessionReady({ episode_id: 'ep-123' });
    expect(controller._episodeId).to.equal('ep-123');
    expect(sessionStorage.getItem('nx2:cma-episode:o/s')).to.equal('ep-123');
    expect(controller._resuming).to.equal(false);
  });

  it('keeps per-site pointers isolated', () => {
    const { controller } = makeController({ context: { org: 'o', site: 's1' } });
    controller._onSessionReady({ episode_id: 'ep-1' });
    controller.setContext({ org: 'o', site: 's2' });
    expect(controller._restoreEpisodeId()).to.equal(undefined);
  });

  it('resumes the stored session (no REST list) and marks the attempt', async () => {
    sessionStorage.setItem('nx2:cma-episode:o/s', 'ep-stored');
    const { controller } = makeController({ context: { org: 'o', site: 's' } });

    await controller.loadEpisodes();

    expect(controller._resuming).to.equal(true);
    expect(controller._episodeId).to.equal('ep-stored');
    expect(controller._messages).to.deep.equal([]);
  });

  it('does nothing special when there is no stored session', async () => {
    const { controller } = makeController({ context: { org: 'o', site: 's' } });
    await controller.loadEpisodes();
    expect(controller._resuming).to.not.equal(true);
    expect(controller._episodeId).to.equal(undefined);
  });

  it('drops a rejected resume pointer and starts fresh', async () => {
    sessionStorage.setItem('nx2:cma-episode:o/s', 'ep-dead');
    const { controller } = makeController({ context: { org: 'o', site: 's' } });
    await controller.loadEpisodes();
    expect(controller._resuming).to.equal(true);

    controller._onSessionError({ data: { message: 'gone' } });

    expect(controller._resuming).to.equal(false);
    expect(sessionStorage.getItem('nx2:cma-episode:o/s')).to.equal(null);
    expect(controller._episodeId).to.equal(undefined);
  });

  it('clears the resume pointer on an explicit new session', () => {
    sessionStorage.setItem('nx2:cma-episode:o/s', 'ep-old');
    const { controller } = makeController({ context: { org: 'o', site: 's' } });
    controller.startNewEpisode();
    expect(sessionStorage.getItem('nx2:cma-episode:o/s')).to.equal(null);
  });
});

describe('cma-controller attachments', () => {
  function installUploadFetch(routes) {
    const calls = [];
    const origFetch = window.fetch;
    window.fetch = async (url, opts = {}) => {
      calls.push({ url: url.toString(), opts });
      const route = routes.find((r) => r.match(url.toString(), opts));
      if (!route) throw new Error(`unexpected fetch: ${url}`);
      return new Response(JSON.stringify(route.body ?? {}), { status: route.status ?? 200 });
    };
    return { calls, restore: () => { window.fetch = origFetch; } };
  }

  beforeEach(() => {
    reset();
    setMockIms({
      projectedProductContext: [{ prodCtx: { owningEntity: 'tenant-123' } }],
    });
  });
  afterEach(reset);

  it('uploads an attachment to the CMA bridge files endpoint before sending', async () => {
    const { calls, restore } = installUploadFetch([
      {
        match: (url, opts) => url === `${CMA_BRIDGE_HTTP_BASE}/api/v1/files` && opts.method === 'POST',
        body: [{ id: 'file_1', filename: 'brief.pdf', mime_type: 'application/pdf' }],
        status: 201,
      },
    ]);
    const { controller, sent } = makeController();

    try {
      await controller.sendMessage('here is the brief', [], [
        { id: 'b1', fileName: 'brief.pdf', mediaType: 'application/pdf', dataBase64: btoa('brief-bytes') },
      ]);
    } finally {
      restore();
    }

    expect(sent[0].text).to.equal('here is the brief');
    expect(sent[0].attachments).to.deep.equal(['file_1']);
    expect(calls[0].opts.headers.authorization).to.equal('Bearer test-token');
    expect(calls[0].opts.headers['x-tenant-id']).to.equal('tenant-123');
  });

  it('prepends failed-upload text and omits attachments when bridge upload fails', async () => {
    const { restore } = installUploadFetch([
      {
        match: (url, opts) => url === `${CMA_BRIDGE_HTTP_BASE}/api/v1/files` && opts.method === 'POST',
        status: 502,
        body: { error: 'upload failed' },
      },
    ]);
    const { controller, sent } = makeController();

    try {
      await controller.sendMessage('please review', [], [
        { id: 'b2', fileName: 'brief.pdf', mediaType: 'application/pdf', dataBase64: btoa('brief-bytes') },
      ]);
    } finally {
      restore();
    }

    expect(sent[0].text).to.equal('[Attachments]\n- Attached file: brief.pdf — upload failed\nplease review');
    expect(sent[0]).to.not.have.property('attachments');
  });
});

describe('cma-controller error surfacing', () => {
  beforeEach(reset);
  afterEach(reset);

  it('stays silent on an idle error (no active turn)', () => {
    const { controller } = makeController();
    controller._onSessionError({ data: { message: 'idle' } });
    expect(controller._messages).to.deep.equal([]);
  });

  it('maps a not-provisioned error to tester-facing copy during a turn', () => {
    const { controller } = makeController();
    controller._thinking = true; // active turn => _blockedByActiveTurn
    controller._onSessionError({ data: { message: 'Tenant acme is not provisioned for the required product' } });
    const last = controller._messages.at(-1);
    expect(last.content).to.contain('isn\'t provisioned for the alternate assistant');
  });
});

describe('cma-controller ATTACH replayHistory flag (claudebridge PR #230)', () => {
  beforeEach(reset);
  afterEach(reset);

  // Warm reconnect must signal replayHistory:false (still holds its transcript).
  it('_attachFrame requests replay when the transcript is empty (cold resume)', () => {
    const { controller } = makeController();
    controller._messages = [];
    expect(controller._attachFrame()).to.deep.equal({ type: 'ATTACH', replayHistory: true });
  });

  it('_attachFrame declines replay when the transcript is non-empty (warm reconnect)', () => {
    const { controller } = makeController();
    controller._messages = [{ role: 'user', content: 'hi' }];
    expect(controller._attachFrame()).to.deep.equal({ type: 'ATTACH', replayHistory: false });
  });

  it('_attach actually sends the replayHistory flag over the socket', async () => {
    const { controller, sent } = makeController();
    // Use the real _attach (the harness stubs it by default).
    delete controller._attach;
    controller._ensureSocket = async () => { };
    controller._messages = [{ role: 'user', content: 'hi' }];
    await controller._attach();
    expect(sent.at(-1)).to.deep.equal({ type: 'ATTACH', replayHistory: false });
  });

  it('_loadEpisode clears the transcript so the subsequent attach requests replay', async () => {
    const { controller } = makeController();
    controller._messages = [{ role: 'user', content: 'old' }];
    let framesAtAttach;
    controller._ensureSocket = async () => { };
    controller._attach = async () => { framesAtAttach = controller._attachFrame(); };
    await controller._loadEpisode('episode-1');
    expect(framesAtAttach).to.deep.equal({ type: 'ATTACH', replayHistory: true });
  });
});
