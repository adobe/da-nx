import '../../deps/swc/dist/index.js';
import './src/bootstrap-nx.js';
import './src/space.js';

const EXP_WARNING_DOCS_URL = 'https://docs.da.live/about/early-access/experience-workspace';

/** Demo-only warning; native <dialog> pattern from src/block-picker-dialog.js */
function showExpWorkspaceWarning() {
  if (!document.getElementById('da-exp-workspace-warning-style')) {
    const style = document.createElement('style');
    style.id = 'da-exp-workspace-warning-style';
    style.textContent = `
      #da-exp-workspace-warning-dialog {
        padding: 24px;
        border: none;
        border-radius: var(--spectrum-corner-radius-200, 8px);
        max-width: 480px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.24);
        background: var(--spectrum-white, #fff);
        color: var(--spectrum-gray-900, #1d1d1d);
        font-family: var(--spectrum-sans-font-family-stack, adobe-clean, sans-serif);
      }
      #da-exp-workspace-warning-dialog::backdrop {
        background: rgba(0,0,0,0.4);
      }
      #da-exp-workspace-warning-dialog h3 {
        margin: 0 0 8px;
        font-size: var(--spectrum-heading-size-s, 18px);
        font-weight: 700;
      }
      #da-exp-workspace-warning-dialog hr {
        border: none;
        border-top: 1px solid var(--spectrum-gray-200, #e0e0e0);
        margin: 0 -24px 16px;
      }
      #da-exp-workspace-warning-dialog p {
        margin: 0 0 16px;
        font-size: 0.875rem;
        line-height: 1.5;
      }
      #da-exp-workspace-warning-dialog .da-exp-warning-footer {
        display: flex;
        justify-content: flex-end;
      }
    `;
    document.head.appendChild(style);
  }

  const dialog = document.createElement('dialog');
  dialog.id = 'da-exp-workspace-warning-dialog';

  const heading = document.createElement('h3');
  heading.textContent = 'Warning';

  const divider = document.createElement('hr');

  const body = document.createElement('p');
  body.innerHTML = `You are loading an outdated demo version of experience workspace. Experience workspace alpha is now avaiable. For details see <a href="${EXP_WARNING_DOCS_URL}" target="_blank" rel="noopener noreferrer">${EXP_WARNING_DOCS_URL}</a>.`;

  const footer = document.createElement('div');
  footer.className = 'da-exp-warning-footer';

  const dismissBtn = document.createElement('sp-button');
  dismissBtn.setAttribute('variant', 'accent');
  dismissBtn.textContent = 'Dismiss';
  dismissBtn.addEventListener('click', () => dialog.close());

  footer.appendChild(dismissBtn);
  dialog.append(heading, divider, body, footer);

  const close = () => dialog.close();

  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });

  dialog.addEventListener('click', (e) => {
    const { left, right, top, bottom } = dialog.getBoundingClientRect();
    if (e.clientX < left || e.clientX > right || e.clientY < top || e.clientY > bottom) {
      close();
    }
  });

  (document.querySelector('sp-theme') ?? document.body).appendChild(dialog);
  dialog.showModal();
}

export default function decorate(block) {
  block.innerHTML = `
    <sp-theme system="spectrum-two" scale="medium" color="light">
      <da-space></da-space>
    </sp-theme>
  `;
  showExpWorkspaceWarning();
}
