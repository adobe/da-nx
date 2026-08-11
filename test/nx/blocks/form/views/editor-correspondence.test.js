import { expect } from '@esm-bundle/chai';
import { createEngine } from '../../../../../nx/deps/da-sc-sdk/dist/index.js';
import '../../../../../nx/blocks/form/views/editor.js';

// Component-level UI tests for nx-editor. The engine is the real bundled SDK
// (same one the form block ships); we feed its getState() into the component
// and assert on the rendered shadow DOM — the repo's standard UI-test idiom.

const DEBOUNCE_MS = 350; // mirrors editor.js text-input debounce
const aTimeout = (ms) => new Promise((r) => { setTimeout(r, ms); });
const tick = () => new Promise((r) => { requestAnimationFrame(r); });
const settle = async (el) => {
  await el.updateComplete;
  await tick();
  await el.updateComplete;
};

const CONTROL_TAGS = ['FORM-INPUT', 'FORM-TEXTAREA', 'FORM-NUMBER-FIELD', 'FORM-CHECKBOX', 'FORM-PICKER'];

const mounted = [];
afterEach(() => { while (mounted.length) mounted.pop().remove(); });

async function mountEditor(schema, doc) {
  const el = window.document.createElement('nx-editor');
  // Play the shell: push fresh state on every engine mutation.
  const engine = createEngine({
    schema,
    document: doc,
    onChange: () => { el.state = engine.getState(); },
  });
  el.editor = engine;
  el.onSelect = () => {};
  el.nav = {};
  el.state = engine.getState();
  window.document.body.append(el);
  mounted.push(el);
  await settle(el);
  return { el, engine };
}

const esc = (p) => (window.CSS && CSS.escape ? CSS.escape(p) : p.replace(/"/g, '\\"'));
const allAt = (el, ptr) => [...el.shadowRoot.querySelectorAll(`[data-pointer="${esc(ptr)}"]`)];
const controlAt = (el, ptr) => allAt(el, ptr).find((n) => CONTROL_TAGS.includes(n.tagName));
const groupAt = (el, ptr) => allAt(el, ptr)
  .find((n) => n.matches('fieldset.form-node, section.form-node, article.form-array-item'));

function expectedTag(node) {
  if (Array.isArray(node.enumValues)) return 'FORM-PICKER';
  if (node.kind === 'boolean') return 'FORM-CHECKBOX';
  if (node.kind === 'number' || node.kind === 'integer') return 'FORM-NUMBER-FIELD';
  if (node.kind === 'string' && node.semanticType === 'long-text') return 'FORM-TEXTAREA';
  return 'FORM-INPUT';
}

const FEATURE_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'Feature Test Model',
  type: 'object',
  required: ['title', 'status'],
  properties: {
    title: { type: 'string', title: 'Title', minLength: 3, maxLength: 255 },
    status: { type: 'string', title: 'Status', enum: ['draft', 'in-review', 'published', 'archived'], default: 'draft' },
    body: { type: 'string', title: 'Body', 'x-semantic-type': 'long-text' },
    priority: { type: 'integer', title: 'Priority', minimum: 1, maximum: 10 },
    featured: { type: 'boolean', title: 'Featured', default: false },
    tags: { type: 'array', title: 'Tags', minItems: 1, items: { type: 'string', title: 'Tag' } },
    authors: { type: 'array', title: 'Authors', items: { $ref: '#/$defs/Author' } },
    seo: {
      type: 'object',
      title: 'SEO',
      properties: {
        metaTitle: { type: 'string', title: 'Meta Title', maxLength: 60 },
        noIndex: { type: 'boolean', title: 'No Index' },
      },
    },
  },
  $defs: {
    Author: {
      type: 'object',
      title: 'Author',
      required: ['name'],
      properties: {
        name: { type: 'string', title: 'Name' },
        role: { type: 'string', title: 'Role', enum: ['writer', 'editor', 'reviewer'], default: 'writer' },
      },
    },
  },
};

const featureDoc = (data = {}) => ({
  metadata: { schemaName: 'feature-test' },
  data: {
    title: 'Launch Announcement',
    status: 'published',
    body: 'Body copy.',
    priority: 3,
    featured: true,
    tags: ['news', 'launch'],
    authors: [
      { name: 'Ada Lovelace', role: 'writer' },
      { name: 'Grace Hopper', role: 'editor' },
    ],
    seo: { metaTitle: 'Launch Announcement', noIndex: false },
    ...data,
  },
});

describe('nx-editor loads', () => {
  it('renders the root and one element per top-level model field', async () => {
    const { el } = await mountEditor(FEATURE_SCHEMA, featureDoc());
    expect(el.shadowRoot.querySelector('.editor-root')).to.exist;
    const { children } = el.state.model.root;
    expect(children.length).to.be.greaterThan(0);
    children.forEach((child) => {
      expect(allAt(el, child.pointer).length, child.pointer).to.be.greaterThan(0);
    });
  });
});

describe('nx-editor renders the model state', () => {
  function walk(el, node) {
    expect(allAt(el, node.pointer).length, `element for ${node.pointer}`).to.be.greaterThan(0);
    if (node.kind === 'object') {
      (node.children ?? []).forEach((child) => walk(el, child));
      return;
    }
    if (node.kind === 'array') {
      const section = groupAt(el, node.pointer);
      const rows = section.querySelectorAll(':scope > .form-array-item');
      expect(rows.length, `rows for ${node.pointer}`).to.equal((node.items ?? []).length);
      (node.items ?? []).forEach((item) => walk(el, item));
      return;
    }
    expect(controlAt(el, node.pointer)?.tagName, `control for ${node.pointer}`).to.equal(expectedTag(node));
  }

  it('renders a matching element and control for every node', async () => {
    const { el } = await mountEditor(FEATURE_SCHEMA, featureDoc());
    walk(el, el.state.model.root);
  });

  it('renders the enum picker with the schema options and default', async () => {
    const { el } = await mountEditor(FEATURE_SCHEMA, featureDoc({ status: undefined }));
    const picker = controlAt(el, '/data/status');
    expect(picker.tagName).to.equal('FORM-PICKER');
    // form-picker relocates slotted <option>s into its shadow <select> and
    // prepends a placeholder (empty value); filter that out.
    const options = [...picker.shadowRoot.querySelectorAll('select option')]
      .map((o) => o.value).filter(Boolean);
    expect(options).to.deep.equal(['draft', 'in-review', 'published', 'archived']);
  });
});

export {
  mountEditor, allAt, controlAt, groupAt, settle, aTimeout, DEBOUNCE_MS,
  FEATURE_SCHEMA, featureDoc,
};
