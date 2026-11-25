import { expect } from '@esm-bundle/chai';
import CmaChatController from '../../../../nx2/blocks/chat-ao/cma-chat-controller.js';
import { CMA_BRIDGE_WS_BASE, CMA_BRIDGE_HTTP_BASE } from '../../../../nx2/blocks/chat-ao/cma/constants.js';
import { resetMockIms, setMockIms } from '../../mocks/ims.js';

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
  controller._fetchLatestSession = async () => null;
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

describe('cma-controller latest-session resume (Coworker parity)', () => {
  const HOUR = 60 * 60 * 1000;
  const ago = (ms) => new Date(Date.now() - ms).toISOString();

  beforeEach(reset);
  afterEach(reset);

  it('resumes the latest session on the site when this tab has none', async () => {
    const { controller } = makeController();
    controller._fetchLatestSession = async () => ({ id: 'sesn_latest', updated_at: ago(HOUR) });

    await controller.loadEpisodes();

    expect(controller._episodeId).to.equal('sesn_latest');
    expect(controller._resuming).to.equal(true);
    expect(controller._staleEpisode).to.equal(undefined);
  });

  it('prefers this tab\'s own pointer and never asks the bridge', async () => {
    sessionStorage.setItem('nx2:cma-episode:o/s', 'ep-tab');
    const { controller } = makeController();
    let asked = false;
    controller._fetchLatestSession = async () => {
      asked = true;
      return null;
    };

    await controller.loadEpisodes();

    expect(controller._episodeId).to.equal('ep-tab');
    expect(asked).to.equal(false);
  });

  it('offers a stale latest session instead of auto-resuming it', async () => {
    const { controller, updates } = makeController();
    const stale = { id: 'sesn_old', updated_at: ago(25 * HOUR) };
    controller._fetchLatestSession = async () => stale;

    await controller.loadEpisodes();

    expect(controller._episodeId).to.equal(undefined);
    expect(controller._resuming).to.not.equal(true);
    expect(updates.at(-1).staleEpisode).to.equal(stale);
  });

  it('starts fresh when the bridge has no latest session', async () => {
    const { controller, updates } = makeController();
    await controller.loadEpisodes();
    expect(controller._episodeId).to.equal(undefined);
    expect(updates.at(-1).staleEpisode).to.equal(undefined);
  });

  it('isolated sessions never look up or resume the latest session', async () => {
    const controller = new CmaChatController({ onUpdate: () => { }, isolated: true });
    controller.setContext({ org: 'o', site: 's' });
    let asked = false;
    controller._fetchLatestSession = async () => {
      asked = true;
      return { id: 'x', updated_at: ago(0) };
    };

    await controller.loadEpisodes();

    expect(asked).to.equal(false);
    expect(controller._episodeId).to.equal(undefined);
  });

  it('continuing a stale session clears the offer and resumes it', async () => {
    const { controller } = makeController();
    controller._staleEpisode = { id: 'sesn_old', updated_at: ago(25 * HOUR) };

    await controller.switchEpisode('sesn_old');

    expect(controller._episodeId).to.equal('sesn_old');
    expect(controller._staleEpisode).to.equal(undefined);
    expect(controller._resuming).to.equal(true);
  });

  it('does not switch away mid-turn', async () => {
    const { controller } = makeController();
    controller._episodeId = 'ep-1';
    controller._thinking = true;
    await controller.switchEpisode('ep-2');
    expect(controller._episodeId).to.equal('ep-1');
  });
});

describe('cma-controller _fetchLatestSession', () => {
  let origFetch;
  beforeEach(() => {
    reset();
    origFetch = window.fetch;
    setMockIms({ userId: 'u-1', projectedProductContext: [{ prodCtx: { owningEntity: 'ORG@AdobeOrg' } }] });
  });
  afterEach(() => {
    window.fetch = origFetch;
    reset();
  });

  const fresh = () => {
    const controller = new CmaChatController({ onUpdate: () => { } });
    controller.setContext({ org: 'acme', site: 'www' });
    return controller;
  };

  it('asks the CMA bridge for the caller\'s latest session on this site', async () => {
    let call;
    window.fetch = async (url, opts) => {
      call = { url: new URL(url), opts };
      return new Response(JSON.stringify({ session: { id: 'sesn_1', updated_at: '2026-11-25T10:00:00Z' } }));
    };

    const latest = await fresh()._fetchLatestSession();

    expect(latest).to.deep.equal({ id: 'sesn_1', updated_at: '2026-11-25T10:00:00Z' });
    expect(call.url.href.startsWith(CMA_BRIDGE_HTTP_BASE)).to.equal(true);
    expect(call.url.pathname).to.equal('/api/v1/sessions/latest');
    expect(call.url.searchParams.get('site')).to.equal('acme/www');
    expect(call.opts.headers['x-user-id']).to.equal('u-1');
    expect(call.opts.headers['x-tenant-id']).to.equal('ORG@AdobeOrg');
    expect(call.opts.headers.authorization).to.match(/^Bearer /);
  });

  it('returns null for a non-ok, malformed or failed response', async () => {
    window.fetch = async () => new Response('{}', { status: 404 });
    expect(await fresh()._fetchLatestSession()).to.equal(null);

    window.fetch = async () => new Response(JSON.stringify({ session: { id: 5 } }));
    expect(await fresh()._fetchLatestSession()).to.equal(null);

    window.fetch = async () => new Response(JSON.stringify({ session: null }));
    expect(await fresh()._fetchLatestSession()).to.equal(null);

    window.fetch = async () => { throw new TypeError('network'); };
    expect(await fresh()._fetchLatestSession()).to.equal(null);
  });
});
