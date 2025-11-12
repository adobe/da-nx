import getElementMetadata from '../../utils/getElementMetadata.js';

function handleBackground(content, section) {
  const pic = content.querySelector('picture');
  if (pic) {
    section.classList.add('has-background');
    pic.classList.add('section-background');
    section.insertAdjacentElement('afterbegin', pic);
    return;
  }
  const color = content.textContent;
  if (color) {
    section.style.background = color;
  }
}

async function handleStyle(text, section) {
  const styles = text.split(', ').map((style) => style.replaceAll(' ', '-'));
  section.classList.add(...styles);
}

async function handleLayout(text, section, type) {
  if (text === '0') return;
  section.classList.add(`${type}-${text}`);
}

function handleContainer(section) {
  const container = document.createElement('div');
  container.className = 'nx-section-container';
  const children = section.childNodes;
  const filtered = [...children].filter((item) => !item.classList?.contains('nx-section-metadata'));
  container.append(...filtered);
  section.insertAdjacentElement('afterbegin', container);
}

export default async function init(el) {
  const section = el.closest('.section');
  if (!section) return;
  handleContainer(section);
  const metadata = getElementMetadata(el);
  if (metadata.style?.text) await handleStyle(metadata.style.text, section);
  if (metadata.background?.content) handleBackground(metadata.background.content, section);
  if (metadata.grid?.text) handleLayout(metadata.grid.text, section, 'grid');
  if (metadata.gap?.text) handleLayout(metadata.gap.text, section, 'gap');
  if (metadata.spacing?.text) handleLayout(metadata.spacing.text, section, 'spacing');
  if (metadata['spacing-top']?.text) handleLayout(metadata['spacing-top'].text, section, 'spacing-top');
  if (metadata['spacing-bottom']?.text) handleLayout(metadata['spacing-bottom'].text, section, 'spacing-bottom');
  el.remove();
}
