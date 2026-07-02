import { expect } from '@esm-bundle/chai';
import { linkifyBareUrls, sanitizeLinks } from '../../../../../nx2/blocks/chat/utils/links.js';

const text = (value) => ({ type: 'text', value });
const el = (tagName, children, properties = {}) => ({
  type: 'element', tagName, properties, children,
});
const root = (...children) => ({ type: 'root', children });

const anchors = (tree) => {
  const found = [];
  const walk = (node) => {
    if (node.type === 'element' && node.tagName === 'a') found.push(node);
    node.children?.forEach(walk);
  };
  walk(tree);
  return found;
};

describe('linkifyBareUrls', () => {
  it('wraps a bare URL in an anchor', () => {
    const tree = linkifyBareUrls(root(el('p', [text('go to https://example.com/x now')])));
    const [a] = anchors(tree);
    expect(a.properties.href).to.equal('https://example.com/x');
    expect(a.children[0].value).to.equal('https://example.com/x');
  });

  it('keeps trailing sentence punctuation out of the href', () => {
    const tree = linkifyBareUrls(root(el('p', [text('see https://example.com/x.')])));
    const [a] = anchors(tree);
    expect(a.properties.href).to.equal('https://example.com/x');
  });

  it('does not absorb a wrapping closing paren', () => {
    const tree = linkifyBareUrls(root(el('p', [text('(https://example.com/x)')])));
    const [a] = anchors(tree);
    expect(a.properties.href).to.equal('https://example.com/x');
  });

  it('linkifies multiple URLs in one text node', () => {
    const tree = linkifyBareUrls(root(el('p', [text('https://a.example.com and https://b.example.com')])));
    expect(anchors(tree).map((a) => a.properties.href)).to.deep.equal([
      'https://a.example.com', 'https://b.example.com',
    ]);
  });

  it('leaves text inside code and pre untouched', () => {
    const tree = linkifyBareUrls(root(
      el('code', [text('https://example.com/x')]),
      el('pre', [el('code', [text('https://example.com/y')])]),
    ));
    expect(anchors(tree)).to.have.length(0);
  });

  it('does not double-wrap existing anchors', () => {
    const tree = linkifyBareUrls(root(
      el('a', [text('https://example.com/x')], { href: 'https://example.com/x' }),
    ));
    expect(anchors(tree)).to.have.length(1);
  });

  it('ignores non-http schemes', () => {
    const tree = linkifyBareUrls(root(el('p', [text('mailto:me@example.com')])));
    expect(anchors(tree)).to.have.length(0);
  });
});

describe('sanitizeLinks', () => {
  it('adds target and rel and preserves a safe href', () => {
    const tree = sanitizeLinks(root(el('a', [text('x')], { href: 'https://example.com' })));
    const [a] = anchors(tree);
    expect(a.properties.href).to.equal('https://example.com');
    expect(a.properties.target).to.equal('_blank');
    expect(a.properties.rel).to.deep.equal(['noopener', 'noreferrer']);
  });

  it('neutralizes an unsafe href to "#"', () => {
    // eslint-disable-next-line no-script-url -- fixture: verifies a malicious scheme is stripped
    const tree = sanitizeLinks(root(el('a', [text('x')], { href: 'javascript:alert(1)' })));
    expect(anchors(tree)[0].properties.href).to.equal('#');
  });
});
