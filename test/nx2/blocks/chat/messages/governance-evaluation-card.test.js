import { expect } from '@esm-bundle/chai';
import '../../../../../nx2/blocks/chat/messages/governance-evaluation-card.js';

const TEXT_EVALUATION = {
  evaluations: [
    {
      check_id: '1', check_title: 'Sophisticated Voice', alignment: 'YES', category_id: 'cat-1', category: 'Voice',
    },
    {
      check_id: '2', check_title: 'Naming & Lexicon', alignment: 'YES', category_id: 'cat-1', category: 'Voice',
    },
    {
      check_id: '3', check_title: 'No Shouty Caps', alignment: 'NO', category_id: 'cat-2', category: 'CTA',
    },
  ],
  successful_checks: 2,
  failed_checks: 1,
  not_applicable_checks: 0,
  error_checks: 0,
};

const IMAGE_EVALUATIONS = [
  {
    source: 'https://example.com/img1.png',
    overall_aligned: true,
    evaluations: [
      {
        check_id: 'i1', check_title: 'Color Palette', alignment: 'YES', category_id: 'cat-3', category: 'Visual',
      },
      {
        check_id: 'i2', check_title: 'Packaging', alignment: 'NA', category_id: 'cat-3', category: 'Visual',
      },
    ],
    successful_checks: 1,
    failed_checks: 0,
    not_applicable_checks: 1,
    error_checks: 0,
  },
  {
    source: 'https://example.com/img2.png',
    overall_aligned: false,
    evaluations: [
      {
        check_id: 'i3', check_title: 'Color Palette', alignment: 'NO', category_id: 'cat-3', category: 'Visual',
      },
    ],
    successful_checks: 0,
    failed_checks: 1,
    not_applicable_checks: 0,
    error_checks: 0,
  },
];

function fullEvaluation(overrides = {}) {
  return {
    pageUrl: 'https://example.com/index',
    brand_name: 'Frescopa Coffee',
    text_evaluation: TEXT_EVALUATION,
    image_evaluations: IMAGE_EVALUATIONS,
    status: 'complete',
    ...overrides,
  };
}

function makeCard(evaluation) {
  const el = document.createElement('nx-governance-evaluation-card');
  el.evaluation = evaluation;
  document.body.appendChild(el);
  return el;
}

function cleanup(el) {
  el?.remove();
}

// ─── header & card-level collapse ──────────────────────────────────────────

describe('nx-governance-evaluation-card header', () => {
  let card;
  afterEach(() => cleanup(card));

  it('renders the type label and title/subtitle', async () => {
    card = makeCard(fullEvaluation());
    await card.updateComplete;
    expect(card.shadowRoot.querySelector('.ge-type-label').textContent).to.contain('Governance Page Evaluation');
    expect(card.shadowRoot.querySelector('.ge-title').textContent).to.contain('Frescopa Coffee');
    expect(card.shadowRoot.querySelector('.ge-page-url').textContent).to.contain('https://example.com/index');
  });

  it('collapses the body when the header chevron is clicked', async () => {
    card = makeCard(fullEvaluation());
    await card.updateComplete;
    const details = card.shadowRoot.querySelector('details.ge-card');
    expect(details.open).to.be.true;

    card.shadowRoot.querySelector('.ge-header').click();
    expect(details.open).to.be.false;
  });

  it('renders an aggregate summary combining text and image checks', async () => {
    card = makeCard(fullEvaluation());
    await card.updateComplete;
    expect(card.shadowRoot.querySelector('.ge-summary-row').textContent).to.contain('3/5 passed');
  });

  it('does not throw and still renders a header when evaluation is entirely missing', async () => {
    const el = document.createElement('nx-governance-evaluation-card');
    document.body.appendChild(el);
    card = el;
    await card.updateComplete;
    expect(card.shadowRoot.querySelector('.ge-header')).to.exist;
  });
});

// ─── loading state ──────────────────────────────────────────────────────────

