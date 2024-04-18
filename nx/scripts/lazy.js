(async function loadLazy() {
  import('../utils/favicon.js');
  import('../utils/footer.js');
  import('../deps/rum.js').then(({ sampleRUM }) => {
    sampleRUM('load');
    sampleRUM('lazy');
    sampleRUM.observe(document.querySelectorAll('main div[data-block-name]'));
    sampleRUM.observe(document.querySelectorAll('main picture > img'));
    window.setTimeout(() => { sampleRUM('cwv'); }, 3000);
  });
}());
