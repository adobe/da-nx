import { getConfig, loadStyle, loadArea } from '../../scripts/nexter.js';

await loadStyle(`${import.meta.url.replace('js', 'css')}`);

const { nxBase } = getConfig();

function getCloseBtn(dialog) {
  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.className = 'nx-dialog-close-btn';
  closeBtn.innerHTML = `<img src="${nxBase}/img/icons/S2IconClose20N-icon.svg" width="20" height="20" />`;
  closeBtn.addEventListener('click', () => {
    dialog.close();
  });
  return closeBtn;
}

async function getContent(path) {
  const div = document.createElement('div');
  div.className = 'nx-dialog-content';

  const resp = await fetch(`${path}.plain.html`);
  if (resp.ok) {
    const html = await resp.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    await loadArea(doc.body);
    div.append(...doc.body.querySelectorAll(':scope > *'));
  }

  return div;
}

export default async function init(path) {
  // Build the dialog
  const dialog = document.createElement('dialog');
  dialog.className = 'nx-dialog';

  // Add the close button
  const closeBtn = getCloseBtn(dialog);

  // Fetch the content
  const content = await getContent(path);

  dialog.append(closeBtn, content);

  document.body.append(dialog);
  dialog.showModal();
  dialog.addEventListener('close', () => {
    dialog.remove();
  });
}
