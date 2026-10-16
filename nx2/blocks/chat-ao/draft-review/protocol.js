export const REVIEW_OPEN = '<da-review>';
export const REVIEW_CLOSE = '</da-review>';

export function validatePagePath(path) {
  if (typeof path !== 'string' || !/^\/[a-z0-9_./-]+\.html$/i.test(path)
    || path.split('/').slice(1).some((part) => !part || part.startsWith('.'))) {
    throw new Error('Review pages must be site-relative HTML paths without hidden folders or traversal.');
  }
  return path;
}

export function draftRootForUser({ userId }) {
  if (!userId || typeof userId !== 'string') throw new Error('Sign in before reviewing AI drafts.');
  const user = userId.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  return `/.da/ai-drafts/${user}`;
}

export function validateReview(review) {
  if (!review || review.version !== 1 || !['plan', 'ready'].includes(review.type)
    || typeof review.id !== 'string' || !/^[a-z0-9-]{1,80}$/i.test(review.id)
    || typeof review.summary !== 'string' || review.summary.length > 4000
    || !Array.isArray(review.pages) || !review.pages.length || review.pages.length > 50) {
    throw new Error('Invalid DA review block. Expected version 1, plan/ready, id, summary and 1-50 pages.');
  }
  const seen = new Set();
  review.pages.forEach((page) => {
    validatePagePath(page.path);
    if (seen.has(page.path)) throw new Error(`Duplicate review page: ${page.path}`);
    seen.add(page.path);
    if (typeof page.title !== 'string' || !page.title || page.title.length > 300
      || typeof page.summary !== 'string' || page.summary.length > 2000
      || (review.type === 'ready' && typeof page.draftPath !== 'string')) {
      throw new Error('Each review page needs a title, summary and, when ready, draftPath.');
    }
  });
  return review;
}

export function splitReviewMessage(content = '', { streaming = false } = {}) {
  const parts = [];
  let rest = content;
  while (rest.includes(REVIEW_OPEN)) {
    const start = rest.indexOf(REVIEW_OPEN);
    if (start) parts.push({ text: rest.slice(0, start) });
    const end = rest.indexOf(REVIEW_CLOSE, start + REVIEW_OPEN.length);
    if (end < 0) {
      parts.push(streaming ? { pending: true } : { error: 'Incomplete DA review block. Ask the assistant to resend it.' });
      return parts;
    }
    try {
      const review = validateReview(JSON.parse(rest.slice(start + REVIEW_OPEN.length, end)));
      parts.push({ review });
    } catch (error) {
      parts.push({ error: error.message });
    }
    rest = rest.slice(end + REVIEW_CLOSE.length);
  }
  // Do not briefly expose a partly streamed opening tag.
  if (streaming) {
    const partial = rest.lastIndexOf('<');
    if (partial >= 0 && REVIEW_OPEN.startsWith(rest.slice(partial))) rest = rest.slice(0, partial);
  }
  if (rest) parts.push({ text: rest });
  return parts;
}
