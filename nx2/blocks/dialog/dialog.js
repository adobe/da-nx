export default function init(a) {
  const button = document.createElement('button');
  button.append(...a.childNodes);
  button.className = a.className;
  button.dataset.pathname = a.pathname;
  a.parentElement.replaceChild(button, a);
}
