/* eslint-disable no-cond-assign */
/* eslint-disable no-continue */

// Match opening tag: <tagname ... >
const OPEN_TAG_REGEX = /<([a-zA-Z][a-zA-Z0-9]*)(\s[^>]*)>/g;
// Match closing tag: </tagname>
const CLOSE_TAG_REGEX = /<\/([a-zA-Z][a-zA-Z0-9]*)\s*>/g;
// Sentence boundary: . ! or ? followed by whitespace
const SENTENCE_BOUNDARY_REGEX = /[.!?]\s+/g;

function hasTranslateNo(attrsString) {
  return /translate\s*=\s*["']no["']/i.test(attrsString);
}

/**
 * Find the end index of the matching closing tag for a given opening tag.
 * Handles nested same-name elements.
 */
function findMatchingCloseTag(html, tagName, afterIndex) {
  const openTag = new RegExp(`<${tagName}(?:\\s[^>]*)?>`, 'gi');
  const closeTag = new RegExp(`</${tagName}\\s*>`, 'gi');
  let depth = 1;
  let pos = afterIndex;

  while (pos < html.length) {
    openTag.lastIndex = pos;
    closeTag.lastIndex = pos;
    const openMatch = openTag.exec(html);
    const closeMatch = closeTag.exec(html);

    if (!closeMatch) return -1;

    if (openMatch && openMatch.index < closeMatch.index) {
      depth += 1;
      pos = openMatch.index + openMatch[0].length;
    } else {
      depth -= 1;
      if (depth === 0) {
        return closeMatch.index + closeMatch[0].length;
      }
      pos = closeMatch.index + closeMatch[0].length;
    }
  }
  return -1;
}

/**
 * Find all no-split zones: ranges [start, end) for each translate="no" element.
 * Returns array of { start, end, tagName, openTagFull, innerStart, innerEnd }.
 */
function findNoSplitZones(html) {
  const zones = [];
  OPEN_TAG_REGEX.lastIndex = 0; // reset global regex
  let match;

  while ((match = OPEN_TAG_REGEX.exec(html)) !== null) {
    const tagName = match[1];
    const attrs = match[2] || '';
    if (!hasTranslateNo(attrs)) continue;

    const openStart = match.index;
    const openEnd = match.index + match[0].length;
    const closeEnd = findMatchingCloseTag(html, tagName, openEnd);
    if (closeEnd === -1) continue;

    const tailSlice = html.slice(0, closeEnd);
    const closeTagStartMatch = tailSlice.match(new RegExp(`</${tagName}\\s*>$`, 'i'));
    const innerEnd = closeTagStartMatch ? closeEnd - closeTagStartMatch[0].length : closeEnd;

    zones.push({
      start: openStart,
      end: closeEnd,
      tagName,
      openTagFull: match[0],
      innerStart: openEnd,
      innerEnd,
    });
  }
  return zones;
}

/**
 * Split inner content at sentence boundaries so that each fragment,
 * when wrapped with open/close tags, stays <= maxLength.
 * Returns array of { openTag, inner, closeTag } strings.
 */
function splitOversizedZone(zone, html, maxLength, splitId) {
  const inner = html.slice(zone.innerStart, zone.innerEnd);
  const closeTag = `</${zone.tagName}>`;
  const openTagWithSplit = `<${zone.tagName} translate="no" data-dnt-split="${splitId}">`;
  const firstOpenTag = zone.openTagFull.replace(/\s*>$/, ` data-dnt-split="${splitId}">`);

  const fragments = [];
  let remaining = inner;

  while (remaining.length > 0) {
    const isFirst = fragments.length === 0;
    const openTag = isFirst ? firstOpenTag : openTagWithSplit;
    const budget = maxLength - openTag.length - closeTag.length;

    if (remaining.length <= budget) {
      fragments.push({ openTag, inner: remaining, closeTag });
      break;
    }

    // Find last sentence boundary within budget
    const chunk = remaining.slice(0, budget);
    SENTENCE_BOUNDARY_REGEX.lastIndex = 0;
    let lastBoundary = -1;
    let boundaryMatch;
    while ((boundaryMatch = SENTENCE_BOUNDARY_REGEX.exec(chunk)) !== null) {
      lastBoundary = boundaryMatch.index + boundaryMatch[0].length;
    }

    const splitAt = lastBoundary > 0 ? lastBoundary : budget;
    const part = remaining.slice(0, splitAt);
    fragments.push({ openTag, inner: part, closeTag });
    remaining = remaining.slice(splitAt);
  }

  return fragments;
}

/**
 * Replace an oversized zone in html with the concatenated fragments.
 */
function replaceOversizedZone(html, zone, fragments) {
  const replacement = fragments.map((f) => f.openTag + f.inner + f.closeTag).join('');
  return html.slice(0, zone.start) + replacement + html.slice(zone.end);
}

/**
 * Pre-process html: replace any translate="no" element that exceeds maxLength
 * with multiple fragments split at sentence boundaries.
 */
function preprocessOversizedZones(html, maxLength) {
  let result = html;
  const zones = findNoSplitZones(result);

  const oversized = zones.filter((z) => z.end - z.start > maxLength);
  if (oversized.length === 0) return result;

  // Replace from end to start so indices remain valid
  const sorted = [...oversized].sort((a, b) => b.start - a.start);
  for (const zone of sorted) {
    const splitId = `dnt-${Math.random().toString(36).slice(2, 11)}-${Date.now()}`;
    const fragments = splitOversizedZone(zone, result, maxLength, splitId);
    result = replaceOversizedZone(result, zone, fragments);
  }

  return result;
}

/**
 * Get candidate split points: index after each closing tag that is not inside a no-split zone.
 */
function getSplitPoints(html, noSplitZones) {
  const points = [];
  CLOSE_TAG_REGEX.lastIndex = 0;
  let match;

  while ((match = CLOSE_TAG_REGEX.exec(html)) !== null) {
    const pos = match.index + match[0].length;
    const insideZone = noSplitZones.some((z) => pos > z.start && pos < z.end);
    if (!insideZone) {
      points.push(pos);
    }
  }
  return points.sort((a, b) => a - b);
}

/**
 * Split html into chunks of at most maxLength characters, splitting only after closing tags.
 * Elements with translate="no" are never split (except when pre-processed as oversized).
 */
export function splitHtml(html, maxLength = 5000) {
  if (html.length <= maxLength) {
    return [html];
  }

  const processed = preprocessOversizedZones(html, maxLength);
  const zones = findNoSplitZones(processed);
  const splitPoints = getSplitPoints(processed, zones);

  if (splitPoints.length === 0) {
    return [processed];
  }

  const chunks = [];
  let chunkStart = 0;
  let i = 0;

  while (i < splitPoints.length) {
    const endHere = splitPoints[i];
    const chunkLen = endHere - chunkStart;

    if (chunkLen > maxLength) {
      if (i === 0) {
        chunks.push(processed.slice(chunkStart, endHere));
        chunkStart = endHere;
      } else {
        const prevEnd = splitPoints[i - 1];
        if (prevEnd > chunkStart) {
          chunks.push(processed.slice(chunkStart, prevEnd));
          chunkStart = prevEnd;
          i -= 1;
        } else {
          chunks.push(processed.slice(chunkStart, endHere));
          chunkStart = endHere;
        }
      }
    }
    i += 1;
  }

  if (chunkStart < processed.length) {
    chunks.push(processed.slice(chunkStart));
  }

  return chunks.length > 0 ? chunks : [processed];
}

/**
 * Regex to find an element that has data-dnt-split attribute (full opening tag).
 */
function findDataDntSplitElements(html) {
  const results = [];
  const regex = /<([a-zA-Z][a-zA-Z0-9]*)(\s[^>]*?)data-dnt-split\s*=\s*["']([^"']+)["']([^>]*)>/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    results.push({
      tagName: match[1],
      fullOpenTag: match[0],
      splitId: match[3],
      index: match.index,
    });
  }
  return results;
}

