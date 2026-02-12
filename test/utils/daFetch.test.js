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
      const text = 'x ./media y href="/foo"';
      const out = replaceHtml(text);
      expect(out).to.include('<main>x ./media y href="/foo"</main>');
      expect(out).not.to.include('aem.live');
    });

    it('does not replace when only fromOrg is set', () => {
      const text = './media href="/bar"';
      expect(replaceHtml(text, 'myorg', null)).to.include(`<main>${text}</main>`);
      expect(replaceHtml(text, 'myorg', undefined)).to.include(`<main>${text}</main>`);
      expect(replaceHtml(text, 'myorg', null)).not.to.include('aem.live');
    });

    it('does not replace when only fromRepo is set', () => {
      const text = './media href="/baz"';
      expect(replaceHtml(text, null, 'myrepo')).to.include(`<main>${text}</main>`);
      expect(replaceHtml(text, '', 'myrepo')).to.include(`<main>${text}</main>`);
      expect(replaceHtml(text, null, 'myrepo')).not.to.include('aem.live');
    });
  });

  describe('when fromOrg and fromRepo are set', () => {
    const origin = 'https://main--myrepo--myorg.aem.live';

    it('replaces ./media with origin-prefixed /media', () => {
      const out = replaceHtml('link ./media/image.png', 'myorg', 'myrepo');
      expect(out).to.include(`${origin}/media/image.png`);
      expect(out).not.to.include('./media/image.png');
    });

    it('replaces all ./media occurrences', () => {
      const text = './media/a ./media/b';
      const out = replaceHtml(text, 'myorg', 'myrepo');
      expect(out).to.include(`${origin}/media/a`);
      expect(out).to.include(`${origin}/media/b`);
    });

    it('replaces href="/ with origin-prefixed href', () => {
      const out = replaceHtml('href="/page"', 'myorg', 'myrepo');
      expect(out).to.include(`href="${origin}/page"`);
      expect(out).not.to.include('href="/page"');
    });

    it('replaces all href="/ occurrences', () => {
      const text = 'href="/a" href="/b"';
      const out = replaceHtml(text, 'myorg', 'myrepo');
      expect(out).to.include(`href="${origin}/a"`);
      expect(out).to.include(`href="${origin}/b"`);
    });

    it('applies both replacements in one string', () => {
      const text = 'link ./media/x.png and href="/y"';
      const out = replaceHtml(text, 'myorg', 'myrepo');
      expect(out).to.include(`${origin}/media/x.png`);
      expect(out).to.include(`href="${origin}/y"`);
    });
  });

  describe('daMetadata', () => {
    it('adds no da-metadata div when empty object', () => {
      const out = replaceHtml('x', null, null, {});
      expect(out).not.to.include('da-metadata');
    });

    it('adds no da-metadata div when not passed', () => {
      const out = replaceHtml('x');
      expect(out).not.to.include('da-metadata');
    });

    it('adds da-metadata div with key/value rows when metadata provided', () => {
      const out = replaceHtml('x', null, null, { foo: 'bar' });
      expect(out).to.include('class="da-metadata"');
      expect(out).to.include('<div>foo</div><div>bar</div>');
    });

    it('adds multiple metadata entries', () => {
      const out = replaceHtml('x', null, null, { a: '1', b: '2' });
      expect(out).to.include('<div>a</div><div>1</div>');
      expect(out).to.include('<div>b</div><div>2</div>');
    });

    it('combines metadata with url replacement', () => {
      const out = replaceHtml('./media/img.png', 'o', 'r', { key: 'val' });
      expect(out).to.include('class="da-metadata"');
      expect(out).to.include('<div>key</div><div>val</div>');
      expect(out).to.include('https://main--r--o.aem.live/media/img.png');
    });
  });
});
