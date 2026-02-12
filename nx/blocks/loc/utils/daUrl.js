import { getSuppliedPrefix } from './utils.js';

export default class DaUrl {
  constructor(href) {
    this.href = href;
    this.supplied = this._href2Supplied(href);
    if (this.supplied.error) return;
    this.org = this.supplied.org;
    this.site = this.supplied.site;
    this.views = this._getViews();
  }

  /**
   * Provide language rows and get the URLs matching prefix
   * @param {*} langs config.languages.data OR project.langs
   * @returns the urls prefix
   */
  getSuppliedPrefix(langs) {
    this.suppliedPrefix ??= getSuppliedPrefix(langs, this.supplied.aemPath);
    return this.suppliedPrefix;
  }

  convertPrefix(langs, destPrefix) {
    const srcPrefix = this.getSuppliedPrefix(langs);

    const url = new URL(this.href);
    url.pathname = srcPrefix === ''
      ? `${destPrefix}${url.pathname}`
      : url.pathname.replace(srcPrefix, destPrefix);

    return new DaUrl(url.href);
  }

  _getViews() {
    const { daPath, aemPath, aemReviewPath, snapshot } = this.supplied;
    const route = this.supplied.aemAdminPath.endsWith('.json') ? 'sheet' : 'edit';

    return {
      route,
      edit: `https://da.live/${route}#/${this.org}/${this.site}${daPath}`,
      preview: `https://${this.site}--${this.org}.aem.page${aemPath}`,
      review: snapshot ? `https://${snapshot}--${this.site}--${this.org}.aem.reviews${aemReviewPath}` : undefined,
    };
  }

  _href2Supplied(href) {
    try {
      const { hostname, pathname } = new URL(href);
      if (!(hostname === 'da.live' || hostname.includes('.aem.'))) {
        throw Error('Please use da.live or aem.live URLs');
      }

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

      const split = hostname.split('.').shift().split('--');

      // Snapshot will have four segments
      const isSnapshot = split.length === 4;

      // Normalize hostname split count to support optional snapshot name
      if (!isSnapshot) split.unshift(undefined);
      const [snapshot, , site, org] = split;

      const snapPrefix = isSnapshot ? `/.snapshot/${snapshot}` : '';

      const indexedPath = pathname.endsWith('/') ? `${pathname}index` : pathname;
      const withSnapPath = `${snapPrefix}${indexedPath}`;
      const daPath = withSnapPath.replace('.json', '');
      const daAdminPath = withSnapPath.endsWith('.json') ? withSnapPath : `${withSnapPath}.html`;

      return {
        org,
        site,
        daPath,
        daAdminPath,
        aemPath: daAdminPath.replace('.html', ''),
        aemAdminPath: withSnapPath,
        aemReviewPath: pathname,
        snapshot,
      };
    } catch (error) {
      return { error };
    }
  }
}
