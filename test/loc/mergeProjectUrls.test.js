import { expect } from '@esm-bundle/chai';
import { mergeProjectUrls } from '../../nx/blocks/loc/loc.js';

describe('mergeProjectUrls', () => {
  it('merges requestIds instead of replacing the url entry', () => {
    const existing = [
      { basePath: '/page.html', suppliedPath: '/page', requestIds: { 'fr-CA': 'req-fr-ca' } },
    ];
    const incoming = [
      { basePath: '/page.html', suppliedPath: '/page', requestIds: { 'es-MX': 'req-es-mx' } },
    ];

    const merged = mergeProjectUrls({ existingUrls: existing, incomingUrls: incoming });

    expect(merged).to.have.length(1);
    expect(merged[0].requestIds).to.deep.equal({ 'fr-CA': 'req-fr-ca', 'es-MX': 'req-es-mx' });
  });

  it('keeps urls only present in the existing array', () => {
    const existing = [
      { basePath: '/a.html', requestIds: { 'fr-FR': 'req-a-fr' } },
      { basePath: '/b.html', requestIds: { 'fr-FR': 'req-b-fr' } },
    ];
    const incoming = [
      { basePath: '/a.html', requestIds: { 'fr-CA': 'req-a-fr-ca' } },
    ];

    const merged = mergeProjectUrls({ existingUrls: existing, incomingUrls: incoming });

    expect(merged).to.have.length(2);
    expect(merged.find((url) => url.basePath === '/a.html').requestIds).to.deep.equal({
      'fr-FR': 'req-a-fr',
      'fr-CA': 'req-a-fr-ca',
    });
    expect(merged.find((url) => url.basePath === '/b.html').requestIds).to.deep.equal({ 'fr-FR': 'req-b-fr' });
  });

  it('adds urls only present in the incoming array', () => {
    const existing = [{ basePath: '/a.html' }];
    const incoming = [{ basePath: '/a.html' }, { basePath: '/b.html' }];

    const merged = mergeProjectUrls({ existingUrls: existing, incomingUrls: incoming });

    expect(merged.map((url) => url.basePath)).to.have.members(['/a.html', '/b.html']);
  });

  it('falls back to suppliedPath when basePath is absent', () => {
    const existing = [{ suppliedPath: '/page', requestIds: { 'fr-FR': 'req-fr' } }];
    const incoming = [{ suppliedPath: '/page', requestIds: { 'de-DE': 'req-de' } }];

    const merged = mergeProjectUrls({ existingUrls: existing, incomingUrls: incoming });

    expect(merged).to.have.length(1);
    expect(merged[0].requestIds).to.deep.equal({ 'fr-FR': 'req-fr', 'de-DE': 'req-de' });
  });

  it('treats a missing existing urls array as empty', () => {
    const incoming = [{ basePath: '/a.html' }];
    const merged = mergeProjectUrls({ existingUrls: undefined, incomingUrls: incoming });
    expect(merged).to.deep.equal(incoming);
  });
});