describe('nx-governance-evaluation-card loading state', () => {
  let card;
  afterEach(() => cleanup(card));

  it('shows a spinner and no scorecard while loading, with no evaluation yet', async () => {
    const el = document.createElement('nx-governance-evaluation-card');
    el.loading = true;
    document.body.appendChild(el);
    card = el;
    await card.updateComplete;
    expect(card.shadowRoot.querySelector('.ge-loading')).to.exist;
    expect(card.shadowRoot.querySelector('.ge-spinner')).to.exist;
    expect(card.shadowRoot.querySelector('.ge-summary-row')).to.not.exist;
    expect(card.shadowRoot.querySelector('.ge-passed-badge')).to.not.exist;
  });

  it('does not show the spinner once loading is false, even with a falsy/unparseable evaluation', async () => {
    card = makeCard(null);
    card.loading = false;
    await card.updateComplete;
    expect(card.shadowRoot.querySelector('.ge-loading')).to.not.exist;
    expect(card.shadowRoot.querySelector('.ge-spinner')).to.not.exist;
    expect(card.shadowRoot.querySelector('.ge-header')).to.exist;
  });
});

// ─── error state ─────────────────────────────────────────────────────────

describe('nx-governance-evaluation-card error state', () => {
  let card;
  afterEach(() => cleanup(card));

  it('shows the error message and no scorecard/spinner when error is set', async () => {
    const el = document.createElement('nx-governance-evaluation-card');
    el.error = 'Page evaluation failed.';
    document.body.appendChild(el);
    card = el;
    await card.updateComplete;
    expect(card.shadowRoot.querySelector('.ge-error-text').textContent).to.contain('Page evaluation failed.');
    expect(card.shadowRoot.querySelector('.ge-loading')).to.not.exist;
    expect(card.shadowRoot.querySelector('.ge-summary-row')).to.not.exist;
  });

  it('takes precedence over loading when both are set', async () => {
    const el = document.createElement('nx-governance-evaluation-card');
    el.error = 'Page evaluation failed.';
    el.loading = true;
    document.body.appendChild(el);
    card = el;
    await card.updateComplete;
    expect(card.shadowRoot.querySelector('.ge-error-text')).to.exist;
    expect(card.shadowRoot.querySelector('.ge-loading')).to.not.exist;
  });

  it('does not show the error state once error is cleared', async () => {
    card = makeCard(fullEvaluation());
    card.error = undefined;
    await card.updateComplete;
    expect(card.shadowRoot.querySelector('.ge-error-text')).to.not.exist;
    expect(card.shadowRoot.querySelector('.ge-header')).to.exist;
  });
});

// ─── text evaluation section ───────────────────────────────────────────────

describe('nx-governance-evaluation-card text section', () => {
  let card;
  afterEach(() => cleanup(card));

  it('groups checks into one accordion category per distinct category', async () => {
    card = makeCard(fullEvaluation());
    await card.updateComplete;
    const textSection = card.shadowRoot.querySelector('.ge-text-section');
    expect(textSection.querySelectorAll('.ge-category')).to.have.lengthOf(2);
  });

  it('keeps checks hidden until their category is opened', async () => {
    card = makeCard(fullEvaluation());
    await card.updateComplete;
    const textSection = card.shadowRoot.querySelector('.ge-text-section');
    const category = textSection.querySelector('.ge-category');
    expect(category.open).to.be.false;

    textSection.querySelector('.ge-cat-header').click();
    expect(category.open).to.be.true;
    expect(category.querySelectorAll('.ge-check-row')).to.have.lengthOf(2);
  });

  it('shows a neutral placeholder when text_evaluation is missing', async () => {
    card = makeCard(fullEvaluation({ text_evaluation: null }));
    await card.updateComplete;
    expect(card.shadowRoot.querySelector('.ge-text-section .ge-category')).to.not.exist;
    expect(card.shadowRoot.querySelector('.ge-text-section .ge-section-empty')).to.exist;
  });

  it('shows a neutral placeholder when text_evaluation has no evaluations', async () => {
    card = makeCard(fullEvaluation({ text_evaluation: { evaluations: [] } }));
    await card.updateComplete;
    expect(card.shadowRoot.querySelector('.ge-text-section .ge-section-empty')).to.exist;
  });
});

// ─── image evaluation sections ──────────────────────────────────────────────

