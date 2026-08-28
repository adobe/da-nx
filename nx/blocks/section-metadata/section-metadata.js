import { loadStyle } from '../../../nx2/utils/utils.js';
import getElementMetadata from '../../../nx2/utils/getElementMetadata.js';

const style = await loadStyle(import.meta.url);

if (!document.adoptedStyleSheets.includes(style)) {
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, style];
}

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
  const classes = text.split(', ').map((s) => s.replaceAll(' ', '-'));
  section.classList.add(...classes);
}

async function handleLayout(text, section, type) {
  if (text === '0') return;
  section.classList.add(`${type}-${text}`);
}

function handleContainer(section) {
  const container = document.createElement('div');
  container.className = 'nx-section-container';
  for (const child of [...section.childNodes]) {
    if (!child.classList?.contains('nx-section-metadata')) {
      if (child.classList?.contains('block-content')) {
        const blockChildren = [...child.childNodes].filter(
          (item) => !item.classList?.contains('nx-section-metadata'),
        );
        container.append(...blockChildren);
      } else {
        container.append(child);
      }
    }
  }
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
