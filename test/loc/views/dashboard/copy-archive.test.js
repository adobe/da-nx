import { expect } from '@esm-bundle/chai';
import { copyProject, archiveProject } from '../../../../nx/blocks/loc/views/dashboard/index.js';

const project = { path: '/org/site/.da/translation/active/1' };

describe('dashboard copy and archive', () => {
  let origFetch;

  const respondWith = (status) => {
    window.fetch = async (url, opts = {}) => {
      if ((opts.method || 'GET') === 'GET') {
        return new Response(JSON.stringify({ title: 'Proj', langs: [] }), { status: 200 });
      }
      return new Response(null, { status });
    };
  };

  beforeEach(() => { origFetch = window.fetch; });
  afterEach(() => { window.fetch = origFetch; });

  it('reports a failed copy as an error', async () => {
    respondWith(403);
    const error = await copyProject(project, 'me@example.com').then(() => undefined, (e) => e);
    expect(error?.message).to.equal('Copy failed (403)');
  });

  it('reports a failed archive as an error', async () => {
    respondWith(403);
    const error = await archiveProject(project).then(() => undefined, (e) => e);
    expect(error?.message).to.equal('Archive failed (403)');
  });

  it('returns the new paths when copy and archive work', async () => {
    respondWith(201);
    const { path, newProject } = await copyProject(project, 'me@example.com');
    expect(path).to.match(/^\/org\/site\/\.da\/translation\/active\/\d+$/);
    expect(newProject.title).to.equal('Proj-copy');
    respondWith(204);
    expect(await archiveProject(project)).to.equal('/org/site/.da/translation/archive/1');
  });
});
