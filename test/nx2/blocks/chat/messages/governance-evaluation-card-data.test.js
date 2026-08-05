import { expect } from '@esm-bundle/chai';
import {
  groupChecksByCategory,
  sectionSummary,
} from '../../../../../nx2/blocks/chat/messages/governance-evaluation-card-data.js';

// ─── groupChecksByCategory ──────────────────────────────────────────────────

describe('groupChecksByCategory', () => {
  it('groups checks under their category, preserving first-seen order', () => {
    const evaluations = [
      {
        check_id: '1', check_title: 'A', alignment: 'YES', category_id: 'cat-1', category: 'Voice',
      },
      {
        check_id: '2', check_title: 'B', alignment: 'NO', category_id: 'cat-2', category: 'SEO',
      },
      {
        check_id: '3', check_title: 'C', alignment: 'YES', category_id: 'cat-1', category: 'Voice',
      },
    ];

    const groups = groupChecksByCategory(evaluations);

    expect(groups).to.have.lengthOf(2);
    expect(groups[0]).to.deep.equal({
      categoryId: 'cat-1',
      categoryName: 'Voice',
      checks: [evaluations[0], evaluations[2]],
    });
    expect(groups[1]).to.deep.equal({
      categoryId: 'cat-2',
      categoryName: 'SEO',
      checks: [evaluations[1]],
    });
  });

  it('falls back to an Uncategorized bucket when category fields are missing', () => {
    const evaluations = [{ check_id: '1', check_title: 'A', alignment: 'YES' }];

    const groups = groupChecksByCategory(evaluations);

    expect(groups).to.deep.equal([
      { categoryId: 'uncategorized', categoryName: 'Uncategorized', checks: evaluations },
    ]);
  });

  it('returns an empty array when given no evaluations', () => {
    expect(groupChecksByCategory([])).to.deep.equal([]);
    expect(groupChecksByCategory(undefined)).to.deep.equal([]);
    expect(groupChecksByCategory(null)).to.deep.equal([]);
  });
});

// ─── sectionSummary ─────────────────────────────────────────────────────────

describe('sectionSummary', () => {
  it('builds counts and percent from the section rollup fields', () => {
    const section = {
      successful_checks: 3,
      failed_checks: 1,
      not_applicable_checks: 2,
      error_checks: 0,
    };

    expect(sectionSummary(section)).to.deep.equal({
      successful: 3,
      failed: 1,
      notApplicable: 2,
      error: 0,
      total: 6,
      percent: 75,
    });
  });

  it('returns 0 percent when there are no successful or failed checks', () => {
    const section = {
      successful_checks: 0, failed_checks: 0, not_applicable_checks: 1, error_checks: 0,
    };

    expect(sectionSummary(section).percent).to.equal(0);
  });

  it('treats missing rollup fields as zero', () => {
    expect(sectionSummary({})).to.deep.equal({
      successful: 0, failed: 0, notApplicable: 0, error: 0, total: 0, percent: 0,
    });
  });

  it('treats a missing section as all zeros', () => {
    expect(sectionSummary(undefined)).to.deep.equal({
      successful: 0, failed: 0, notApplicable: 0, error: 0, total: 0, percent: 0,
    });
  });
});
