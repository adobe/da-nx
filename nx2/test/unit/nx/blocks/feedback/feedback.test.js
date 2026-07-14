import { expect } from '@esm-bundle/chai';
import { setConfig } from '../../../../../scripts/nx.js';

// feedback.js captures getConfig() into a module-level constant at import
// time (for ICON_HREF), so setConfig() must resolve before feedback.js is
// ever imported — a static import would evaluate (and freeze that constant)
// before this file's own top-level code could run.
await setConfig({ hostnames: [] });
const { parseFeedbackItems } = await import('../../../../../blocks/feedback/feedback.js');

const FEEDBACK_FRAGMENT_HTML = `
  <div>
    <p><a href="#idea"><span class="icon icon-idea"></span>Submit an idea</a><br><em>Suggestions and feature requests</em></p>
    <p><a href="#bug"><span class="icon icon-bug"></span>Report a bug</a><br><em>Problems using AEM</em></p>
    <p><a href="https://discord.gg/X8D9JhyDX"><span class="icon icon-discord"></span>Join our Discord Server</a><br><em>Discussion forum</em></p>
  </div>
`;

function buildFragment(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.firstElementChild;
}

describe('parseFeedbackItems', () => {
  it('parses each row into an item with id, label, description, icon, and href', () => {
    const items = parseFeedbackItems(buildFragment(FEEDBACK_FRAGMENT_HTML));
    expect(items).to.have.lengthOf(3);
    expect(items[0]).to.deep.equal({
      id: 'idea',
      label: 'Submit an idea',
      description: 'Suggestions and feature requests',
      icon: 'idea',
      href: '#idea',
    });
    expect(items[1]).to.deep.equal({
      id: 'bug',
      label: 'Report a bug',
      description: 'Problems using AEM',
      icon: 'bug',
      href: '#bug',
    });
  });

  it('uses the icon name as id for external links (no hash)', () => {
    const items = parseFeedbackItems(buildFragment(FEEDBACK_FRAGMENT_HTML));
    expect(items[2]).to.deep.equal({
      id: 'discord',
      label: 'Join our Discord Server',
      description: 'Discussion forum',
      icon: 'discord',
      href: 'https://discord.gg/X8D9JhyDX',
    });
  });

  it('falls back to a positional id when there is no icon and no hash href', () => {
    const items = parseFeedbackItems(buildFragment(`
      <div><p><a href="https://example.com">No icon link</a></p></div>
    `));
    expect(items).to.deep.equal([{
      id: 'link-0',
      label: 'No icon link',
      description: undefined,
      icon: undefined,
      href: 'https://example.com',
    }]);
  });

  it('skips rows without a link', () => {
    const items = parseFeedbackItems(buildFragment('<div><p>No link here</p></div>'));
    expect(items).to.deep.equal([]);
  });

  it('omits description when there is no <em>', () => {
    const items = parseFeedbackItems(buildFragment(`
      <div><p><a href="#idea"><span class="icon icon-idea"></span>Submit an idea</a></p></div>
    `));
    expect(items[0].description).to.be.undefined;
  });
});
