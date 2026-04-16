function getParts() {
  const [org, site, ...rest] = window.location.hash.slice(1).split('/').filter(Boolean);
  const path = `/${rest.join('/')}`;
  return { org, site, path };
}

export default function init(el) {
  const { org, site, path } = getParts();
  el.innerHTML = `
    <div class="nx-remix-content">
      <h1>Hello World</h1>
      <dl>
        <dt>Org</dt><dd>${org}</dd>
        <dt>Site</dt><dd>${site}</dd>
        <dt>Path</dt><dd>${path}</dd>
      </dl>
    </div>
  `;
}
