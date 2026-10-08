import { expect } from '@esm-bundle/chai';
import { whenSectionsLoaded } from '../../../../../nx/public/plugins/quick-edit/src/section-ready.js';

const nextMutation = () => new Promise((resolve) => { setTimeout(resolve, 0); });

function main(html) {
  const el = document.createElement('main');
  el.innerHTML = html;
  document.body.append(el);
  return el;
}

describe('whenSectionsLoaded', () => {
  let root;

  afterEach(() => root?.remove());

  it('treats a page without section status as ready immediately', () => {
    root = main('<div><p data-prose-index="1">a</p></div>');
    const ready = [];
    whenSectionsLoaded(root, (section) => ready.push(section));
    expect(ready).to.deep.equal([root]);
  });

  it('calls back for already loaded sections synchronously', () => {
    root = main('<div class="section" data-section-status="loaded"></div>'
      + '<div class="section" data-section-status="loaded"></div>');
    const ready = [];
    whenSectionsLoaded(root, (section) => ready.push(section));
    expect(ready).to.deep.equal([...root.children]);
  });

  it('waits for a loading section to report loaded', async () => {
    root = main('<div class="section" data-section-status="loaded"></div>'
      + '<div class="section" data-section-status="loading"></div>');
    const [first, second] = root.children;
    const ready = [];
    whenSectionsLoaded(root, (section) => ready.push(section));
    expect(ready).to.deep.equal([first]);

    second.setAttribute('data-section-status', 'loaded');
    await nextMutation();
    expect(ready).to.deep.equal([first, second]);
  });

  it('ignores sections nested inside another section (e.g. fragments)', async () => {
    root = main('<div class="section" data-section-status="loading">'
      + '<div class="fragment"><div class="section" data-section-status="loaded"></div></div>'
      + '</div>');
    const outer = root.firstElementChild;
    const ready = [];
    whenSectionsLoaded(root, (section) => ready.push(section));
    expect(ready).to.deep.equal([]);

    outer.setAttribute('data-section-status', 'loaded');
    await nextMutation();
    expect(ready).to.deep.equal([outer]);
  });

  it('does not call back after being cancelled', async () => {
    root = main('<div class="section" data-section-status="loading"></div>');
    const ready = [];
    const cancel = whenSectionsLoaded(root, (section) => ready.push(section));
    cancel();
    root.firstElementChild.setAttribute('data-section-status', 'loaded');
    await nextMutation();
    expect(ready).to.deep.equal([]);
  });

  it('drops sections that were removed before loading', async () => {
    root = main('<div class="section" data-section-status="loading"></div>'
      + '<div class="section" data-section-status="loading"></div>');
    const [removed, kept] = root.children;
    const ready = [];
    whenSectionsLoaded(root, (section) => ready.push(section));

    removed.remove();
    kept.setAttribute('data-section-status', 'loaded');
    await nextMutation();
    expect(ready).to.deep.equal([kept]);
  });
});
