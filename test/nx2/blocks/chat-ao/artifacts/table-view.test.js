import { expect } from '@esm-bundle/chai';
import { render } from 'da-lit';
import { renderUiArtifact } from '../../../../../nx2/blocks/chat-ao/artifacts/index.js';
import { tableToCsv } from '../../../../../nx2/blocks/chat-ao/artifacts/utils/table-view.js';

const COLUMNS = [
  { id: 'name', isRowHeader: true, name: 'Dataflow' },
  { id: 'source', name: 'Source' },
  { id: 'status', name: 'Status' },
  { id: 'records', name: 'Records (24h)' },
  { id: 'lastRun', name: 'Last Run' },
];
const ITEMS = [
  {
    id: '1', name: 'CRM Daily Import', source: 'Amazon S3', status: 'Failed', records: '0', lastRun: '2026-10-22 06:00',
  },
  {
    id: '2', name: 'Web Events Stream', source: 'HTTP API', status: 'Active', records: '1,284,900', lastRun: '2026-10-22 05:30',
  },
  {
    id: '3', name: 'Loyalty Enrichment', source: 'Data Landing Zone', status: 'Active', records: '52,310', lastRun: '2026-10-22 04:00',
  },
  {
    id: '4', name: 'Marketo Leads', source: 'Marketo', status: 'Warning', records: '8,470', lastRun: '2026-10-22 03:15',
  },
  {
    id: '5', name: 'POS Transactions', source: 'Azure Blob', status: 'Active', records: '340,215', lastRun: '2026-10-21 23:00',
  },
];
const LABEL = 'Dataflow Health (Last 24 Hours)';

function mount(fields, textFallback) {
  const host = document.createElement('div');
  render(renderUiArtifact({
    components: [{ id: 'root', component: 'TableView', columns: COLUMNS, items: ITEMS, ...fields }],
    textFallback,
  }), host);
  return host;
}

