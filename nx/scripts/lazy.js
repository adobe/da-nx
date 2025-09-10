function rumWC(sampleRUM) {
  const wcs = document.querySelectorAll('[data-rum]');
  wcs.forEach((wc) => {
    wc.shadowRoot.addEventListener('click', (e) => {
      e.stopPropagation();
      const sourceEl = e.target.closest('a, button');
      const source = sourceEl?.title || sourceEl?.href || sourceEl?.dataset.action;
      if (!sampleRUM.targetselector) return;
      const target = sampleRUM.targetselector(e.target);
      sampleRUM('click', { source, target });
    });
  });
}

(async function loadLazy() {
  import('../utils/favicon.js');
  import('../utils/footer.js');
  import('../deps/rum.js').then(({ sampleRUM }) => {
    sampleRUM();
    window.setTimeout(() => {
      rumWC(sampleRUM);
    }, 3000);
  });
}());
