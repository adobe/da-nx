import { expect } from '@esm-bundle/chai';
import {
  hashStateToPathSegments,
  resolveBreadcrumbHref,
  pathSegmentsToCrumbs,
} from '../../../../../nx2/blocks/shared/breadcrumb/utils.js';

describe('hashStateToPathSegments', () => {
  it('returns undefined when state is null', () => {
    expect(hashStateToPathSegments(null)).to.be.undefined;
  });

  it('returns undefined when org is missing', () => {
    expect(hashStateToPathSegments({ site: 's' })).to.be.undefined;
  });

  it('returns undefined when site is missing', () => {
    expect(hashStateToPathSegments({ org: 'o' })).to.be.undefined;
  });

  it('returns [org, site] when path is absent', () => {
    expect(hashStateToPathSegments({ org: 'o', site: 's' })).to.deep.equal(['o', 's']);
  });

  it('returns [org, site] when path is empty string', () => {
    expect(hashStateToPathSegments({ org: 'o', site: 's', path: '' })).to.deep.equal(['o', 's']);
  });

  it('strips leading slash so no empty segment is produced', () => {
    expect(hashStateToPathSegments({ org: 'o', site: 's', path: '/a/b' })).to.deep.equal(['o', 's', 'a', 'b']);
  });

  it('splits path into individual segments', () => {
    expect(hashStateToPathSegments({ org: 'o', site: 's', path: 'a/b/c' })).to.deep.equal(['o', 's', 'a', 'b', 'c']);
  });
});

describe('resolveBreadcrumbHref', () => {
  it('returns hash as-is when no baseUrl is given', () => {
    expect(resolveBreadcrumbHref({ hash: '#/o/s' })).to.equal('#/o/s');
  });

  it('prepends # when hash has no leading #', () => {
    expect(resolveBreadcrumbHref({ hash: '/o/s' })).to.equal('#/o/s');
  });

  it('resolves to an absolute URL with the correct pathname and hash', () => {
    const result = resolveBreadcrumbHref({ baseUrl: '/tools/nav', hash: '#/o/s' });
    const u = new URL(result);
    expect(u.pathname).to.equal('/tools/nav');
    expect(u.hash).to.equal('#/o/s');
  });

  it('carries the current page search params into the resolved URL', () => {
    const original = window.location.search;
    history.pushState(null, '', `${window.location.pathname}?view=list`);
    try {
      const result = resolveBreadcrumbHref({ baseUrl: '/tools/nav', hash: '#/o/s' });
      expect(new URL(result).search).to.equal('?view=list');
    } finally {
      history.pushState(null, '', window.location.pathname + original);
    }
  });
});

describe('pathSegmentsToCrumbs', () => {
  it('returns [] for an empty array', () => {
    expect(pathSegmentsToCrumbs([])).to.deep.equal([]);
  });

  it('returns [] for non-array input', () => {
    expect(pathSegmentsToCrumbs(null)).to.deep.equal([]);
    expect(pathSegmentsToCrumbs('string')).to.deep.equal([]);
  });

  it('single segment produces one crumb with empty href', () => {
    expect(pathSegmentsToCrumbs(['org'])).to.deep.equal([{ label: 'org', href: '' }]);
  });

  it('two segments: first links to #/first, second is the current page', () => {
    const [first, current] = pathSegmentsToCrumbs(['org', 'site']);
    expect(first).to.deep.equal({ label: 'org', href: '#/org' });
    expect(current).to.deep.equal({ label: 'site', href: '' });
  });

  it('builds cumulative hash paths for intermediate crumbs', () => {
    const crumbs = pathSegmentsToCrumbs(['org', 'site', 'folder']);
    expect(crumbs[0].href).to.equal('#/org');
    expect(crumbs[1].href).to.equal('#/org/site');
    expect(crumbs[2].href).to.equal('');
  });

  it('non-final hrefs are absolute URLs when baseUrl is given', () => {
    const [first, last] = pathSegmentsToCrumbs(['org', 'site'], { baseUrl: '/tools/nav' });
    const u = new URL(first.href);
    expect(u.pathname).to.equal('/tools/nav');
    expect(u.hash).to.equal('#/org');
    expect(last.href).to.equal('');
  });
});
