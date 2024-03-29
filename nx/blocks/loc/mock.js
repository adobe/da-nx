function makeGroups(items, size = 10) {
  const groups = [];
  while (items.length) {
    groups.push(items.splice(0, size));
  }
  return groups;
}

async function saveGroup(urlGroup) {
  const saveProm = urlGroup.map(async (url) => {
    const resp = await fetch(url.srcUrl);
    if (!resp.ok) return false;
    const text = await resp.text();
    const full = `
      <body>
        <header></header>
        <main>${text.replaceAll('./media', 'https://main--bacom--adobecom.hlx.live/media')}</main>
        <footer></footer>
      </body>
    `;
    const blob = new Blob([full], { type: 'text/html' });
    const formData = new FormData();
    formData.append('data', blob);
    const opts = { method: 'PUT', body: formData };
    try {
      const daResp = await fetch(url.daUrl, opts);
      return daResp.ok;
    } catch {
      console.log(`Couldn't save ${url.daUrl}`);
      return null;
    }
  });
  await Promise.all(saveProm);
}

export default async function saveMockHtml() {
  performance.mark('start-replace');
  const qResp = await fetch('https://main--bacom--adobecom.hlx.live/query-index.json?limit=-1');
  if (!qResp.ok) return;
  const { data } = await qResp.json();
  const urls = data.map((page) => {
    const path = page.path.endsWith('/') ? `${page.path}index` : page.path;
    return {
      srcUrl: `https://main--bacom--adobecom.hlx.live${path}.plain.html`,
      daUrl: `https://admin.da.live/source/da-sites/bacom${path}.html`,
    };
  });

  const groups = makeGroups(urls);

  for (const [idx, urlGroup] of groups.entries()) {
    console.log('starting ', idx);
    await saveGroup(urlGroup);
    console.log('finished ', idx);
  }
  performance.mark('end-replace');
  performance.measure('replace', 'start-replace', 'end-replace');
  const replaceTime = performance.getEntriesByName('replace')[0].duration;
  console.log(String(replaceTime / 1000).substring(0, 4));
}
