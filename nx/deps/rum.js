// eslint-disable-next-line import/prefer-default-export
export function sampleRUM(checkpoint, data = {}) {
  const SESSION_STORAGE_KEY = 'aem-rum';
  sampleRUM.baseURL = sampleRUM.baseURL
    || new URL(window.RUM_BASE == null ? 'https://rum.hlx.page' : window.RUM_BASE, window.location);
  sampleRUM.defer = sampleRUM.defer || [];
  const defer = (fnname) => {
    sampleRUM[fnname] = sampleRUM[fnname] || ((...args) => sampleRUM.defer.push({ fnname, args }));
  };
  sampleRUM.drain = sampleRUM.drain
    || ((dfnname, fn) => {
      sampleRUM[dfnname] = fn;
      sampleRUM.defer
        .filter(({ fnname }) => dfnname === fnname)
        .forEach(({ fnname, args }) => sampleRUM[fnname](...args));
    });
  sampleRUM.always = sampleRUM.always || [];
  sampleRUM.always.on = (chkpnt, fn) => {
    sampleRUM.always[chkpnt] = fn;
  };
  sampleRUM.on = (chkpnt, fn) => {
    sampleRUM.cases[chkpnt] = fn;
  };
  defer('observe');
  defer('cwv');
  try {
    window.hlx = window.hlx || {};
    if (!window.hlx.rum) {
      const usp = new URLSearchParams(window.location.search);
      const weight = usp.get('rum') === 'on' ? 1 : 10; // with parameter, weight is 1. Defaults to 100.
      const id = Array.from({ length: 75 }, (_, i) => String.fromCharCode(48 + i))
        .filter((a) => /\d|[A-Z]/i.test(a))
        .filter(() => Math.random() * 75 > 70)
        .join('');
      const random = Math.random();
      const isSelected = random * weight < 1;
      const firstReadTime = window.performance ? window.performance.timeOrigin : Date.now();
      const urlSanitizers = {
        full: () => window.location.href,
        origin: () => window.location.origin,
        path: () => window.location.href.replace(/\?.*$/, ''),
      };
      // eslint-disable-next-line max-len
      const rumSessionStorage = sessionStorage.getItem(SESSION_STORAGE_KEY)
        ? JSON.parse(sessionStorage.getItem(SESSION_STORAGE_KEY))
        : {};
      // eslint-disable-next-line max-len
      rumSessionStorage.pages = (rumSessionStorage.pages ? rumSessionStorage.pages : 0)
        + 1
        /* noise */ + (Math.floor(Math.random() * 20) - 10);
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(rumSessionStorage));
      // eslint-disable-next-line object-curly-newline, max-len
      window.hlx.rum = {
        weight,
        id,
        random,
        isSelected,
        firstReadTime,
        sampleRUM,
        sanitizeURL: urlSanitizers[window.hlx.RUM_MASK_URL || 'path'],
        rumSessionStorage,
      };
    }

    const { weight, id, firstReadTime } = window.hlx.rum;
    if (window.hlx && window.hlx.rum && window.hlx.rum.isSelected) {
      const knownProperties = [
        'weight',
        'id',
        'referer',
        'checkpoint',
        't',
        'source',
        'target',
        'cwv',
        'CLS',
        'FID',
        'LCP',
        'INP',
        'TTFB',
      ];
      const sendPing = (pdata = data) => {
        // eslint-disable-next-line max-len
        const t = Math.round(
          window.performance ? window.performance.now() : Date.now() - firstReadTime,
        );
        // eslint-disable-next-line object-curly-newline, max-len, no-use-before-define
        const body = JSON.stringify(
          {
            weight, id, referer: window.hlx.rum.sanitizeURL(), checkpoint, t, ...data,
          },
          knownProperties,
        );
        const url = new URL(`.rum/${weight}`, sampleRUM.baseURL).href;
        navigator.sendBeacon(url, body);
        // eslint-disable-next-line no-console
        console.debug(`ping:${checkpoint}`, pdata);
      };
      sampleRUM.cases = sampleRUM.cases || {
        load: () => sampleRUM('pagesviewed', { source: window.hlx.rum.rumSessionStorage.pages }) || true,
        cwv: () => sampleRUM.cwv(data) || true,
        lazy: () => {
          // use classic script to avoid CORS issues
          const script = document.createElement('script');
          script.src = new URL('.rum/@adobe/helix-rum-enhancer@^1/src/index.js', sampleRUM.baseURL).href;
          document.head.appendChild(script);
          return true;
        },
      };
      sendPing(data);
      if (sampleRUM.cases[checkpoint]) {
        sampleRUM.cases[checkpoint]();
      }
    }
    if (sampleRUM.always[checkpoint]) {
      sampleRUM.always[checkpoint](data);
    }
  } catch (error) {
    // something went wrong
  }
}
