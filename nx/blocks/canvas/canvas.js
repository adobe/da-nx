import '../../deps/swc/dist/index.js';
import './src/bootstrap-nx.js';
import './src/space.js';

export default function decorate(block) {
  block.innerHTML = `
    <sp-theme system="spectrum-two" scale="medium" color="light">
      <da-space></da-space>
    </sp-theme>
  `;
}
