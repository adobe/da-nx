(async function loadDelayed() {
  import('../deps/rum.js').then(({ sampleRUM }) => {
    sampleRUM('cwv');
  });
}());
