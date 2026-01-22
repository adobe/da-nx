export function pollConnection(ctx, action) {
  ctx.initialized = false;
  let count = 0;
  const interval = setInterval(() => {
    count += 1;
    if (ctx.initialized || count > 120) {
      clearInterval(interval);
      return;
    }
    action?.();
  }, 500);
}

async function handlePreview(ctx) {
  ctx.port.postMessage({ type: 'preview' });
  await new Promise((resolve) => {
    const previewListener = (e) => {
      if (e.data.type === 'preview') {
        ctx.port.removeEventListener('message', previewListener);
        if (e.data.ok) {
          window.location.reload();
        } else {
          alert(e.data.error);
        }
        resolve();
      }
    }
    ctx.port.addEventListener('message', previewListener);
  });  
}

export function setupCloseButton(ctx) {
  const createButton = (className, text, callback) => {
    const button = document.createElement('button');
    button.className = className;
    button.textContent = text;
    button.addEventListener('click', callback);
    return button;
  };

  // Create container
  const container = document.createElement('div');
  container.className = 'quick-edit-buttons';
  
  // Create exit button
  const exitButton = createButton('quick-edit-exit', 'Exit without Preview', () => {
    window.location.reload();
  });
  exitButton.style.display = 'none';
  
  // Create preview button
  const previewButton = createButton('quick-edit-preview', 'Preview', async () => {
    previewButton.textContent = 'Previewing...';
    previewButton.disabled = true;
    await handlePreview(ctx);
    previewButton.textContent = 'Preview';
    previewButton.disabled = false;
  });
  previewButton.style.display = 'none';
  
  // Create close button
  const button = document.createElement('button');
  button.className = 'quick-edit-close';
  button.title = 'Close Quick Edit';
  
  const icon = document.createElement('i');
  icon.className = 'icon-close';
  button.appendChild(icon);
  
  // Add all buttons to container
  container.appendChild(exitButton);
  container.appendChild(previewButton);
  container.appendChild(button);
  
  let buttonsVisible = false;
  
  button.addEventListener('click', () => {
    if (!buttonsVisible) {
      exitButton.style.display = 'flex';
      previewButton.style.display = 'flex';
      button.classList.add('toggled');
      buttonsVisible = true;
    } else {
      exitButton.style.display = 'none';
      previewButton.style.display = 'none';
      button.classList.remove('toggled');
      buttonsVisible = false;
    }
  });
  
  document.body.appendChild(container);
}