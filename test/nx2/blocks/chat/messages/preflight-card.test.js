import { expect } from '@esm-bundle/chai';
import '../../../../../nx2/blocks/chat/messages/preflight-card.js';

const CATEGORIES = [
  {
    name: 'Context',
    checks: [
      { label: 'Tone of voice', passed: true },
      { label: 'Logo Usage', passed: true },
      { label: 'CTA language', passed: false },
    ],
  },
  {
    name: 'SEO',
    checks: [
      { label: 'Title tag', passed: true },
      { label: 'Meta description', passed: false },
    ],
  },
];

function makeCard(preflight = {}) {
  const el = document.createElement('nx-preflight-card');
  el.preflight = { title: 'Test Page', readiness: 80, categories: CATEGORIES, ...preflight };
  document.body.appendChild(el);
  return el;
}

function cleanup(el) {
  el?.remove();
}

// ─── computed totals ───────────────────────────────────────────────────────

describe('nx-preflight-card computed totals', () => {
  let card;
  afterEach(() => cleanup(card));

  it('counts total checks across all categories', () => {
    card = makeCard();
    expect(card._totalChecks()).to.equal(5);
  });

  it('counts only passing checks', () => {
    card = makeCard();
    expect(card._passedChecks()).to.equal(3);
  });

  it('returns 0 for empty categories', () => {
    card = makeCard({ categories: [] });
    expect(card._totalChecks()).to.equal(0);
    expect(card._passedChecks()).to.equal(0);
  });

  it('handles missing preflight gracefully', () => {
    const el = document.createElement('nx-preflight-card');
    document.body.appendChild(el);
    card = el;
    expect(card._totalChecks()).to.equal(0);
    expect(card._passedChecks()).to.equal(0);
  });
});

// ─── category toggle ──────────────────────────────────────────────────────

describe('nx-preflight-card category toggle', () => {
  let card;
  afterEach(() => cleanup(card));

  it('starts with no categories open', () => {
    card = makeCard();
    expect(card._openCategories.size).to.equal(0);
  });

  it('opens a category on first toggle', () => {
    card = makeCard();
    card._toggleCategory('Context');
    expect(card._openCategories.has('Context')).to.be.true;
  });

  it('closes an open category on second toggle', () => {
    card = makeCard();
    card._toggleCategory('SEO');
    card._toggleCategory('SEO');
    expect(card._openCategories.has('SEO')).to.be.false;
  });

  it('can have multiple categories open simultaneously', () => {
    card = makeCard();
    card._toggleCategory('Context');
    card._toggleCategory('SEO');
    expect(card._openCategories.size).to.equal(2);
  });
});

// ─── rendering ────────────────────────────────────────────────────────────

describe('nx-preflight-card rendering', () => {
  let card;
  afterEach(() => cleanup(card));

  it('renders the card header', async () => {
    card = makeCard();
    await card.updateComplete;
    expect(card.shadowRoot.querySelector('.pf-header')).to.exist;
    expect(card.shadowRoot.querySelector('.pf-type-label').textContent).to.contain('Pre-flight checker');
  });

  it('renders readiness score', async () => {
    card = makeCard({ readiness: 94 });
    await card.updateComplete;
    expect(card.shadowRoot.querySelector('.pf-readiness-score').textContent).to.contain('94%');
  });

  it('renders passed/total badge', async () => {
    card = makeCard();
    await card.updateComplete;
    expect(card.shadowRoot.querySelector('.pf-passed-badge').textContent).to.contain('3/5');
  });

  it('renders one row per category', async () => {
    card = makeCard();
    await card.updateComplete;
    const rows = card.shadowRoot.querySelectorAll('.pf-category');
    expect(rows.length).to.equal(2);
  });

  it('shows check rows only when category is open', async () => {
    card = makeCard();
    await card.updateComplete;
    expect(card.shadowRoot.querySelector('.pf-checks')).to.not.exist;

    card._toggleCategory('Context');
    await card.updateComplete;
    const checks = card.shadowRoot.querySelectorAll('.pf-check-row');
    expect(checks.length).to.equal(3);
  });

  it('collapses body when header chevron is clicked', async () => {
    card = makeCard();
    await card.updateComplete;
    expect(card.shadowRoot.querySelector('.pf-body')).to.exist;

    card.shadowRoot.querySelector('.pf-icon-btn').click();
    await card.updateComplete;
    expect(card.shadowRoot.querySelector('.pf-body')).to.not.exist;
  });

  it('renders summary text when provided', async () => {
    card = makeCard({ summary: 'Page is brand compliant.' });
    await card.updateComplete;
    expect(card.shadowRoot.querySelector('.pf-summary').textContent).to.equal('Page is brand compliant.');
  });

  it('omits summary element when not provided', async () => {
    card = makeCard({ summary: undefined });
    await card.updateComplete;
    expect(card.shadowRoot.querySelector('.pf-summary')).to.not.exist;
  });
});
