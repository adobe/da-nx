import { getConfig } from '../scripts/nexter.js';

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

async function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (!document.querySelector(`head > script[src="${src}"]`)) {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.append(script);
    } else {
      resolve();
    }
  });
}

export function handleSignIn() {
  localStorage.setItem('nx-ims', true);
  window.adobeIMS.signIn();
}

export function handleSignOut() {
  localStorage.removeItem('nx-ims');
  window.adobeIMS.signOut();
}

async function getProfileDetails(env, accessToken, resolve) {
  const profile = await window.adobeIMS.getProfile();
  const opts = { headers: { Authorization: `Bearer ${accessToken.token}` } };
  const resp = await fetch(`https://${IO_ENV[env]}/profile`, opts);
  if (!resp.ok) resolve({ anonymous: true });
  const io = await resp.json();
  resolve({ ...profile, io });
}

let imsLoaded;
export async function loadIms() {
  imsLoaded = imsLoaded || new Promise((resolve, reject) => {
    const { imsClientId, imsScope, env } = getConfig();
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
      useLocalStorage: false,
      onReady: () => {
        const accessToken = window.adobeIMS.getAccessToken();
        if (accessToken) {
          localStorage.setItem('nx-ims', true);
          getProfileDetails(env, accessToken, resolve);
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
  return imsLoaded;
}
