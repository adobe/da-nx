import { getConfig } from '../scripts/nexter.js';
import loadScript from './script.js';

const { imsClientId, imsScope, env } = getConfig();

const IMS_URL = 'https://auth.services.adobe.com/imslib/imslib.min.js';
const DEFAULT_SCOPE = 'AdobeID,openid,gnav';
const IMS_TIMEOUT = 5000;
const IMS_ENV = {
  dev: 'stg1',
  stage: 'stg1',
  prod: 'prod',
};

const IMS_ENDPOINT = {
  dev: 'ims-na1-stg1.adobelogin.com',
  stage: 'ims-na1-stg1.adobelogin.com',
  prod: 'ims-na1.adobelogin.com',
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
let orgDetails;
let imsProfile;
let allOrgs;

async function fetchWithToken(url, accessToken) {
  const opts = { headers: { Authorization: `Bearer ${accessToken.token}` } };
  try {
    const resp = await fetch(url, opts);
    if (!resp.ok) return null;
    return resp.json();
  } catch (e) {
    return null;
  }
}

async function getAllOrgs() {
  if (allOrgs) return allOrgs;
  const orgData = await fetchWithToken(
    `https://${IMS_ENDPOINT[env]}/ims/account_cluster/v3?client_id=${imsClientId}`,
    imsProfile.accessToken,
  );
  if (!orgData) return null;
  allOrgs = orgData.data;
  return allOrgs;
}

async function getOrgs() {
  if (!orgDetails) {
    const orgData = await fetchWithToken(
      `https://${IMS_ENDPOINT[env]}/ims/organizations/v5?client_id=${imsClientId}`,
      imsProfile.accessToken,
    );
    orgDetails = orgData?.reduce((acc, org) => {
      const { orgName, ...rest } = org;
      acc[orgName] = rest;
      return acc;
    }, {});
  }

  return orgDetails;
}

export async function getIo() {
  return fetchWithToken(`https://${IO_ENV[env]}/profile`, imsProfile.accessToken);
}

async function getProfileDetails(accessToken, resolve) {
  const profile = await window.adobeIMS.getProfile();
  imsProfile = { ...profile, accessToken, getOrgs, getIo, getAllOrgs };
  resolve(imsProfile);
}

export async function loadIms(loginPopup) {
  imsDetails = imsDetails || new Promise((resolve, reject) => {
    if (!imsClientId) {
      reject(new Error('Missing IMS Client ID'));
      return;
    }
    const timeout = setTimeout(() => reject(new Error('IMS timeout')), IMS_TIMEOUT);
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
    if (loginPopup) {
      window.adobeid.modalMode = true;
      window.adobeid.modalSettings = { allowedOrigin: window.location.origin };
    }
    loadScript(IMS_URL);
  });
  return imsDetails;
}
