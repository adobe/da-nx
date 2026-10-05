import { expect } from '@esm-bundle/chai';
import { sheet2object, object2sheet } from '../../../nx2/utils/utils.js';

describe('sheet2object', () => {
  it('converts a single-sheet doc to a simple object', () => {
    const sheet = {
      total: 1,
      limit: 1,
      offset: 0,
      data: [{ title: 'Foo', path: '/path.html' }],
      ':colWidths': [50, 50],
      ':sheetname': 'library',
      ':type': 'sheet',
    };
    expect(sheet2object(sheet)).to.deep.equal({
      library: [{ title: 'Foo', path: '/path.html' }],
    });
  });

  it('converts a multi-sheet doc to a simple object', () => {
    const sheet = {
      ':type': 'multi-sheet',
      ':names': ['library', 'permissions'],
      library: { total: 1, limit: 1, offset: 0, data: [{ title: 'Foo' }] },
      permissions: { total: 1, limit: 1, offset: 0, data: [{ email: 'a@b.com' }] },
    };
    expect(sheet2object(sheet)).to.deep.equal({
      library: [{ title: 'Foo' }],
      permissions: [{ email: 'a@b.com' }],
    });
  });

  it('uses a subsheet\'s own :sheetname to override its :names entry', () => {
    const sheet = {
      ':type': 'multi-sheet',
      ':names': ['sheet1'],
      sheet1: {
        total: 1, limit: 1, offset: 0, data: [{ title: 'Foo' }], ':sheetname': 'library',
      },
    };
    expect(sheet2object(sheet)).to.deep.equal({ library: [{ title: 'Foo' }] });
  });

  it('passes through non-sheet input unchanged', () => {
    expect(sheet2object(null)).to.equal(null);
    expect(sheet2object({ foo: 'bar' })).to.deep.equal({ foo: 'bar' });
  });
});

describe('object2sheet', () => {
  it('converts a single-key object to a single-sheet doc', () => {
    const obj = { library: [{ title: 'Foo', path: '/path.html' }] };
    expect(object2sheet(obj)).to.deep.equal({
      total: 1,
      limit: 1,
      offset: 0,
      data: [{ title: 'Foo', path: '/path.html' }],
      ':sheetname': 'library',
      ':type': 'sheet',
    });
  });

  it('converts a multi-key object to a multi-sheet doc', () => {
    const obj = {
      library: [{ title: 'Foo' }],
      permissions: [{ email: 'a@b.com' }],
    };
    expect(object2sheet(obj)).to.deep.equal({
      ':type': 'multi-sheet',
      ':names': ['library', 'permissions'],
      library: { total: 1, limit: 1, offset: 0, data: [{ title: 'Foo' }] },
      permissions: { total: 1, limit: 1, offset: 0, data: [{ email: 'a@b.com' }] },
    });
  });

  it('round-trips through sheet2object', () => {
    const obj = { library: [{ title: 'Foo' }], permissions: [{ email: 'a@b.com' }] };
    expect(sheet2object(object2sheet(obj))).to.deep.equal(obj);
  });
});
