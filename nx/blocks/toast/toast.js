async function fetchContent(href) {
  const resp = await fetch(href);
  if (!resp.ok) return null;
  const html = await resp.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.querySelector('div');
}

export default async function init(a) {
  const toast = await fetchContent(a.href);
  if (!toast) return;
  // Move the link outside the paragraph
  const link = toast.querySelector('a');
  if (link) {
    const { pathname } = new URL(link.href);
    link.href = `${pathname}${window.location.search}${window.location.hash}`;
    toast.append(link);
    link.classList.add('btn', 'outline');
  }

  // Setup basic styles
  toast.classList.add('toast', 'toast-warning');
  document.body.append(toast);
}
