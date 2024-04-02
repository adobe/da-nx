const DA_ORIGIN = 'https://admin.da.live';

async function saveToDa(text, url) {
  const daPath = `/${url.org}/${url.repo}${url.pathname}`;
  const daHref = `https://da.live/edit#${daPath}`;

  const full = `
    <body>
      <header></header>
      <main>${text.replaceAll('./media', `https://main--${url.repo}--${url.repo}.hlx.live/media`)}</main>
      <footer></footer>
    </body>
  `;
  const blob = new Blob([full], { type: 'text/html' });
  const formData = new FormData();
  formData.append('data', blob);
  const opts = { method: 'PUT', body: formData };
  try {
    const daResp = await fetch(`${DA_ORIGIN}/source${daPath}.html`, opts);
    return { daHref, daStatus: daResp.status };
  } catch {
    console.log(`Couldn't save ${url.daUrl}`);
    return null;
  }
}

export default async function importUrl(url) {
  return new Promise((resolve) => {
    (() => {
      const [repo, org] = url.hostname.split('.')[0].split('--').slice(1).slice(-2);
      if (!(repo || org)) {
        url.status = '403';
        resolve('not aem');
        return;
      }

      const fetched = fetch(`${url.href}.plain.html`);

      const timedout = setTimeout(() => {
        resolve('timedout');
      }, 20000);

      fetched.then(async (resp) => {
        url.status = resp.status;

        if (url.status === 200) {
          const text = await resp.text();
          const { daHref, daStatus } = await saveToDa(text, url);
          url.daHref = daHref;
          url.daStatus = daStatus;
        }
        clearTimeout(timedout);
        resolve('ontime');
      }).catch(() => {
        clearTimeout(timedout);
        url.status = 'error';
        resolve('error');
      });
    })();
  });
}
