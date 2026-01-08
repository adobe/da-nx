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

export async function setCursors(body, ctx) {
  const doc = new DOMParser().parseFromString(body, 'text/html');
      
  // Remove all existing data-cursor attributes from current document
  const currentElements = document.querySelectorAll('[data-cursor-remote]');
  currentElements.forEach((element) => {
    element.removeAttribute('data-cursor-remote');
    element.removeAttribute('data-cursor-remote-color');
  });
  
  // Get all elements with data-cursor from the parsed doc
  const parsedElements = doc.querySelectorAll('[data-cursor-remote]');
  
  // For each element in parsed doc, find matching element in current doc by data-cursor
  parsedElements.forEach((parsedElement) => {
    const remoteCursorValue = parsedElement.getAttribute('data-cursor-remote');
    const remoteCursorColor = parsedElement.getAttribute('data-cursor-remote-color');
    const dataCursor = parsedElement.getAttribute('data-prose-index');
    
    // Find element in current document with the same data-cursor value
    if (dataCursor) {
      const matchingElement = document.querySelector(`[data-prose-index="${dataCursor}"]`);
      if (matchingElement) {
        matchingElement.setAttribute('data-cursor-remote', remoteCursorValue);
        matchingElement.setAttribute('data-cursor-remote-color', remoteCursorColor);
      }
    }
  });
  
  setRemoteCursors();
}