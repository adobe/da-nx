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

  it('uses the configured DA deployment for the portal and forwards its origin', () => {
    const href = 'https://main--site--org.aem.page/path?quick-edit=feature&da-origin=https%3A%2F%2Fauthor.example';
    const portalUrl = new URL(getQuickEditPortalSrc(href, { bootstrap: true }));
    expect(portalUrl.origin).to.equal('https://author.example');
    expect(portalUrl.pathname).to.equal('/plugins/quick-edit');
    expect(portalUrl.searchParams.get('nx')).to.equal('feature');
    expect(portalUrl.searchParams.get('da-origin')).to.equal('https://author.example');
    expect(portalUrl.searchParams.get('controller')).to.equal('bootstrap');
    const previewUrl = new URL(getQuickEditPreviewSrc(href));
    expect(previewUrl.searchParams.get('da-origin')).to.equal('https://author.example');
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
