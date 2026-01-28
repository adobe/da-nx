// Simplified library integration for quick-edit-portal
// Sends message to parent frame to open library

export default function toggleLibrary() {
  if (window.parent) {
    window.parent.postMessage({ type: 'open-library' }, '*');
  }
  return true;
}