describe('artifacts TableView', () => {
  it('renders the upstream dataflow payload with a caption and semantic row headers', () => {
    const host = mount({ label: LABEL, selectionMode: 'none', allowsCsvExport: true });
    expect(host.querySelector('caption').textContent).to.equal(LABEL);
    expect(host.querySelector('[role="region"]').getAttribute('aria-label')).to.equal(LABEL);
    expect(host.querySelector('[role="region"]').tabIndex).to.equal(0);
    expect([...host.querySelectorAll('thead th[scope="col"]')].map((cell) => cell.textContent))
      .to.deep.equal(COLUMNS.map((col) => col.name));
    expect([...host.querySelectorAll('tbody th[scope="row"]')].map((cell) => cell.textContent))
      .to.deep.equal(ITEMS.map((row) => row.name));
    expect(host.querySelectorAll('tbody tr')).to.have.length(5);
    expect([...host.querySelectorAll('tbody th, tbody td')].map((cell) => cell.textContent))
      .to.deep.equal(ITEMS.flatMap((row) => COLUMNS.map((col) => row[col.id])));
    expect(host.querySelector('button').textContent).to.equal('Download CSV');
    expect(host.querySelector('input, select, .ui-artifact-fallback')).to.equal(null);
  });

  it('renders literal zero and false, with blank null or absent cells', () => {
    const host = mount({
      columns: ['zero', 'false', 'null', 'missing'].map((id) => ({ id, name: id })),
      items: [{ id: 'a', zero: 0, false: false, null: null }],
    });
    expect([...host.querySelectorAll('td')].map((cell) => cell.textContent))
      .to.deep.equal(['0', 'false', '', '']);
    expect(host.querySelector('button, caption')).to.equal(null);
  });

  it('renders an empty table when columns and items are empty', () => {
    const host = mount({ columns: [], items: [] });
    expect(host.querySelector('table')).to.exist;
    expect(host.querySelectorAll('tbody tr')).to.have.length(0);
  });

  it('does not read inherited properties for missing cells or CSV values', () => {
    const columns = ['constructor', 'toString', '__proto__'].map((id) => ({ id, name: id }));
    const items = [{ id: 'a' }];
    const host = mount({ columns, items });
    expect([...host.querySelectorAll('td')].map((cell) => cell.textContent))
      .to.deep.equal(['', '', '']);
    expect(tableToCsv({ columns, items })).to.equal('"constructor","toString","__proto__"\r\n"","",""');
  });

  it('escapes caption, headers and cell content as text', () => {
    const text = '<img src=x onerror=alert(1)>';
    const host = mount({
      label: text, columns: [{ id: 'value', name: text }], items: [{ id: 'a', value: text }],
    });
    expect(host.querySelector('img')).to.equal(null);
    expect(host.querySelector('caption').textContent).to.equal(text);
    expect(host.querySelector('thead th').textContent).to.equal(text);
    expect(host.querySelector('td').textContent).to.equal(text);
  });

  it('still supports nested artifact records inside a Card', () => {
    const host = document.createElement('div');
    render(renderUiArtifact({
      components: [{
        type: 'Card',
        children: [{ type: 'TableView', props: { columns: COLUMNS, items: ITEMS } }],
      }],
    }), host);
    expect(host.querySelector('.ui-artifact-card table')).to.exist;
  });

  it('builds UTF-8 CSV and cleans up the temporary download URL', async () => {
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    const originalClick = HTMLAnchorElement.prototype.click;
    const revoked = [];
    let blob;
    let download;
    URL.createObjectURL = (value) => {
      blob = value;
      return 'blob:table-test';
    };
    URL.revokeObjectURL = (href) => revoked.push(href);
    HTMLAnchorElement.prototype.click = function click() {
      download = { href: this.href, filename: this.download };
    };
    try {
      mount({ allowsCsvExport: true }).querySelector('button').click();
      expect(download).to.deep.equal({
        href: 'blob:table-test', filename: 'table.csv',
      });
      expect(blob.type).to.equal('text/csv;charset=utf-8');
      const bytes = new Uint8Array(await blob.arrayBuffer());
      expect([...bytes.slice(0, 3)]).to.deep.equal([239, 187, 191]);
      expect(await blob.text()).to.equal(tableToCsv({ columns: COLUMNS, items: ITEMS }));
      expect(document.querySelector('a[download="table.csv"]')).to.equal(null);
      await new Promise((resolve) => { setTimeout(resolve, 0); });
      expect(revoked).to.deep.equal(['blob:table-test']);
    } finally {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
      HTMLAnchorElement.prototype.click = originalClick;
    }
  });

  [
    { label: { path: '/label' } },
    { columns: undefined },
    { columns: [{ key: 'name', label: 'Name' }] },
    { columns: [{ id: 'name', name: { path: '/name' } }] },
    { columns: [{ id: 'name', name: 'Name', isRowHeader: 'true' }] },
    { columns: [{ id: 'name', name: 'Name', allowsResizing: true }] },
    { columns: [{ id: 'name', name: 'Name', type: 'thumbnail' }] },
    { items: undefined },
    { items: { path: '/rows' } },
    { items: [null] },
    { items: [{ name: 'Missing row id' }] },
    { items: [{ id: 'a', name: { path: '/name' } }] },
    { items: [{ id: 'a', records: Infinity }] },
    { selectionMode: 'single' },
    { selectionMode: 'multiple' },
    { allowsCsvExport: 'true' },
  ].forEach((fields) => {
    it(`uses text fallback for unsupported content ${JSON.stringify(fields)}`, () => {
      const host = mount(fields, 'Dataflow health summary.');
      expect(host.querySelector('table, button')).to.equal(null);
      expect(host.querySelector('.ui-artifact-fallback').textContent).to.equal('Dataflow health summary.');
    });
  });
});

describe('TableView CSV', () => {
  it('preserves displayed column order, escaping and literal values', () => {
    expect(tableToCsv({
      columns: ['b', 'a', 'zero', 'false', 'null', 'missing'].map((id) => ({ id, name: id })),
      items: [{
        id: 'a', a: 'Line 1\nLine 2', b: 'One, "two"', zero: 0, false: false, null: null,
      }],
    })).to.equal('"b","a","zero","false","null","missing"\r\n"One, ""two""","Line 1\nLine 2","0","false","",""');
  });

  it('neutralizes formula-like strings in headers and values without changing numeric negatives', () => {
    expect(tableToCsv({
      columns: [{ id: 'value', name: '=header' }],
      items: ['=1+1', '+1', '-1', '@SUM(1)', '  =1', '\ttext', '\rtext', '\ntext', -1]
        .map((value, index) => ({ id: String(index), value })),
    })).to.equal([
      '"\'=header"', '"\'=1+1"', '"\'+1"', '"\'-1"', '"\'@SUM(1)"', '"\'  =1"',
      '"\'\ttext"', '"\'\rtext"', '"\'\ntext"', '"-1"',
    ].join('\r\n'));
  });
});
