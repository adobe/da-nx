export function setRemoteCursors() {
  document.querySelectorAll('.remote-cursor-indicator').forEach((element) => {
    element.classList.remove('remote-cursor-indicator');
  });

  const remoteCursorElements = document.querySelectorAll('[data-cursor-remote]');
  remoteCursorElements.forEach((element) => {
    element.classList.add('remote-cursor-indicator');
    const color = element.getAttribute('data-cursor-remote-color');
    element.style.outlineColor = color;
    element.style.setProperty('--cursor-remote-color', color);
  });
}

export async function setCursors(payload) {
  // Remove all existing data-cursor attributes from current document
  const currentElements = document.querySelectorAll('[data-cursor-remote]');
  currentElements.forEach((element) => {
    element.removeAttribute('data-cursor-remote');
    element.removeAttribute('data-cursor-remote-color');
  });

  payload.forEach(({ proseIndex, remote, color }) => {
    if (!proseIndex) return;

    const matchingElement = document.querySelector(`[data-prose-index="${proseIndex}"]`);
    if (matchingElement) {
      matchingElement.setAttribute('data-cursor-remote', remote);
      matchingElement.setAttribute('data-cursor-remote-color', color);
    }
  });

  setRemoteCursors();
}
