import { DA_ORIGIN } from '../../public/utils/constants.js';
import { daFetch } from '../../utils/daFetch.js';

const MOCK_IMG = './media_1728df71ca494e752fda7ddf788b9cad0b39b5323.jpeg';

const ref = new URLSearchParams(window.location.search).get('ref') || 'main';

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

function getIsAppAllowed(cardRef) {
  const pluginRef = cardRef || 'main';

  // Always return true if pluginRef is main
  if (pluginRef === 'main') return true;

  // Allow all branches on dev
  if (ref === 'dev') return true;

  // Allow if pluginRef matches query param ref
  if (pluginRef === ref) return true;

  return false;
}

function getCard({ title, description, path, image }) {
  const img = image || MOCK_IMG;
  return CARD_TEMPLATE.replace('{{title}}', title)
    .replace('{{image}}', img)
    .replace('{{description}}', description)
    .replace('{{href}}', path);
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
  try {
    const resp = await daFetch(`${DA_ORIGIN}/config/${org}/${repo}/`);
    const json = await resp.json();
    if (!json.apps) {
      removeSection(el);
      return;
    }

    json.apps.data.forEach((app) => {
      const appRef = app.ref || 'main';
      console.log(appRef);
      const isAllowed = getIsAppAllowed(appRef);
      if (!isAllowed) return;
      const html = getCard(app);
      el.insertAdjacentHTML('beforeend', html);
    });
  } catch {
    removeSection(el);
  }
}
