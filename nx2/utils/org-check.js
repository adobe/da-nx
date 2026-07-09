import { DA_ADMIN } from './utils.js';
import { daFetch } from './api.js';
import { showToast, VARIANT_ERROR } from '../blocks/shared/toast/toast.js';

const DEF_SANDBOX = 'aem-sandbox';
const SANDBOX_MSG = 'You are viewing a sandbox organization. Some features may be unavailable.';

async function getIsSandbox(org) {
  const confResp = await daFetch({ url: `${DA_ADMIN}/config/${org}/` });
  const { status } = confResp;

  if (status === 403 || status === 401) return false;

  if (status === 200) {
    const json = await confResp.json();
    if (json.permissions) return false;
  }

  const listResp = await daFetch({ url: `${DA_ADMIN}/list/${org}` });
  const listJson = await listResp.json();
  return listJson.length > 0;
}

async function orgCheck() {
  const { pathname, hash } = window.location;
  if (pathname.startsWith('/app')) return;
  if (!hash) return;
  const hashVal = hash.replace('#', '');
  if (!hashVal.startsWith('/')) return;
  const [org] = hashVal.substring(1).split('/');
  if (!org || org === DEF_SANDBOX) return;
  const isSandbox = await getIsSandbox(org);
  if (!isSandbox) return;

  showToast({ text: SANDBOX_MSG, variant: VARIANT_ERROR });
}

orgCheck();
window.addEventListener('hashchange', orgCheck);
