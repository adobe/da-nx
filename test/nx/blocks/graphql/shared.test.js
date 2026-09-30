import { expect } from '@esm-bundle/chai';
import { html, render } from 'da-lit';
import '../../../../nx/blocks/graphql/shared/confirm/confirm.js';
import {
  delegateRowClick, nextSort, renderEmptyRow, renderSortHeader,
} from '../../../../nx/blocks/graphql/shared/table/table.js';

const mountConfirm = async () => {
  const el = document.createElement('nx-confirm');
  document.body.append(el);
  await el.updateComplete;
  return el;
};

const dialogOf = async (el) => {
  await new Promise((resolve) => { setTimeout(resolve, 50); });
  await el.updateComplete;
  return el.shadowRoot.querySelector('nx-dialog');
};

describe('shared', () => {
  it('resolves a confirmation from the dialog buttons', async () => {
    const el = await mountConfirm();
    const accepted = el.ask({
      title: 'Delete endpoint?', body: html`<p><strong>main</strong></p>`, confirmLabel: 'Delete', negative: true,
    });
    const dialog = await dialogOf(el);
    expect(dialog.getAttribute('title')).to.equal('Delete endpoint?');
    expect(dialog.querySelector('strong').textContent).to.equal('main');
    dialog.querySelector('.nx-form-btn-primary.negative').click();
    expect(await accepted).to.equal(true);
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('nx-dialog')).to.equal(null);

    const declined = el.ask({ title: 'Discard?', body: 'Changes are lost.', confirmLabel: 'Discard' });
    const second = await dialogOf(el);
    expect(second.textContent).to.include('Changes are lost.');
    second.dispatchEvent(new Event('close'));
    expect(await declined).to.equal(false);
    el.remove();
  });

  it('renders sort headers and empty rows', () => {
    const sorts = [];
    const header = (key, label) => renderSortHeader({
      key,
      label,
      className: key,
      sort: { key: 'name', direction: 'ascending' },
      onSort: (sort) => sorts.push(sort),
    });
    const container = document.createElement('table');
    render(html`
      <thead><tr>${header('name', 'Name')}${header('id', 'ID')}</tr></thead>
      <tbody>${renderEmptyRow({ colspan: 2, text: 'Nothing here.' })}</tbody>`, container);
    const [name, id] = container.querySelectorAll('th');
    expect([name.textContent.trim(), name.getAttribute('aria-sort')]).to.deep.equal(['Name', 'ascending']);
    expect(id.hasAttribute('aria-sort')).to.equal(false);
    name.querySelector('button').click();
    expect(sorts).to.deep.equal([{ key: 'name', direction: 'descending' }]);
    expect(container.querySelector('.no-match td').colSpan).to.equal(2);
    expect(container.querySelector('.no-match').textContent.trim()).to.equal('Nothing here.');
  });

  it('turns a row click into a click on the row control', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = host.attachShadow({ mode: 'open' });
    render(html`
      <label><table><tbody>
        <tr @click=${delegateRowClick}>
          <td class="text">Some text</td>
          <td><a class="row-control" href="#/x">x</a><button type="button">Other</button></td>
        </tr>
      </tbody></table></label>`, root);
    let followed = 0;
    root.querySelector('.row-control').addEventListener('click', (e) => {
      e.preventDefault();
      followed += 1;
    });
    const text = root.querySelector('.text');

    text.click();
    expect(followed).to.equal(1);
    root.querySelector('button').click();
    expect(followed).to.equal(1);
    root.querySelector('.row-control').click();
    expect(followed).to.equal(2);

    document.getSelection().selectAllChildren(text);
    text.click();
    expect(followed).to.equal(2);
    document.getSelection().removeAllRanges();
    host.remove();
  });

  it('cycles the sort direction per column', () => {
    const sort = { key: 'title', direction: 'ascending' };
    expect(nextSort({ sort, key: 'title' })).to.deep.equal({ key: 'title', direction: 'descending' });
    expect(nextSort({ sort, key: 'id' })).to.deep.equal({ key: 'id', direction: 'ascending' });
  });
});
