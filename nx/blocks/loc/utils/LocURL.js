import { getSuppliedPrefix } from './utils.js';

export default class LocURL {
  constructor(href) {
    this.supplied = this._href2Supplied(href);
    this.org = this.supplied.org;
    this.site = this.supplied.site;
    this.views = this._getViews();
  }

  async getSuppliedPrefix() {
    const { org, site } = this;
    const { aemAdminPath } = this.supplied;
    this.suppliedPrefix ??= await getSuppliedPrefix(org, site, aemAdminPath);
    return this.suppliedPrefix;
  }

  _getViews() {
    const { daPath, aemPath, aemReviewPath, snapshot } = this.supplied;
    const view = this.supplied.aemAdminPath.endsWith('.json') ? 'sheet' : 'edit';
    const snapDaPrefix = this.supplied.snapshot ? `/.snapshot/${snapshot}` : '';

    return {
      edit: `https://da.live/${view}#/${this.org}/${this.site}${snapDaPrefix}${daPath}`,
      preview: `https://${this.site}--${this.org}.aem.page${aemPath}`,
      review: snapshot ? `https://${snapshot}--${this.site}--${this.org}.aem.reviews${aemReviewPath}` : undefined,
    };
  }

  _href2Supplied(href) {
    // https://da.live/edit#/{org}/{site}/path
    if (href.startsWith('https://da.live')) {
      const [route, hash] = href.split('#');
      const view = route.split('/').pop();
      const isJson = view === 'sheet';

      const [, org, site, ...rest] = hash.split('/');

      const daPath = `/${rest.join('/')}`;
      const daAdminPath = isJson ? `${daPath}.json` : `${daPath}.html`;

      const isSnapshot = rest[0] === '.snapshot';
      const snapshot = isSnapshot ? rest[1] : undefined;
      if (isSnapshot) rest.splice(0, 2);

      const restPath = `/${rest.join('/')}`;
      const aemReviewPath = isJson ? `${restPath}.json` : restPath;

      return {
        org,
        site,
        daPath,
        daAdminPath,
        aemPath: daPath.replace('.html', ''),
        aemAdminPath: daPath,
        aemReviewPath,
        snapshot,
      };
    }
    // https://main--{site}--{org}.aem.live/path
    const { hostname, pathname } = new URL(href);
    const split = hostname.split('.').shift().split('--');

    // Snapshot will have four segments
    const isSnapshot = split.length === 4;

    // Normalize hostname split count to support optional snapshot name
    if (!isSnapshot) split.unshift(undefined);
    const [snapshot, , site, org] = split;

    const indexedPath = pathname.endsWith('/') ? `${pathname}index` : pathname;
    const daPath = indexedPath.replace('.json', '');
    const daAdminPath = indexedPath.endsWith('.json') ? indexedPath : `${indexedPath}.html`;
    return {
      org,
      site,
      daPath,
      daAdminPath,
      aemPath: daAdminPath.replace('.html', ''),
      aemAdminPath: pathname,
      aemReviewPath: pathname,
      snapshot,
    };
  }
}
