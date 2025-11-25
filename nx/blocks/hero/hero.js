async function personalize(fg) {
  const { loadIms } = await import('../../utils/ims.js');
  try {
    const profile = await loadIms();
    if (profile.anonymous) return;
    const heading = fg.querySelector('h1, h2, h3, h4, h5, h6');
    const nameSpan = document.createElement('span');
    nameSpan.textContent = profile.first_name;
    heading.replaceChildren('Welcome, ', nameSpan);
  } catch {
    console.log('Personalization went south');
  }
}

export default async function init(el) {
  const rows = [...el.querySelectorAll(':scope > div')];
  const fg = rows.pop();
  fg.classList.add('nx-hero-foreground');
  const pzn = el.classList.contains('personalize');
  if (localStorage.getItem('nx-ims') && pzn) await personalize(fg);
  if (rows.length) {
    const bg = rows.pop();
    bg.classList.add('nx-hero-background');
  }
}
