import { expect } from '@esm-bundle/chai';
import { setupSuggestionClicks } from '../../../../../nx/public/plugins/quick-edit/src/suggestions.js';

describe('quick-edit suggestion clicks', () => {
  let posted;
  let ctx;

  beforeEach(() => {
    posted = [];
    ctx = { port: { postMessage: (m) => posted.push(m) } };
    setupSuggestionClicks(ctx);
  });

  afterEach(() => {
    document.removeEventListener('click', ctx.suggestionClickListener, true);
    document.body.innerHTML = '';
  });

  it('posts the locked element\'s suggestion position', () => {
    document.body.innerHTML = '<p data-prose-index="4" data-suggestion-lock="hint" data-suggestion-pos="9"><strong>x</strong></p>';
    document.querySelector('strong').click();
    expect(posted).to.deep.equal([{ type: 'suggestion-click', payload: { proseIndex: 9 } }]);
  });

  it('keeps the click from reaching image selection', () => {
    document.body.innerHTML = '<p data-suggestion-lock="hint" data-suggestion-pos="2"><picture><img></picture></p>';
    let reached = false;
    document.addEventListener('click', () => { reached = true; }, { once: true });
    document.querySelector('img').click();
    expect(reached).to.be.false;
  });

  it('ignores clicks outside locked elements', () => {
    document.body.innerHTML = '<p data-prose-index="4">plain</p>';
    document.querySelector('p').click();
    expect(posted).to.deep.equal([]);
  });

  it('installs one listener per context', () => {
    const first = ctx.suggestionClickListener;
    setupSuggestionClicks(ctx);
    expect(ctx.suggestionClickListener).to.equal(first);
  });
});
