import './nx-skills-editor.js';

export default function decorate(block) {
  const el = document.createElement('nx-skills-editor');
  block.textContent = '';
  block.append(el);
}

export function getPanel() {
  const el = document.createElement('nx-skills-editor');
  return el;
}
