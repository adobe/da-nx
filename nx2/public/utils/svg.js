const PARSER = new DOMParser();

async function fetchIcon(path) {
  const resp = await fetch(path);
  if (!resp.ok) return null;
  const text = await resp.text();
  const doc = PARSER.parseFromString(text, 'image/svg+xml');
  return doc.querySelector('svg');
}

export default async function getSvg({ parent, paths }) {
  const svgs = await Promise.all(paths.map(async (path) => {
    const svg = await fetchIcon(path);
    if (parent) parent.append(svg);
    return svg;
  }));
  return svgs;
}
