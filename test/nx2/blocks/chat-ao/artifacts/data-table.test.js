import { expect } from '@esm-bundle/chai';
import { render } from 'da-lit';
import { renderUiArtifact } from '../../../../../nx2/blocks/chat-ao/artifacts/index.js';

function mount(template) {
  const host = document.createElement('div');
  render(template, host);
  return host;
}

function tableArtifact(props) {
  return renderUiArtifact({ components: [{ type: 'DataTable', props }] });
}

describe('artifacts DataTable', () => {
  it('renders column headers, using label over key', () => {
    const host = mount(tableArtifact({
      columns: [{ key: 'name', label: 'Name' }, { key: 'status' }],
      data: [],
    }));

    const headers = [...host.querySelectorAll('.ui-artifact-table th')].map((th) => th.textContent);
    expect(headers).to.deep.equal(['Name', 'status']);
  });

  it('renders one row per data item, cell values keyed by column', () => {
    const host = mount(tableArtifact({
      columns: [{ key: 'name' }, { key: 'status' }],
      data: [{ name: 'a', status: 'done' }, { name: 'b', status: 'open' }],
    }));

    const rows = [...host.querySelectorAll('.ui-artifact-table tbody tr')].map(
      (tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent),
    );
    expect(rows).to.deep.equal([['a', 'done'], ['b', 'open']]);
  });

  it('renders an empty cell rather than "undefined" for a missing value', () => {
    const host = mount(tableArtifact({
      columns: [{ key: 'name' }, { key: 'status' }],
      data: [{ name: 'a' }],
    }));

    const cells = [...host.querySelectorAll('.ui-artifact-table tbody td')].map((td) => td.textContent);
    expect(cells).to.deep.equal(['a', '']);
  });

  it('renders an empty table for missing columns/data rather than throwing', () => {
    const host = mount(tableArtifact({}));

    expect(host.querySelector('.ui-artifact-table')).to.exist;
    expect(host.querySelectorAll('th')).to.have.length(0);
    expect(host.querySelectorAll('tbody tr')).to.have.length(0);
  });

  it('renders inside a Card, nested like any other content type', () => {
    const host = mount(renderUiArtifact({
      components: [{
        type: 'Card',
        children: [{ type: 'DataTable', props: { columns: [{ key: 'x' }], data: [{ x: '1' }] } }],
      }],
    }));

    expect(host.querySelector('.ui-artifact-card .ui-artifact-table-wrapper')).to.exist;
  });
});
