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

// const ENVS = {
//   stage: {
//     name: 'stage',
//     ims: 'stg1',
//     adobeIO: ,
//     adminconsole: 'stage.adminconsole.adobe.com',
//     account: 'stage.account.adobe.com',
//     edgeConfigId: '8d2805dd-85bf-4748-82eb-f99fdad117a6',
//     pdfViewerClientId: '600a4521c23d4c7eb9c7b039bee534a0',
//   },
//   prod: {
//     name: 'prod',
//     ims: 'prod',
//     adobeIO: 'cc-collab.adobe.io',
//     adminconsole: 'adminconsole.adobe.com',
//     account: 'account.adobe.com',
//     edgeConfigId: '2cba807b-7430-41ae-9aac-db2b0da742d5',
//     pdfViewerClientId: '3c0a5ddf2cc04d3198d9e48efc390fa9',
//   },
// };

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
  window.adobeIMS.signIn();
}

export function handleSignOut() {
  window.adobeIMS.signOut();
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
      locale: document.documentElement.lang || 'en_US',
      autoValidateToken: true,
      environment: IMS_ENV[env],
      useLocalStorage: false,
      onReady: () => {
        const accessToken = window.adobeIMS.getAccessToken();
        if (accessToken) {
          fetch(`https://${IO_ENV[env]}/profile`, { headers: { Authorization: `Bearer ${accessToken.token}` } }).then(async (resp) => {
            const profile = await window.adobeIMS.getProfile();
            const io = await resp.json();
            resolve({ ...profile, io });
          });
        } else {
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
