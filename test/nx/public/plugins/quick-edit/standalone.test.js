import { expect } from '@esm-bundle/chai';
import {
  getQuickEditPortalSrc,
  getQuickEditPreviewSrc,
  getStandaloneConfig,
  isStandaloneShell,
  relayControllerMessage,
} from '../../../../../nx/public/plugins/quick-edit/src/standalone.js';

describe('standalone quick-edit shell', () => {
  it('uses the aem.page document as the standalone shell', () => {
    expect(isStandaloneShell('https://main--site--org.aem.page/path?quick-edit=on')).to.equal(true);
    expect(isStandaloneShell(
      'https://main--site--org.preview.da.live/path?quick-edit=on',
    )).to.equal(false);
    expect(isStandaloneShell(
      'https://main--site--org.aem.page/path?quick-edit=on&controller=parent',
    )).to.equal(false);
  });

  it('reuses the existing portal page for cookie bootstrap', () => {
    expect(getQuickEditPortalSrc(
      'https://main--site--org.aem.page/path?quick-edit=on',
      { bootstrap: true },
    )).to.equal('https://da.live/plugins/quick-edit?controller=bootstrap');
  });

  it('preserves a quick-edit branch when bootstrapping the portal', () => {
    expect(getQuickEditPortalSrc(
      'https://main--site--org.aem.page/path?quick-edit=feature%2Fqe',
      { bootstrap: true },
    )).to.equal(
      'https://main--da-live--adobe.aem.live/plugins/quick-edit?nx=feature%2Fqe&controller=bootstrap',
    );
  });

  it('builds an embedded controller=parent preview URL', () => {
    expect(getQuickEditPreviewSrc(
      'https://main--site--org.aem.page/path?quick-edit=feature%2Fqe#section',
    )).to.equal(
      'https://main--site--org.preview.da.live/path?quick-edit=feature%2Fqe&controller=parent#section',
    );
  });

  it('preserves standalone write behavior without changing explicit permissions', () => {
    expect(getStandaloneConfig({ mountpoint: '/org/site' })).to.deep.equal({
      mountpoint: '/org/site',
      canWrite: true,
    });
    expect(getStandaloneConfig({ mountpoint: '/org/site', canWrite: false })).to.deep.equal({
      mountpoint: '/org/site',
      canWrite: false,
    });
  });

  it('queues messages until the receiving controller is ready', () => {
    const posted = [];
    const source = {
      initialized: false,
      port: { postMessage: (data) => posted.push(['source', data]) },
      queue: [{ type: 'set-body' }],
    };
    const target = {
      initialized: false,
      port: { postMessage: (data) => posted.push(['target', data]) },
      queue: [],
    };

    relayControllerMessage({ data: { type: 'ready' }, source, target });

    expect(source.initialized).to.equal(true);
    expect(source.queue).to.deep.equal([]);
    expect(target.queue).to.deep.equal([{ type: 'ready' }]);
    expect(posted).to.deep.equal([['source', { type: 'set-body' }]]);
  });
});
