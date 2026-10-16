import { expect } from '@esm-bundle/chai';
import {
  splitReviewMessage, validateReview, draftRootForUser, validatePagePath,
} from '../../../../../blocks/chat-ao/draft-review/protocol.js';
import { CmaDraftReview } from '../../../../../blocks/chat-ao/draft-review/draft-review.js';

const page = { path: '/en/about.html', title: 'About', summary: 'Rewrite headline.' };
const plan = { version: 1, type: 'plan', id: 'copy-01', summary: 'Warmer copy.', pages: [page] };
const block = (review) => `<da-review>${JSON.stringify(review)}</da-review>`;
const settle = async (el) => {
  await el.updateComplete;
  await new Promise((resolve) => { setTimeout(resolve, 0); });
  await el.updateComplete;
};

describe('CMA draft review protocol', () => {
  it('preserves prose around structured reviews', () => {
    expect(splitReviewMessage(`Before${block(plan)}After`)).to.deep.equal([
      { text: 'Before' }, { review: plan }, { text: 'After' },
    ]);
  });

  it('parses multiple review blocks in order', () => {
    expect(splitReviewMessage(`${block(plan)}${block(plan)}`)).to.have.lengthOf(2);
  });

  it('does not expose unfinished JSON while streaming', () => {
    expect(splitReviewMessage('Hello <da-review>{"version":', { streaming: true }))
      .to.deep.equal([{ text: 'Hello ' }, { pending: true }]);
    expect(splitReviewMessage('Hello <da-rev', { streaming: true })).to.deep.equal([{ text: 'Hello ' }]);
  });

  it('surfaces incomplete or malformed final blocks', () => {
    expect(splitReviewMessage('<da-review>{}')[0].error).to.include('Incomplete');
    expect(splitReviewMessage('<da-review>not json</da-review>')[0]).to.have.property('error');
  });

  it('validates version, type, ids, pages and ready draft paths', () => {
    [
      { ...plan, version: 2 }, { ...plan, type: 'apply' }, { ...plan, id: '../bad' },
      { ...plan, id: null }, { ...plan, pages: [] }, { ...plan, pages: [page, page] },
      { ...plan, type: 'ready' }, { ...plan, pages: [{ ...page, title: '' }] },
      { ...plan, pages: Array.from({ length: 51 }, (_, i) => ({ ...page, path: `/p${i}.html` })) },
    ].forEach((review) => expect(() => validateReview(review)).to.throw());
    expect(validateReview({ ...plan, type: 'ready', pages: [{ ...page, draftPath: '/.da/ai-drafts/user/en/about.html' }] }).type).to.equal('ready');
  });

  it('rejects traversal, hidden paths, URL encoding and non-HTML pages', () => {
    ['/../about.html', '/.da/a.html', '/a/./b.html', '/a//b.html', '/%2e%2e/a.html',
      'https://evil.test/a.html', '/a.html?x=1', '/a.json', '/a\\b.html', null]
      .forEach((path) => expect(() => validatePagePath(path)).to.throw());
  });

  it('derives a stable signed-in-user folder, without a shared fallback', () => {
    expect(draftRootForUser({ userId: 'ABC@AdobeID' })).to.equal('/.da/ai-drafts/abc-adobeid');
    expect(() => draftRootForUser({})).to.throw('Sign in');
  });
});

describe('CMA draft review card', () => {
  let el;
  let calls;
  beforeEach(() => {
    calls = [];
    el = new CmaDraftReview();
    el.review = plan;
    el.sessionKey = 'org/site/session';
    el.onAction = async (request) => {
      calls.push(request);
      return { results: {} };
    };
    document.body.append(el);
  });
  afterEach(() => el.remove());

  it('loads state once, then approves only included scope pages', async () => {
    await settle(el);
    expect(calls.map((c) => c.action)).to.deep.equal(['status']);
    const check = el.shadowRoot.querySelector('input');
    check.click();
    await settle(el);
    expect(el.shadowRoot.querySelector('.nx-btn-primary').disabled).to.equal(true);
    check.click();
    await settle(el);
    el.shadowRoot.querySelector('.nx-btn-primary').click();
    await settle(el);
    expect(calls.at(-1)).to.include({ action: 'approve-scope' });
    expect(calls.at(-1).paths).to.deep.equal([page.path]);
  });

  it('renders a saved result and restores its previous version', async () => {
    el.review = { ...plan, type: 'ready', pages: [{ ...page, draftPath: '/.da/ai-drafts/user/en/about.html' }] };
    el.onAction = async (request) => {
      calls.push(request);
      return { results: { [page.path]: { status: 'applied', versionId: 'v1' } } };
    };
    await settle(el);
    expect(el.shadowRoot.textContent).to.include('Version saved; changes applied');
    const restore = [...el.shadowRoot.querySelectorAll('button')].find((b) => b.textContent.includes('Restore previous'));
    restore.click();
    await settle(el);
    expect(calls.at(-1).action).to.equal('restore');
  });

  it('blocks review actions during an active turn', async () => {
    await settle(el);
    el.disabled = true;
    await settle(el);
    expect([...el.shadowRoot.querySelectorAll('button')].every((b) => b.disabled)).to.equal(true);
  });

  it('surfaces host errors rather than claiming approval succeeded', async () => {
    el.onAction = async () => { throw new Error('Version save failed'); };
    await settle(el);
    expect(el.shadowRoot.querySelector('[role="alert"]').textContent).to.equal('Version save failed');
  });
});
