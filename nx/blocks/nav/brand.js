export default function createBrandLink({ title, logoHref, logoSize = 24 }) {
  const link = document.createElement('a');
  link.className = 'brand-area is-configured';
  link.setAttribute('aria-label', `${title} home`);
  const mark = document.createElement('span');
  mark.className = 'brand-logo';
  const logo = document.createElement('img');
  logo.src = logoHref;
  logo.width = logoSize;
  logo.height = logoSize;
  logo.alt = '';
  mark.append(logo);
  const label = document.createElement('span');
  label.className = 'brand-label';
  label.textContent = title;
  link.append(mark, label);
  return link;
}
