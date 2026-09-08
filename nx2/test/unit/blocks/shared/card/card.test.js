import { expect } from '@esm-bundle/chai';
import '../../../../../blocks/shared/card/card.js';

const created = [];

async function createCard(props = {}, slots = {}) {
  const el = document.createElement('nx-card');
  Object.entries(props).forEach(([k, v]) => {
    if (typeof v === 'boolean') {
      if (v) el.setAttribute(k, '');
      else el.removeAttribute(k);
    } else if (v !== undefined && v !== null) {
      el.setAttribute(k, v);
    }
  });
  if (slots.default) el.append(slots.default);
  if (slots.actions) {
    const node = slots.actions;
    if (!node.setAttribute) throw new TypeError('actions slot requires an Element');
    node.setAttribute('slot', 'actions');
    el.append(node);
  }
  if (slots.pill) {
    const node = slots.pill;
    if (!node.setAttribute) throw new TypeError('pill slot requires an Element');
    node.setAttribute('slot', 'pill');
    el.append(node);
  }
  document.body.appendChild(el);
  created.push(el);
  await el.updateComplete;
  return el;
}

function q(el, selector) {
  return el.shadowRoot.querySelector(selector);
}

describe('nx-card', () => {
  afterEach(() => {
    while (created.length) created.pop().remove();
  });

  it('registers the custom element', () => {
    expect(customElements.get('nx-card')).to.exist;
  });

  it('renders heading and subheading text when provided', async () => {
    const el = await createCard({ heading: 'My Skill', subheading: 'description here' });
    expect(q(el, '.card-heading')?.textContent.trim()).to.equal('My Skill');
    expect(q(el, '.card-subheading')?.textContent.trim()).to.equal('description here');
  });

  it('omits heading and subheading when not provided', async () => {
    const el = await createCard();
    expect(q(el, '.card-heading')).to.be.null;
    expect(q(el, '.card-subheading')).to.be.null;
  });

  it('renders the pill when the pill attribute is set', async () => {
    const el = await createCard({ pill: 'NEW' });
    expect(q(el, '.card-pill')?.textContent.trim()).to.equal('NEW');
  });

  it('does NOT render a pill badge when the pill attribute is an empty string', async () => {
    const el = await createCard({ pill: '' });
    expect(q(el, '.card-pill')).to.be.null;
  });

  it('does NOT render a pill badge when the pill attribute is unset', async () => {
    const el = await createCard();
    expect(q(el, '.card-pill')).to.be.null;
  });

  it('exposes a named pill slot when the pill attribute is unset', async () => {
    const el = await createCard();
    expect(q(el, 'slot[name="pill"]')).to.exist;
  });

  it('hides the pill slot when the pill attribute takes precedence', async () => {
    const pillNode = document.createElement('span');
    pillNode.textContent = 'SLOTTED';
    const el = await createCard({ pill: 'ATTR' }, { pill: pillNode });
    expect(q(el, '.card-pill')?.textContent.trim()).to.equal('ATTR');
    expect(q(el, 'slot[name="pill"]')).to.be.null;
  });

  it('reflects boolean attributes selected and interactive', async () => {
    const el = await createCard({ selected: true, interactive: true });
    expect(el.hasAttribute('selected')).to.be.true;
    expect(el.hasAttribute('interactive')).to.be.true;
  });

  it('exposes default and actions slots', async () => {
    const child = document.createElement('div');
    child.className = 'inner';
    child.textContent = 'body content';
    const action = document.createElement('button');
    action.textContent = 'Edit';
    const el = await createCard({ heading: 'Card' }, { default: child, actions: action });
    const slots = el.shadowRoot.querySelectorAll('slot');
    const slotNames = [...slots].map((s) => s.getAttribute('name') || 'default');
    expect(slotNames).to.include.members(['default', 'actions']);
  });

  it('guards customElements.define against double registration', () => {
    expect(() => customElements.define('nx-card', class extends HTMLElement {})).to.throw();
    expect(customElements.get('nx-card')).to.exist;
  });
});
