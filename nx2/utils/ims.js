// TODO: simplify post-NX2.
// Reads the consuming app's nx config. Called per-setup (not at module init) so
// the values can't be stale-captured before the host calls setConfig().
async function resolveNxConfig() {
  try {
    const { nxJS, getNx } = await import(`${window.location.origin}/scripts/utils.js`);
    const { getConfig } = await import(`${getNx()}${nxJS}`);
    return getConfig();
  } catch {
    const { getConfig } = await import('../scripts/nx.js');
    return getConfig();
  }
}

const { imsClientId, imsScope, imsEnv, env } = await resolveNxConfig();

const IMS_URL = 'https://auth.services.adobe.com/imslib/imslib.min.js';
const DEFAULT_SCOPE = 'AdobeID,openid,gnav';
const IMS_TIMEOUT = 15000;
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

export const IMS_ORIGIN = (() => `https://${IMS_ENDPOINT[imsEnv || env]}`)();

export function handleSignIn() {
  localStorage.setItem('nx-ims', true);
  window.adobeIMS.signIn();
}

export function handleSignOut() {
  localStorage.removeItem('nx-ims');
  window.adobeIMS.signOut();
}

async function loadScript(src) {
  return new Promise((resolve, reject) => {
    let script = document.querySelector(`head > script[src="${src}"]`);
    if (!script) {
      script = document.createElement('script');
      script.src = src;
      document.head.append(script);
    }
    if (!window.adobeIMS) {
      script.onload = resolve;
      script.onerror = reject;
    } else {
      resolve();
    }
  });
}

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

const getOrgsFactory = (accessToken) => {
  let orgs;

  return () => {
    orgs ??= fetchWithToken(
      `https://${IMS_ENDPOINT[env]}/ims/account_cluster/v3?client_id=${imsClientId}`,
      accessToken,
    );
    return orgs;
  };
};

const getIoFactory = (accessToken) => {
  let io;

  return () => {
    io ??= fetchWithToken(`https://${IO_ENV[env]}/profile`, accessToken);
    return io;
  };
};

const getTenantId = (profile) => {
  const found = profile.projectedProductContext?.find(
    (projected) => projected.prodCtx.serviceCode === 'dma_tartan',
  );
  return found?.prodCtx.tenant_id;
};

async function loadDetails(accessToken) {
  const profile = await window.adobeIMS.getProfile();
  const tenantId = getTenantId(profile);
  const getIo = getIoFactory(accessToken);
  const getOrgs = getOrgsFactory(accessToken);
  return { ...profile, tenantId, accessToken, getIo, getOrgs };
}

function settleWithTimeout(resolve, reject) {
  const timeout = setTimeout(() => reject(new Error('IMS timeout')), IMS_TIMEOUT);
  return [resolve, reject].map((fn) => (v) => {
    clearTimeout(timeout);
    fn(v);
  });
}

export const loadIms = (() => {
  let ims;

  const setup = async (loginPopup) => {
    // eslint-disable-next-line no-console
    console.warn('[nx2-ims] setup() called', { loginPopup, t: performance.now(), adobeIMSAlready: !!window.adobeIMS });
    // Re-read config at call time; the module-level capture above races with
    // host setConfig() in some load orders (iframes especially) and can pin
    // imsClientId to undefined, which makes imslib hang and time out.
    const cfg = await resolveNxConfig();
    const clientId = cfg.imsClientId ?? imsClientId;
    const scope = cfg.imsScope ?? imsScope;
    const environment = IMS_ENV[cfg.imsEnv ?? cfg.env ?? imsEnv ?? env];
    // eslint-disable-next-line no-console
    console.warn('[nx2-ims] setup config resolved', { clientId, environment, t: performance.now() });

    return new Promise((resolve, reject) => {
      const [done, fail] = settleWithTimeout(resolve, reject);

      window.adobeid = {
        client_id: clientId,
        scope: scope || DEFAULT_SCOPE,
        locale: document.documentElement.lang?.replace('-', '_') || 'en_US',
        autoValidateToken: true,
        environment,
        useLocalStorage: true,
        onError: (e) => {
          // eslint-disable-next-line no-console
          console.warn('[nx2-ims] onError fired', e, performance.now());
          fail(e);
        },
        onReady: () => {
          // eslint-disable-next-line no-console
          console.warn('[nx2-ims] onReady fired', performance.now());
          const accessToken = window.adobeIMS.getAccessToken();
          if (!accessToken) {
            localStorage.removeItem('nx-ims');
            done({ anonymous: true });
            return;
          }
          localStorage.setItem('nx-ims', true);
          loadDetails(accessToken).then(done, fail);
        },
      };
      if (loginPopup) {
        window.adobeid.modalMode = true;
        window.adobeid.modalSettings = { allowedOrigin: window.location.origin };
      }
      // eslint-disable-next-line no-console
      console.warn('[nx2-ims] adobeid set, calling loadScript', performance.now());
      loadScript(IMS_URL).catch(fail);
    });
  };

  return (loginPopup) => {
    ims ??= setup(loginPopup);
    return ims;
  };
})();
