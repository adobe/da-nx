export default async function init(el) {
  const [bg, fg] = [...el.querySelectorAll(':scope > div > div')];
  bg.classList.add('nx-404-bg');
  fg.classList.add('nx-404-fg');
}
