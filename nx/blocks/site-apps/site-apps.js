const MOCK_IMG = 'https://main--da-live--adobe.hlx.live/media_1728df71ca494e752fda7ddf788b9cad0b39b5323.jpeg';

const CARD_TEMPLATE = `<div class="nx-card" data-block-name="card">
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

export default async function init(el) {
  el.innerHTML = '';
  const [org, repo] = window.location.hash.slice(2).split('/');
  const url = new URL(window.location.href);
  const params = new URLSearchParams(url.search);
  const ref = params.get('ref');
  const path = ref === 'local' ? 'http://localhost:3000/tools/sidekick/config.json' : `https://admin.hlx.page/sidekick/${org}/${repo}/main/config.json`;
  const resp = await fetch(path);
  const json = await resp.json();
  if (!json.apps) {
    el.closest('.section').remove();
    return;
  }
  json.apps.forEach((app) => {
    const html = getCard(app);
    el.insertAdjacentHTML('beforeend', html);
  });
}
