import { expect } from '@esm-bundle/chai';
import { getAoSession } from '../../../../nx2/blocks/chat-ao/session.js';

describe('lazy AO session controllers', () => {
  let context;
  let releases;
  let controllers;
  let episodeLoads;
  let skillLoads;

  const subscribe = (session, owner) => {
    const release = session.subscribe(owner, {
      onUpdate: () => {
        const { controller } = session;
        if (!controller || controllers.has(controller)) return;
        controllers.add(controller);
        if (controller.checkAccess) controller.checkAccess = async () => true;
        controller.loadEpisodes = async () => {
          episodeLoads += 1;
          controller._update();
        };
        controller.loadSkills = async () => { skillLoads += 1; };
      },
    });
    releases.push(release);
    return release;
  };

  beforeEach(() => {
    context = { org: crypto.randomUUID(), site: 'site' };
    releases = [];
    controllers = new Set();
    episodeLoads = 0;
    skillLoads = 0;
  });

  afterEach(() => {
    releases.forEach((release) => release());
  });

  it('loads only CMA and shares its pending controller between compact and full owners', async () => {
    const compact = document.createElement('nx-ao-input');
    const full = document.createElement('nx-chat-ao');
    const session = getAoSession({ context, owner: compact, harness: 'cma' });
    subscribe(session, compact);
    expect(session.controller).to.equal(undefined);
    expect(session.canSend()).to.equal(false);
    const shared = getAoSession({ context, owner: full, harness: 'cma' });
    subscribe(shared, full);
    expect(shared).to.equal(session);
    await shared.ready;
    expect(session.controller.constructor.name).to.equal('CmaChatController');
    expect(controllers.size).to.equal(1);
    expect(episodeLoads).to.equal(1);
    expect(skillLoads).to.equal(1);
    expect(session.canSend()).to.equal(true);
    const requests = performance.getEntriesByType('resource').map(({ name }) => name);
    expect(requests.some((href) => href.includes('/chat-ao/cma/controller.js'))).to.equal(true);
    expect(requests.some((href) => href.includes('/chat-ao/coworker/controller.js'))).to.equal(false);
  });

  it('loads Coworker by default', async () => {
    const owner = document.createElement('nx-chat-ao');
    const session = getAoSession({ context, owner });
    subscribe(session, owner);
    await session.ready;
    expect(session.controller.constructor.name).to.equal('CoworkerChatController');
    expect(session.canSend()).to.equal(true);
    expect(episodeLoads).to.equal(1);
    expect(skillLoads).to.equal(1);
  });

  it('does not construct or initialize a controller when its last owner leaves during import', async () => {
    const owner = document.createElement('nx-chat-ao');
    const session = getAoSession({ context, owner });
    const release = subscribe(session, owner);
    await Promise.resolve();
    expect(session.controller).to.equal(undefined);
    release();
    await session.ready;
    expect(session.controller).to.equal(undefined);
    expect(controllers.size).to.equal(0);
    expect(episodeLoads).to.equal(0);
    expect(skillLoads).to.equal(0);
    expect(session.canQueueAutoSend()).to.equal(false);
  });
});
