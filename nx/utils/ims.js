import { getConfig, loadScript } from '../scripts/nexter.js';

const { imsClientId, imsScope, env } = getConfig();

const IMS_URL = 'https://auth.services.adobe.com/imslib/imslib.min.js';
const DEFAULT_SCOPE = 'AdobeID,openid,gnav';
const IMS_ENV = {
  dev: 'stg1',
  stage: 'stg1',
  prod: 'prod',
};

const IO_ENV = {
  dev: 'cc-collab-stage.adobe.io',
  stage: 'cc-collab-stage.adobe.io',
  prod: 'cc-collab.adobe.io',
};

export function handleSignIn() {
  localStorage.setItem('nx-ims', true);
  window.adobeIMS.signIn();
}

export function handleSignOut() {
  localStorage.removeItem('nx-ims');
  window.adobeIMS.signOut();
}

let imsDetails;

async function getProfileDetails(accessToken, resolve) {
  const profile = await window.adobeIMS.getProfile();
  const details = { ...profile, accessToken };
  resolve(details);
}

export async function loadIo(accessToken) {
  const opts = { headers: { Authorization: `Bearer ${accessToken.token}` } };
  const resp = await fetch(`https://${IO_ENV[env]}/profile`, opts);
  if (!resp.ok) return null;
  return resp.json();
}

export async function loadIms() {
  imsDetails = imsDetails || new Promise((resolve, reject) => {
    if (!imsClientId) {
      reject(new Error('Missing IMS Client ID'));
      return;
    }
    const timeout = setTimeout(() => reject(new Error('IMS timeout')), 5000);
    window.adobeid = {
      client_id: imsClientId,
      scope: imsScope || DEFAULT_SCOPE,
      locale: document.documentElement.lang?.replace('-', '_') || 'en_US',
      autoValidateToken: true,
      environment: IMS_ENV[env],
      useLocalStorage: true,
      onReady: () => {
        const accessToken = window.adobeIMS.getAccessToken();
        if (accessToken) {
          localStorage.setItem('nx-ims', true);
          getProfileDetails(accessToken, resolve);
        } else {
          localStorage.removeItem('nx-ims');
          resolve({ anonymous: true });
        }
        clearTimeout(timeout);
      },
      onError: reject,
    };
    loadScript(IMS_URL);
  });
  return imsDetails;
}
