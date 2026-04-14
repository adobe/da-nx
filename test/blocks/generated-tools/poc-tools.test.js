import { expect } from '@esm-bundle/chai';
import {
  SEEDED_GENERATED_TOOLS,
  mergeWithSeededGeneratedTools,
  findBestGeneratedTool,
  executeReadabilityTool,
  executeHeadingValidationTool,
} from '../../../nx/blocks/canvas/src/generated-tools/poc-tools.js';

describe('generated tools poc helpers', () => {
  it('falls back to seeded generated tools when nothing is stored', () => {
    const merged = mergeWithSeededGeneratedTools([]);
    expect(merged.map((tool) => tool.id)).to.include('readability-score');
    expect(merged.map((tool) => tool.id)).to.include('validate-headings');
  });

  it('prefers stored tool state over seeded defaults', () => {
    const merged = mergeWithSeededGeneratedTools([
      {
        ...SEEDED_GENERATED_TOOLS[0],
        status: 'approved',
        approvedBy: 'alice@example.com',
      },
    ]);

    const readability = merged.find((tool) => tool.id === 'readability-score');
    expect(readability.status).to.equal('approved');
    expect(readability.approvedBy).to.equal('alice@example.com');
  });

  it('finds the best approved generated tool for a readability query', () => {
    const match = findBestGeneratedTool('check readability of this page copy', [
      { ...SEEDED_GENERATED_TOOLS[0], status: 'approved' },
      { ...SEEDED_GENERATED_TOOLS[1], status: 'approved' },
    ]);

    expect(match.tool.id).to.equal('readability-score');
  });

  it('finds the best approved generated tool for a heading structure query', () => {
    const match = findBestGeneratedTool('validate heading structure for accessibility', [
      { ...SEEDED_GENERATED_TOOLS[0], status: 'approved' },
      { ...SEEDED_GENERATED_TOOLS[1], status: 'approved' },
    ]);

    expect(match.tool.id).to.equal('validate-headings');
  });

  it('computes a readability score from HTML', () => {
    const result = executeReadabilityTool({
      html: '<h1>Title</h1><p>This is a simple sentence. This is another clear sentence.</p>',
    });

    expect(result.score).to.be.a('number');
    expect(result.words).to.be.greaterThan(5);
    expect(result.sentences).to.equal(2);
  });

  it('reports heading hierarchy issues', () => {
    const result = executeHeadingValidationTool({
      html: '<h2>Intro</h2><h4>Skipped</h4>',
    });

    expect(result.valid).to.equal(false);
    expect(result.issues.join(' ')).to.include('expected h1');
    expect(result.issues.join(' ')).to.include('Level skip');
  });
});
