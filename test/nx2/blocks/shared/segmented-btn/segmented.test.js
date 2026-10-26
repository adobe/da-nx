import { expect } from '@esm-bundle/chai';

async function makeSegmented(props) {
  const el = document.createElement('nx-segmented-btn');
  Object.assign(el, props);
  document.body.append(el);
  await el.updateComplete;
  return el;
}

const getSegments = (el) => [...el.shadowRoot.querySelectorAll('.segment')];

describe('nx-segmented-btn', () => {
  let el;

  before(async () => {
    await import('../../../../../nx2/blocks/shared/segmented-btn/segmented.js');
  });

  afterEach(() => {
    el?.remove();
  });

  it('selects a segment and fires change', async () => {
    el = await makeSegmented({
      label: 'View',
      items: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }],
      value: 'a',
    });
    let detail;
    el.addEventListener('change', (e) => { detail = e.detail; });
    getSegments(el)[1].click();
    await el.updateComplete;
    expect(detail).to.deep.equal({ value: 'b' });
    expect(getSegments(el)[1].getAttribute('aria-pressed')).to.equal('true');
  });

  it('disables a segment and uses its title as the tooltip', async () => {
    el = await makeSegmented({
      label: 'Editor view',
      items: [
        { value: 'layout', label: 'Layout', disabled: true, title: 'Resolve conflicts' },
        { value: 'content', label: 'Content' },
      ],
      value: 'content',
    });
    const [layout, content] = getSegments(el);
    expect(layout.disabled).to.be.true;
    expect(layout.title).to.equal('Resolve conflicts');
    expect(content.disabled).to.be.false;
    expect(content.hasAttribute('title')).to.be.false;

    let fired = false;
    el.addEventListener('change', () => { fired = true; });
    layout.click();
    await el.updateComplete;
    expect(fired).to.be.false;
    expect(el.value).to.equal('content');
  });

  it('keeps the label as the tooltip of icon-only segments', async () => {
    el = await makeSegmented({
      label: 'View',
      items: [{ value: 'split', icon: '/x.svg', label: 'Split view', iconOnly: true }],
    });
    expect(getSegments(el)[0].title).to.equal('Split view');
  });
});
