import { expect } from '@esm-bundle/chai';
import {
  normalizePath,
  parseSheetRef,
  matchesPath,
  resolveSheetRules,
} from '../../../nx/blocks/loc/dnt/sheetRules.js';

describe('sheetRules normalizePath', () => {
  it('adds a leading slash', () => {
    expect(normalizePath('products/prices')).to.equal('/products/prices');
  });

  it('strips .json and .html extensions', () => {
    expect(normalizePath('/products/prices.json')).to.equal('/products/prices');
    expect(normalizePath('/products/prices.html')).to.equal('/products/prices');
  });

  it('strips trailing slashes and surrounding whitespace', () => {
    expect(normalizePath('  /products/prices//  ')).to.equal('/products/prices');
  });

  it('keeps other extensions', () => {
    expect(normalizePath('/products/prices.csv')).to.equal('/products/prices.csv');
  });
});

describe('sheetRules parseSheetRef', () => {
  it('returns a bare tab name unchanged', () => {
    expect(parseSheetRef('data')).to.deep.equal({ sheet: 'data' });
    expect(parseSheetRef('*')).to.deep.equal({ sheet: '*' });
  });

  it('passes non-string values through as the sheet', () => {
    expect(parseSheetRef(undefined)).to.deep.equal({ sheet: undefined });
    expect(parseSheetRef(5)).to.deep.equal({ sheet: 5 });
  });

  it('splits /path:tab', () => {
    expect(parseSheetRef('/products/prices:data'))
      .to.deep.equal({ path: '/products/prices', sheet: 'data' });
  });

  it('treats /path as all tabs', () => {
    expect(parseSheetRef('/products/prices')).to.deep.equal({ path: '/products/prices', sheet: '*' });
  });

  it('treats an empty tab after the colon as all tabs', () => {
    expect(parseSheetRef('/products/prices:')).to.deep.equal({ path: '/products/prices', sheet: '*' });
    expect(parseSheetRef('/products/prices:  ')).to.deep.equal({ path: '/products/prices', sheet: '*' });
  });

  it('splits at the last colon', () => {
    expect(parseSheetRef('/a:b/c:data')).to.deep.equal({ path: '/a:b/c', sheet: 'data' });
  });

  it('trims whitespace and normalizes the path', () => {
    expect(parseSheetRef('  /products/prices.json : data '))
      .to.deep.equal({ path: '/products/prices', sheet: 'data' });
  });
});

describe('sheetRules matchesPath', () => {
  it('returns false when no document path is supplied', () => {
    expect(matchesPath('/products/prices')).to.be.false;
    expect(matchesPath('/products/prices', '')).to.be.false;
  });

  it('matches regardless of extension, leading slash, or trailing slash', () => {
    expect(matchesPath('/products/prices', '/products/prices.json')).to.be.true;
    expect(matchesPath('/products/prices', '/products/prices.html')).to.be.true;
    expect(matchesPath('/products/prices', 'products/prices')).to.be.true;
  });

  it('is anchored', () => {
    expect(matchesPath('/products/prices', '/products/prices-old.json')).to.be.false;
    expect(matchesPath('/products/prices', '/en/products/prices.json')).to.be.false;
  });

  it('is case sensitive', () => {
    expect(matchesPath('/products/prices', '/Products/Prices.json')).to.be.false;
  });

  it('expands * to any characters, including slashes', () => {
    expect(matchesPath('/products/*', '/products/a/b.json')).to.be.true;
    expect(matchesPath('/*/prices', '/products/prices.json')).to.be.true;
    expect(matchesPath('/products/*', '/other/a.json')).to.be.false;
  });

  it('treats regex characters in the rule literally', () => {
    expect(matchesPath('/a.b', '/aXb.json')).to.be.false;
    expect(matchesPath('/a.b', '/a.b.json')).to.be.true;
    expect(matchesPath('/a+b(1)', '/a+b(1).json')).to.be.true;
    expect(matchesPath('/a+b(1)', '/aab(1).json')).to.be.false;
    expect(matchesPath('/[x]', '/x.json')).to.be.false;
  });
});

describe('sheetRules resolveSheetRules', () => {
  const base = {
    dntSheets: ['global-tab'],
    dntSheetToColumns: new Map([['data', ['sku']]]),
    dntUniversalColumns: ['id'],
    dntPathRules: [],
  };

  it('returns empty rules for an undefined config', () => {
    expect(resolveSheetRules(undefined, '/a')).to.deep.equal({
      sheets: [],
      sheetToColumns: new Map(),
      universalColumns: [],
      allSheets: false,
    });
  });

  it('returns the global rules when no path rule matches', () => {
    const config = { ...base, dntPathRules: [{ path: '/other', sheet: '*', columns: '*' }] };
    const result = resolveSheetRules(config, '/a.json');
    expect(result.sheets).to.deep.equal(['global-tab']);
    expect(result.sheetToColumns).to.deep.equal(new Map([['data', ['sku']]]));
    expect(result.universalColumns).to.deep.equal(['id']);
    expect(result.allSheets).to.be.false;
  });

  it('does not mutate the parsed config', () => {
    const config = {
      ...base,
      dntPathRules: [{ path: '/a', sheet: 'data', columns: ['title'] }],
    };
    resolveSheetRules(config, '/a.json');
    expect(config.dntSheetToColumns.get('data')).to.deep.equal(['sku']);
    expect(config.dntSheets).to.deep.equal(['global-tab']);
  });

  it('sets allSheets for a path rule with all tabs and all columns', () => {
    const config = { ...base, dntPathRules: [{ path: '/a', sheet: '*', columns: '*' }] };
    expect(resolveSheetRules(config, '/a.json').allSheets).to.be.true;
  });

  it('sets allSheets for a bare * tab with all columns', () => {
    const config = { ...base, dntSheets: ['*'] };
    expect(resolveSheetRules(config).allSheets).to.be.true;
  });

  it('adds a named tab for a path rule with all columns', () => {
    const config = { ...base, dntPathRules: [{ path: '/a', sheet: 'other', columns: '*' }] };
    expect(resolveSheetRules(config, '/a.json').sheets).to.deep.equal(['global-tab', 'other']);
  });

  it('adds universal columns for a path rule with a column list on all tabs', () => {
    const config = { ...base, dntPathRules: [{ path: '/a', sheet: '*', columns: ['name'] }] };
    expect(resolveSheetRules(config, '/a.json').universalColumns).to.deep.equal(['id', 'name']);
  });

  it('appends path columns to an existing global entry for the same tab', () => {
    const config = { ...base, dntPathRules: [{ path: '/a', sheet: 'data', columns: ['title'] }] };
    expect(resolveSheetRules(config, '/a.json').sheetToColumns.get('data'))
      .to.deep.equal(['sku', 'title']);
  });

  it('combines several path rules that match one document', () => {
    const config = {
      ...base,
      dntPathRules: [
        { path: '/a', sheet: 'data', columns: ['title'] },
        { path: '/*', sheet: 'data', columns: ['desc'] },
        { path: '/b', sheet: 'data', columns: ['nope'] },
      ],
    };
    expect(resolveSheetRules(config, '/a.json').sheetToColumns.get('data'))
      .to.deep.equal(['sku', 'title', 'desc']);
  });

  it('tolerates a config without dntPathRules', () => {
    const rest = { ...base, dntPathRules: undefined };
    expect(resolveSheetRules(rest, '/a.json').sheets).to.deep.equal(['global-tab']);
  });
});