describe('nx-governance-evaluation-card image sections', () => {
  let card;
  afterEach(() => cleanup(card));

  async function openImageGroup() {
    card.shadowRoot.querySelector('.ge-image-group .ge-group-header').click();
    await card.updateComplete;
  }

  it('collapses the image group by default, showing count and passing rate in the header', async () => {
    card = makeCard(fullEvaluation());
    await card.updateComplete;

    const group = card.shadowRoot.querySelector('.ge-image-group');
    expect(group).to.exist;
    expect(group.open).to.be.false;

    expect(group.querySelector('.ge-group-meta').textContent).to.contain('2 images evaluated');
    expect(group.querySelector('.ge-group-header .ge-passed-badge').textContent).to.contain('1/2 passed');
  });

  it('reads "1 image evaluated" (singular) with a single image', async () => {
    card = makeCard(fullEvaluation({ image_evaluations: [IMAGE_EVALUATIONS[0]] }));
    await card.updateComplete;
    expect(card.shadowRoot.querySelector('.ge-group-meta').textContent).to.contain('1 image evaluated');
  });

  it('reveals the image list when the header is clicked and hides it again on a second click', async () => {
    card = makeCard(fullEvaluation());
    await card.updateComplete;

    const group = card.shadowRoot.querySelector('.ge-image-group');
    await openImageGroup();
    expect(group.open).to.be.true;

    await openImageGroup();
    expect(group.open).to.be.false;
  });

  it('renders one section per image evaluation with a thumbnail and alignment badge', async () => {
    card = makeCard(fullEvaluation());
    await card.updateComplete;
    await openImageGroup();
    const sections = card.shadowRoot.querySelectorAll('.ge-image-section');
    expect(sections).to.have.lengthOf(2);

    const [first, second] = sections;
    expect(first.querySelector('.ge-image-thumb').getAttribute('src')).to.equal('https://example.com/img1.png');
    expect(first.querySelector('.ge-align-badge').classList.contains('ge-align-badge-pass')).to.be.true;
    expect(second.querySelector('.ge-align-badge').classList.contains('ge-align-badge-fail')).to.be.true;
  });

  it('groups image sections under an "Image evaluations" heading', async () => {
    card = makeCard(fullEvaluation());
    await card.updateComplete;
    const group = card.shadowRoot.querySelector('.ge-image-group');
    expect(group).to.exist;
    expect(group.querySelector('.ge-section-title').textContent).to.equal('Image evaluations');

    const titles = [...card.shadowRoot.querySelectorAll('.ge-section-title')].map((el) => el.textContent);
    expect(titles).to.deep.equal(['Text evaluation', 'Image evaluations']);
  });

  it('renders no image group when image_evaluations is empty', async () => {
    card = makeCard(fullEvaluation({ image_evaluations: [] }));
    await card.updateComplete;
    expect(card.shadowRoot.querySelector('.ge-image-group')).to.not.exist;
  });

  it('renders no image sections when image_evaluations is missing', async () => {
    card = makeCard(fullEvaluation({ image_evaluations: undefined }));
    await card.updateComplete;
    expect(card.shadowRoot.querySelectorAll('.ge-image-section')).to.have.lengthOf(0);
  });

  it('renders no image sections when image_evaluations is empty', async () => {
    card = makeCard(fullEvaluation({ image_evaluations: [] }));
    await card.updateComplete;
    expect(card.shadowRoot.querySelectorAll('.ge-image-section')).to.have.lengthOf(0);
  });

  it('keeps category open-state independent between images sharing the same category name', async () => {
    card = makeCard(fullEvaluation());
    await card.updateComplete;
    await openImageGroup();
    const [first, second] = card.shadowRoot.querySelectorAll('.ge-image-section');

    first.querySelector('.ge-cat-header').click();

    expect(first.querySelector('.ge-category').open).to.be.true;
    expect(second.querySelector('.ge-category').open).to.be.false;
  });
});

// ─── check row alignment rendering ──────────────────────────────────────────

