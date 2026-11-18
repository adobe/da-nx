import { expect } from '@esm-bundle/chai';
import { addDnt as addDntNx, removeDnt as removeDntNx } from '../../../nx/blocks/loc/dnt/dnt.js';
import { addDnt as addDntGlaas, removeDnt as removeDntGlaas } from '../../../nx/blocks/loc/connectors/glaas/dnt.js';

const ORG = 'org';
const SITE = 'site';

const flows = {
  dnt: {
    add: (html) => addDntNx(html, {}),
    remove: (html) => removeDntNx({ org: ORG, site: SITE, html }),
  },
  'glaas connector': {
    add: (html) => addDntGlaas(html, {}, { reset: true }),
    remove: (html) => removeDntGlaas(html, ORG, SITE),
  },
};

const page = (body) => `<body><header></header><main><div>${body}</div></main><footer></footer></body>`;
const parse = (html) => new DOMParser().parseFromString(html, 'text/html');

const URL_TEXT = 'https://delivery-p1.adobeaemcloud.com/adobe/assets/urn:aaid:aem:1/as/hero.jpg';
const linkImage = (url = URL_TEXT, alt = 'Hero alt') => `<p><a href="${url}" title="${alt}" data-edit-as="image">${url}</a></p>`;

Object.entries(flows).forEach(([name, { add, remove }]) => {
  describe(`link-image alt translation (${name})`, () => {
    it('does not freeze the anchor, so its title stays translatable', async () => {
      const out = parse(await add(page(linkImage())));
      const a = out.querySelector('a[data-edit-as="image"]');
      expect(a.hasAttribute('translate')).to.equal(false);
      expect(a.getAttribute('title')).to.equal('Hero alt');
    });

    it('protects only the URL text with a DNT span inside the anchor', async () => {
      const out = parse(await add(page(linkImage())));
      const span = out.querySelector('a[data-edit-as="image"] > span[translate="no"]');
      expect(span && span.textContent).to.equal(URL_TEXT);
      expect(out.querySelector('a[data-edit-as="image"]').textContent).to.equal(URL_TEXT);
    });

    it('protects a URL that contains an ampersand', async () => {
      const url = 'https://cdn.example.com/a/hero.jpg?w=750&h=500';
      const out = parse(await add(page(linkImage(url))));
      const span = out.querySelector('a[data-edit-as="image"] > span[translate="no"]');
      expect(span && span.textContent).to.equal(url);
    });

    it('restores the original anchor on removeDnt', async () => {
      const out = parse(await remove(await add(page(linkImage()))));
      const a = out.querySelector('a[data-edit-as="image"]');
      expect(a.outerHTML).to.equal(`<a href="${URL_TEXT}" title="Hero alt" data-edit-as="image">${URL_TEXT}</a>`);
      expect(out.querySelector('[translate]')).to.equal(null);
      expect(out.querySelector('.dnt-text')).to.equal(null);
    });

    it('keeps a translated title through removeDnt', async () => {
      const withDnt = await add(page(linkImage()));
      const translated = withDnt.replace('title="Hero alt"', 'title="Texte alternatif"');
      const out = parse(await remove(translated));
      const a = out.querySelector('a[data-edit-as="image"]');
      expect(a.getAttribute('title')).to.equal('Texte alternatif');
      expect(a.textContent).to.equal(URL_TEXT);
    });

    it('still freezes a regular link whose text is a URL', async () => {
      const html = page('<p><a href="https://example.com/x" title="Example">https://example.com/x</a></p>');
      const out = parse(await add(html));
      expect(out.querySelector('a').getAttribute('translate')).to.equal('no');
    });
  });
});
