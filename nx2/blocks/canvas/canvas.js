import './nx-canvas-header/nx-canvas-header.js';

export default async function decorate(block) {
  const header = document.createElement('nx-canvas-header');
  block.before(header);
}
