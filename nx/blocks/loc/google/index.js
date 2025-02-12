const results = {};

async function sendForTranslation(basePath, sourceHtml, toLang) {
  const body = new FormData();
  body.append('data', sourceHtml);
  body.append('fromlang', 'en');
  body.append('tolang', toLang);

  const opts = { method: 'POST', body };

  const resp = await fetch('https://translate.da.live/google', opts);
  if (!resp.ok) {
    console.log(resp.status);
    return null;
  }
  const { translated } = await resp.json();
  if (translated) {
    const blob = new Blob([translated], { type: 'text/html' });
    return { basePath, blob };
  }
  return null;
}

export async function isConnected() {
  return true;
}

export async function getItems(service, lang) {
  return results[lang.code];
}

export async function sendAllLanguages(title, service, langs, urls) {
  await Promise.all(langs.map(async (lang) => {
    lang.translation.sent = urls.length;

    const urlResults = await Promise.all(
      urls.map(async (url) => sendForTranslation(url.basePath, url.content, lang.code)),
    );

    const success = urlResults.filter((result) => result).length;
    lang.translation.translated = success;
    if (success === urls.length) {
      lang.translation.translated = urls.length;
      lang.translation.status = 'created';
      results[lang.code] = urlResults;
    }
  }));
}

export async function getStatusAll(title, _service, langs, actions) {
  // Not implemented
}
