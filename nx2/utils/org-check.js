import { DA_ADMIN } from './utils.js';
import { daFetch } from './api.js';
import { showToast, VARIANT_WARNING } from '../blocks/shared/toast/toast.js';

const DEF_SANDBOX = 'aem-sandbox';
const SANDBOX_FRAGMENT = '/fragments/toasts/sandbox';

async function getSandboxContent() {
  const resp = await fetch(`${SANDBOX_FRAGMENT}.plain.html`);
  if (!resp.ok) return null;
  const html = await resp.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const link = doc.body.querySelector('a');
  const cta = link ? {
    text: link.textContent.trim(),
    href: `${new URL(link.href).pathname}${window.location.search}${window.location.hash}`,
  } : null;
  link?.remove();
  const text = doc.body.textContent.trim();
  return text ? { text, cta } : null;
}

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

  const content = await getSandboxContent();
  if (!content) return;
  showToast({ text: content.text, cta: content.cta, variant: VARIANT_WARNING, timeout: null, maxWidth: '42rem' });
}

orgCheck();
window.addEventListener('hashchange', orgCheck);
