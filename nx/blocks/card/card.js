export default function init(el) {
  const inner = el.querySelector(':scope > div');
  inner.classList.add('nx-card-inner');
  const pic = el.querySelector('picture');
  if (pic) {
    const picPara = pic.closest('p');
    if (picPara) {
      const picDiv = document.createElement('div');
      picDiv.className = 'nx-card-picture-container';
      picDiv.append(pic);
      inner.insertAdjacentElement('afterbegin', picDiv);
      picPara.remove();
    }
  }
  // Decorate content
  const con = inner.querySelector(':scope > div:not([class])');
  if (!con) return;
  con.classList.add('nx-card-content-container');

  // Decorate CTA
  const ctaPara = inner.querySelector(':scope > div:last-of-type > p:last-of-type');
  if (!ctaPara) return;
  const cta = ctaPara.querySelector('a');
  if (!cta) return;
  ctaPara.classList.add('nx-card-cta-container');
  inner.append(ctaPara);
}
