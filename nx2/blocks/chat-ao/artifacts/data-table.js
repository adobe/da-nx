import { html } from 'da-lit';
import { registerArtifact } from './registry.js';

registerArtifact('DataTable', ({ columns = [], data = [] }) => html`
  <div class="ui-artifact-table-wrapper">
    <table class="ui-artifact-table">
      <thead>
        <tr>${columns.map((col) => html`<th>${col.label ?? col.key}</th>`)}</tr>
      </thead>
      <tbody>
        ${data.map((row) => html`
          <tr>${columns.map((col) => html`<td>${row[col.key] ?? ''}</td>`)}</tr>
        `)}
      </tbody>
    </table>
  </div>
`);