describe('nx-governance-evaluation-card check alignment icons', () => {
  let card;
  afterEach(() => cleanup(card));

  it('renders a distinct icon class per alignment value, and an error state when check.error is set', async () => {
    const evaluation = fullEvaluation({
      text_evaluation: {
        evaluations: [
          {
            check_id: '1', check_title: 'Yes check', alignment: 'YES', category_id: 'c', category: 'C',
          },
          {
            check_id: '2', check_title: 'No check', alignment: 'NO', category_id: 'c', category: 'C',
          },
          {
            check_id: '3', check_title: 'NA check', alignment: 'NA', category_id: 'c', category: 'C',
          },
          {
            check_id: '4', check_title: 'Error check', alignment: null, error: 'timed out', category_id: 'c', category: 'C',
          },
        ],
        successful_checks: 1,
        failed_checks: 1,
        not_applicable_checks: 1,
        error_checks: 1,
      },
      image_evaluations: [],
    });
    card = makeCard(evaluation);
    await card.updateComplete;

    card.shadowRoot.querySelector('.ge-text-section .ge-cat-header').click();
    await card.updateComplete;

    const rows = card.shadowRoot.querySelectorAll('.ge-text-section .ge-check-row');
    expect(rows[0].querySelector('.ge-check-yes')).to.exist;
    expect(rows[1].querySelector('.ge-check-no')).to.exist;
    expect(rows[2].querySelector('.ge-check-na')).to.exist;
    expect(rows[3].querySelector('.ge-check-error')).to.exist;
  });
});

// ─── check reasoning & suggestions ─────────────────────────────────────────

describe('nx-governance-evaluation-card check reasoning & suggestions', () => {
  let card;
  afterEach(() => cleanup(card));

  function evaluationWithChecks(checks) {
    return fullEvaluation({
      text_evaluation: {
        evaluations: checks,
        successful_checks: checks.filter((c) => c.alignment === 'YES').length,
        failed_checks: checks.filter((c) => c.alignment === 'NO').length,
        not_applicable_checks: checks.filter((c) => c.alignment === 'NA').length,
        error_checks: 0,
      },
      image_evaluations: [],
    });
  }

  it('auto-expands failed checks and shows both reasoning and suggestion', async () => {
    card = makeCard(evaluationWithChecks([
      {
        check_id: '1', check_title: 'No Shouty Caps', alignment: 'NO', category_id: 'c', category: 'C', reasoning: 'Uses all caps.', suggestions: 'Use title case.',
      },
    ]));
    await card.updateComplete;

    card.shadowRoot.querySelector('.ge-text-section .ge-cat-header').click();

    const checkItem = card.shadowRoot.querySelector('.ge-check-item');
    expect(checkItem.open).to.be.true;
    const detail = checkItem.querySelector('.ge-check-detail');
    expect(detail.textContent).to.contain('Uses all caps.');
    expect(detail.textContent).to.contain('Use title case.');
    expect(detail.querySelector('.ge-check-suggestion')).to.exist;
  });

  it('keeps passing checks collapsed by default, showing reasoning without a suggestion once expanded', async () => {
    card = makeCard(evaluationWithChecks([
      {
        check_id: '1', check_title: 'Sophisticated Voice', alignment: 'YES', category_id: 'c', category: 'C', reasoning: 'Warm, sensory language throughout.', suggestions: null,
      },
    ]));
    await card.updateComplete;

    card.shadowRoot.querySelector('.ge-text-section .ge-cat-header').click();
    const checkItem = card.shadowRoot.querySelector('.ge-check-item');
    expect(checkItem.open).to.be.false;

    card.shadowRoot.querySelector('.ge-text-section .ge-check-row').click();
    expect(checkItem.open).to.be.true;

    const detail = checkItem.querySelector('.ge-check-detail');
    expect(detail.textContent).to.contain('Warm, sensory language throughout.');
    expect(detail.querySelector('.ge-check-suggestion')).to.not.exist;
  });

  it('toggles a single check row independently of its siblings', async () => {
    card = makeCard(evaluationWithChecks([
      {
        check_id: '1', check_title: 'Check A', alignment: 'NO', category_id: 'c', category: 'C', reasoning: 'Reason A.', suggestions: 'Fix A.',
      },
      {
        check_id: '2', check_title: 'Check B', alignment: 'NO', category_id: 'c', category: 'C', reasoning: 'Reason B.', suggestions: 'Fix B.',
      },
    ]));
    await card.updateComplete;

    card.shadowRoot.querySelector('.ge-text-section .ge-cat-header').click();

    const items = card.shadowRoot.querySelectorAll('.ge-text-section .ge-check-item');
    expect(items).to.have.lengthOf(2);
    expect(items[0].open).to.be.true;
    expect(items[1].open).to.be.true;

    items[0].querySelector('.ge-check-row').click();

    expect(items[0].open).to.be.false;
    expect(items[1].open).to.be.true;
  });
});
