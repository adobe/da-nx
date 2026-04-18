import { expect } from '@esm-bundle/chai';
import { replaceHtml } from '../../nx/utils/daFetch.js';

describe('replaceHtml', () => {
  describe('structure', () => {
    it('wraps content in body/header/main/footer', () => {
      const out = replaceHtml('hello');
      expect(out).to.include('<body>');
      expect(out).to.include('<header></header>');
      expect(out).to.include('<main>hello</main>');
      expect(out).to.include('<footer></footer>');
    });

    it('handles empty text', () => {
      const out = replaceHtml('');
      expect(out).to.include('<main></main>');
    });
  });

  describe('when fromOrg or fromRepo is missing', () => {
    it('does not replace ./media or href when both missing', () => {
      const text = '<img src="./media/image.png"> <a href="/foo">link</a>';
      const out = replaceHtml(text);
      expect(out).to.include('<main><img src="./media/image.png"> <a href="/foo">link</a></main>');
      expect(out).not.to.include('aem.live');
    });

    it('does not replace when only fromOrg is set', () => {
      const text = '<img src="./media/image.png"> <a href="/bar">link</a>';
      expect(replaceHtml(text, 'myorg', null)).to.include(`<main>${text}</main>`);
      expect(replaceHtml(text, 'myorg', undefined)).to.include(`<main>${text}</main>`);
      expect(replaceHtml(text, 'myorg', null)).not.to.include('aem.live');
    });

    it('does not replace when only fromRepo is set', () => {
      const text = '<img src="./media/image.png"> <a href="/baz">link</a>';
      expect(replaceHtml(text, null, 'myrepo')).to.include(`<main>${text}</main>`);
      expect(replaceHtml(text, '', 'myrepo')).to.include(`<main>${text}</main>`);
      expect(replaceHtml(text, null, 'myrepo')).not.to.include('aem.live');
    });
  });

  describe('when fromOrg and fromRepo are set', () => {
    const origin = 'https://main--myrepo--myorg.aem.live';

    it('replaces ./media in img src with origin-prefixed /media', () => {
      const out = replaceHtml('<img src="./media/image.png">', 'myorg', 'myrepo');
      expect(out).to.include(`<img src="${origin}/media/image.png">`);
      expect(out).not.to.include('src="./media/image.png"');
    });

    it('replaces all ./media occurrences in img src attributes', () => {
      const text = '<img src="./media/a.png"> <img src="./media/b.png">';
      const out = replaceHtml(text, 'myorg', 'myrepo');
      expect(out).to.include(`src="${origin}/media/a.png"`);
      expect(out).to.include(`src="${origin}/media/b.png"`);
    });

    it('replaces href="/ in anchor tags with origin-prefixed href', () => {
      const out = replaceHtml('<a href="/page">link</a>', 'myorg', 'myrepo');
      expect(out).to.include(`<a href="${origin}/page">`);
      expect(out).not.to.include('href="/page"');
    });

    it('replaces all href="/ occurrences in anchor tags', () => {
      const text = '<a href="/a">A</a> <a href="/b">B</a>';
      const out = replaceHtml(text, 'myorg', 'myrepo');
      expect(out).to.include(`href="${origin}/a"`);
      expect(out).to.include(`href="${origin}/b"`);
    });

    it('applies both replacements in one HTML string', () => {
      const text = '<img src="./media/x.png"> <a href="/y">Link</a>';
      const out = replaceHtml(text, 'myorg', 'myrepo');
      expect(out).to.include(`src="${origin}/media/x.png"`);
      expect(out).to.include(`href="${origin}/y"`);
    });
  });

  describe('daMetadata (options.daMetadata)', () => {
    it('adds no da-metadata div when empty object', () => {
      const out = replaceHtml('x', null, null, { daMetadata: {} });
      expect(out).not.to.include('da-metadata');
    });

    it('adds no da-metadata div when not passed', () => {
      const out = replaceHtml('x');
      expect(out).not.to.include('da-metadata');
    });

    it('adds da-metadata div with key/value rows when metadata provided', () => {
      const out = replaceHtml('x', null, null, { daMetadata: { foo: 'bar' } });
      expect(out).to.include('class="da-metadata"');
      expect(out).to.include('<div>foo</div><div>bar</div>');
    });

    it('adds multiple metadata entries', () => {
      const out = replaceHtml('x', null, null, { daMetadata: { a: '1', b: '2' } });
      expect(out).to.include('<div>a</div><div>1</div>');
      expect(out).to.include('<div>b</div><div>2</div>');
    });

    it('combines metadata with url replacement in img src', () => {
      const out = replaceHtml('<img src="./media/img.png">', 'org', 'repo', { daMetadata: { key: 'val' } });
      expect(out).to.include('class="da-metadata"');
      expect(out).to.include('<div>key</div><div>val</div>');
      expect(out).to.include('https://main--repo--org.aem.live/media/img.png');
    });
  });

  describe('replaceRelative option', () => {
    const origin = 'https://main--myrepo--myorg.aem.live';

    it('replaces relative paths by default (replaceRelative not specified)', () => {
      const text = '<img src="./media/img.png"> <a href="/page">Link</a>';
      const out = replaceHtml(text, 'myorg', 'myrepo');
      expect(out).to.include(`src="${origin}/media/img.png"`);
      expect(out).to.include(`href="${origin}/page"`);
    });

    it('replaces relative paths when replaceRelative is true', () => {
      const text = '<img src="./media/img.png"> <a href="/page">Link</a>';
      const out = replaceHtml(text, 'myorg', 'myrepo', { replaceRelative: true });
      expect(out).to.include(`src="${origin}/media/img.png"`);
      expect(out).to.include(`href="${origin}/page"`);
    });

    it('does not replace relative paths when replaceRelative is false', () => {
      const text = '<img src="./media/img.png"> <a href="/page">Link</a>';
      const out = replaceHtml(text, 'myorg', 'myrepo', { replaceRelative: false });
      expect(out).to.include('<main><img src="./media/img.png"> <a href="/page">Link</a></main>');
      expect(out).not.to.include('aem.live');
    });

    it('preserves relative paths but still adds metadata when replaceRelative is false', () => {
      const text = '<img src="./media/img.png">';
      const out = replaceHtml(text, 'myorg', 'myrepo', {
        replaceRelative: false,
        daMetadata: { key: 'value' },
      });
      expect(out).to.include('<main><img src="./media/img.png"></main>');
      expect(out).not.to.include('aem.live');
      expect(out).to.include('class="da-metadata"');
      expect(out).to.include('<div>key</div><div>value</div>');
    });

    it('does not affect behavior when org/repo are missing even with replaceRelative true', () => {
      const text = '<img src="./media/img.png">';
      const out = replaceHtml(text, null, null, { replaceRelative: true });
      expect(out).to.include('<main><img src="./media/img.png"></main>');
      expect(out).not.to.include('aem.live');
    });
  });
});
