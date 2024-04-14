(async function loadLazy() {
  import('../deps/rum.js').then(({ sampleRUM }) => {
    sampleRUM('load');
    sampleRUM('lazy');
    sampleRUM('cwv');
    sampleRUM.observe(document.querySelectorAll('main div[data-block-name]'));
    sampleRUM.observe(document.querySelectorAll('main picture > img'));
  });
  import('../utils/favicon.js');
  import('../utils/footer.js');
}());
