/** Mocked Functions */
export const getConfig = () => ({
  codeBase: 'codeBase',
  imsClientId: 'nexter',
  env: 'prod',
});

export async function loadScript() {
  window.adobeid.onReady();
}
/** End Mocked Functions */
