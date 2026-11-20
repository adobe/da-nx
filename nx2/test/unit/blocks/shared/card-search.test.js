import { expect } from '@esm-bundle/chai';
import { attachCardSearch } from '../../../../blocks/shared/utils/card-search.js';

const search = (query) => {
  const results = [];
  document.dispatchEvent(new CustomEvent('nx-cards-filter', { detail: { query, results } }));
  return results;
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('attachCardSearch', () => {
  function setup() {
    const section = document.createElement('div');
    section.className = 'section';
    const container = document.createElement('div');
    section.append(container);
    document.body.append(section);
    const a = Object.assign(document.createElement('nx-action-card'), { heading: 'Traverse', description: 'Birds eye view.' });
    const b = Object.assign(document.createElement('nx-action-card'), { heading: 'Bulk Operations', description: 'Preview, publish.' });
    container.append(a, b);
    return { section, container, a, b };
  }

  it('matches heading and description case-insensitively', () => {
    const { section, container, a, b } = setup();
    attachCardSearch(container);
    const results = search('  BIRDS ');
    expect([a.hidden, b.hidden]).to.deep.equal([false, true]);
    expect(results.find((r) => r.section === section).count).to.equal(1);
  });

  it('shows all cards for an empty query', () => {
    const { container, a, b } = setup();
    attachCardSearch(container);
    search('trav');
    search('');
    expect([a.hidden, b.hidden]).to.deep.equal([false, false]);
  });

  it('ignores events once the container is removed', () => {
    const { section, container } = setup();
    attachCardSearch(container);
    section.remove();
    expect(search('trav').some((r) => r.section === section)).to.be.false;
  });

  it('announces readiness', () => {
    const { container } = setup();
    const ready = [];
    const onReady = () => ready.push(true);
    document.addEventListener('nx-cards-ready', onReady);
    attachCardSearch(container);
    document.removeEventListener('nx-cards-ready', onReady);
    expect(ready.length).to.equal(1);
  });
});
