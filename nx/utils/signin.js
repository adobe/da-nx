import { loadIms, handleSignIn } from './ims.js';

(async function signin() {
  document.body.style.display = 'none';

  const imsDetails = await loadIms();
  if (!imsDetails.accessToken) {
    handleSignIn();
    return;
  }

  document.body.style.removeProperty('display');
}());
