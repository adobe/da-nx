import sinon from 'sinon';
import { source } from '../../../../../nx2/utils/api.js';

// Backs the nx2 source API with in-memory files; call restore() when done.
export default function installMemorySource(initial = {}, {
  failWrites = [], failReads = [], failLists = [], permissions,
} = {}) {
  const files = new Map(Object.entries(initial));
  const calls = [];
  const listItems = (path) => {
    const prefix = `${path}/`;
    const items = new Map();
    [...files.keys()].filter((key) => key.startsWith(prefix)).forEach((key) => {
      const [first, ...rest] = key.slice(prefix.length).split('/');
      const [name, ext] = rest.length ? [first] : first.split('.');
      items.set(first, { name, ext, path: rest.length ? `${prefix}${first}` : key });
    });
    return [...items.values()];
  };
  const stubs = [
    sinon.stub(source, 'list').callsFake(async (path) => {
      calls.push(['list', path]);
      if (failLists.includes(path)) return { ok: false, items: [] };
      return { ok: true, items: listItems(path), permissions };
    }),
    sinon.stub(source, 'get').callsFake(async (path) => {
      calls.push(['read', path]);
      if (failReads.includes(path)) return new Response('', { status: 500 });
      return files.has(path)
        ? new Response(files.get(path), { status: 200 })
        : new Response('', { status: 404 });
    }),
    sinon.stub(source, 'save').callsFake(async (path, { body }) => {
      calls.push(['write', path]);
      if (failWrites.includes(path)) return new Response(null, { status: 500 });
      files.set(path, body);
      return new Response(null, { status: 201 });
    }),
    sinon.stub(source, 'delete').callsFake(async (path) => {
      calls.push(['remove', path]);
      if (!files.has(path)) return new Response(null, { status: 404 });
      files.delete(path);
      return new Response(null, { status: 204 });
    }),
  ];
  return { files, calls, restore: () => stubs.forEach((stub) => stub.restore()) };
}
