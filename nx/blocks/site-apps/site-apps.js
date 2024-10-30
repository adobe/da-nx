const MOCK_IMG = 'https://main--da-live--adobe.hlx.live/media_1728df71ca494e752fda7ddf788b9cad0b39b5323.jpeg';

const AEM_API = 'https://admin.hlx.page/sidekick';
const LOCAL_CONFIG = 'http://localhost:3000/tools/sidekick/config.json';

const CARD_TEMPLATE = `
<div class="nx-card" data-block-name="card">
  <div class="nx-card-inner">
    <div class="nx-card-picture-container">
      <picture>
        <img loading="lazy" src="{{image}}">
      </picture>
    </div>
    <div class="nx-card-content-container">

      <h3 id="mp4-doctor">{{title}}</h3>
      <p>{{description}}</p>

    </div>
    <p class="nx-card-cta-container"><strong><a href="{{href}}">Go</a></strong></p>
  </div>
</div>`;

function getCard({ title, description, url, image = MOCK_IMG }) {
  return CARD_TEMPLATE.replace('{{title}}', title)
    .replace('{{image}}', image)
    .replace('{{description}}', description)
    .replace('{{href}}', url);
}

function removeSection(el) {
  el.closest('.section').remove();
}

export default async function init(el) {
  if (!window.location.hash) {
    removeSection(el);
    return;
  }
  el.innerHTML = '';
  const [org, repo] = window.location.hash.slice(2).split('/');
  const ref = new URL(window.location.href).searchParams.get('ref');
  const path = ref === 'local' ? LOCAL_CONFIG : `${AEM_API}/${org}/${repo}/main/config.json`;
  try {
    const resp = await fetch(path);
    const json = await resp.json();
    if (!json.apps) {
      removeSection(el);
      return;
    }

    json.apps.forEach((app) => {
      const html = getCard(app);
      el.insertAdjacentHTML('beforeend', html);
    });
  } catch {
    removeSection(el);
  }
}
