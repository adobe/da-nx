export const SOURCE_CAPTION_LOCALE = 'en-x-cc';

export function buildMultimodalVideoAssets({ pages, targetLocales }) {
  const videoLocales = [...targetLocales, SOURCE_CAPTION_LOCALE];
  const entries = new Map();
  pages.forEach(({ pagePath, pagePreviewUrl, videos }) => {
    videos.forEach(({ mp4, videoId }, originalUrl) => {
      const name = `${pagePath.replace(/\.html$/i, '')}/${encodeURIComponent(videoId)}.mp4`;
      const existing = entries.get(name);
      if (existing) {
        if (!existing.correlation.originalUrls.includes(originalUrl)) {
          existing.correlation.originalUrls.push(originalUrl);
        }
        return;
      }
      entries.set(name, {
        asset: {
          type: 'VIDEO',
          name,
          parentAsset: pagePath,
          signedUrl: mp4,
          sourcePreviewUrl: originalUrl,
          ...(pagePreviewUrl && { sourcePreviewUrlPage: pagePreviewUrl }),
          contentType: 'video/mp4',
          targetLocales: [...videoLocales],
        },
        correlation: { originalUrls: [originalUrl], videoId },
      });
    });
  });
  const uniqueEntries = [...entries.values()];
  const mapping = Object.fromEntries(uniqueEntries.map(({ asset, correlation }) => (
    [asset.name, correlation]
  )));
  return {
    assets: uniqueEntries.map(({ asset }) => asset),
    mapping,
  };
}