/**
 * For a given start index (start of an opening tag with data-dnt-split),
 * find the full element (opening tag + content + closing tag) and return
 * { start, end, tagName, splitId, openTagFull, innerContent }.
 */
function extractElementWithSplitId(html, openTagMatch) {
  const { tagName, fullOpenTag, splitId, index } = openTagMatch;
  const innerStart = index + fullOpenTag.length;
  const closeTagRegex = new RegExp(`</${tagName}\\s*>`, 'gi');
  closeTagRegex.lastIndex = innerStart;
  const closeMatch = closeTagRegex.exec(html);
  if (!closeMatch) return null;
  const innerEnd = closeMatch.index;
  const end = closeMatch.index + closeMatch[0].length;
  const innerContent = html.slice(innerStart, innerEnd);
  return {
    start: index,
    end,
    tagName,
    splitId,
    openTagFull: fullOpenTag,
    innerContent,
  };
}

/**
 * Remove data-dnt-split attribute from an opening tag string.
 */
function removeDataDntSplitFromTag(openTagFull) {
  return openTagFull
    .replace(/\s*data-dnt-split\s*=\s*["'][^"']*["']\s*/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Rejoin consecutive elements that share the same data-dnt-split ID
 * into a single element (first open tag without the attribute,
 * concatenated inner content, one closing tag).
 */
export function rejoinHtml(html) {
  const opens = findDataDntSplitElements(html);
  if (opens.length === 0) return html;

  const elements = opens
    .map((o) => extractElementWithSplitId(html, o))
    .filter(Boolean);

  if (elements.length === 0) return html;

  // Group elements by splitId that are consecutive or overlapping (same ID, merge into one)
  const groups = [];
  let currentGroup = [elements[0]];

  for (let i = 1; i < elements.length; i += 1) {
    const prev = elements[i - 1];
    const curr = elements[i];
    const sameId = curr.splitId === prev.splitId;
    const consecutiveOrOverlap = curr.start <= prev.end;

    if (sameId && consecutiveOrOverlap) {
      currentGroup.push(curr);
    } else {
      groups.push(currentGroup);
      currentGroup = [curr];
    }
  }
  groups.push(currentGroup);

  // Each group: start = first.start, end = last.end (full range), merge inner content in order
  const sortedGroups = groups
    .filter((g) => g.length > 0)
    .map((g) => ({
      start: g[0].start,
      end: g[g.length - 1].end,
      elements: g,
    }))
    .sort((a, b) => a.start - b.start);

  let result = html;
  let offset = 0;
  for (const group of sortedGroups) {
    const first = group.elements[0];
    const mergedOpen = removeDataDntSplitFromTag(first.openTagFull);
    const mergedInner = group.elements.map((el) => el.innerContent).join('');
    const merged = `${mergedOpen + mergedInner}</${first.tagName}>`;
    const start = group.start + offset;
    const end = group.end + offset;
    result = result.slice(0, start) + merged + result.slice(end);
    offset += merged.length - (group.end - group.start);
  }

  return result;
}
