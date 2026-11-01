import { toHref } from './imageSelections.js';
import { parseVideoSelections } from './videoSelections.js';

const VIDEO_URL_PREFIXES = [
  'https://video.tv.adobe.com/',
  'https://stage-video.tv.adobe.com/',
];

export function collectMultimodalVideoUrls(doc) {
  const urls = new Set();
  doc.querySelectorAll('a[href]').forEach((anchor) => {
    const href = anchor.getAttribute('href').trim();
    if (VIDEO_URL_PREFIXES.some((prefix) => href.startsWith(prefix))) urls.add(href);
  });
  return [...urls];
}

async function fetchVideoMetadata(metadataUrl) {
  const response = await fetch(metadataUrl.href);
  if (!response.ok) throw new Error(`Metadata request failed (HTTP ${response.status}).`);
  const json = await response.json();
  const source = Array.isArray(json?.sources)
    ? json.sources.find((item) => item?.label === 'Medium' && item.format === 'mpeg4')
    : undefined;
  if (typeof source?.src !== 'string') throw new Error('Medium MPEG4 rendition not found.');
  const mp4Url = new URL(source.src);
  if (mp4Url.protocol !== 'https:' || !mp4Url.pathname.toLowerCase().endsWith('.mp4')) {
    throw new Error('Medium MPEG4 rendition has an invalid MP4 URL.');
  }
  if (typeof source.videoID !== 'string' || !source.videoID.trim()) {
    throw new Error('Medium MPEG4 rendition has no videoID.');
  }
  return { mp4: source.src, videoId: source.videoID.trim() };
}

export function createVideoResolver() {
  const cache = new Map();

  return async (doc) => {
    const entries = [];
    const errors = [];
    const selections = parseVideoSelections(doc);
    const selectedUrls = collectMultimodalVideoUrls(doc)
      .filter((href) => selections.has(toHref(href)));
    for (const href of selectedUrls) {
      try {
        const metadataUrl = new URL(href);
        metadataUrl.searchParams.set('format', 'json');
        metadataUrl.hash = '';
        const key = metadataUrl.href;
        if (!cache.has(key)) {
          const pending = fetchVideoMetadata(metadataUrl).catch((error) => {
            cache.delete(key);
            throw error;
          });
          cache.set(key, pending);
        }
        // eslint-disable-next-line no-await-in-loop
        const { mp4, videoId } = await cache.get(key);
        entries.push([href, { mp4, videoId }]);
      } catch (error) {
        errors.push({ url: href, error: error.message });
      }
    }
    return { videos: new Map(entries), errors };
  };
}
