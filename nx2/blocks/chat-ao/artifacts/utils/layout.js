const GAPS = new Map([
  [0, '0px'],
  [4, 'var(--s2-spacing-50)'],
  [8, 'var(--s2-spacing-100)'],
  [12, 'var(--s2-spacing-150)'],
  [16, 'var(--s2-spacing-200)'],
  [24, 'var(--s2-spacing-300)'],
  [32, 'var(--s2-spacing-400)'],
]);
const JUSTIFY = new Set([
  'start', 'center', 'end', 'space-between', 'space-around', 'space-evenly', 'stretch', 'normal',
]);
const ALIGN = new Set(['start', 'end', 'center', 'baseline', 'stretch']);
const WRAP = new Set(['nowrap', 'wrap', 'wrap-reverse']);

export function getLayoutStyle({
  gap, justify, align, wrap,
}) {
  if ((gap !== undefined && !GAPS.has(gap))
    || (justify !== undefined && !JUSTIFY.has(justify))
    || (align !== undefined && !ALIGN.has(align))
    || (wrap !== undefined && !WRAP.has(wrap))) {
    throw new Error('Unsupported artifact layout.');
  }
  return [
    ['gap', GAPS.get(gap)],
    ['justify-content', justify],
    ['align-items', align],
    ['flex-wrap', wrap],
  ].filter(([, value]) => value !== undefined)
    .map(([property, value]) => `${property}: ${value}`).join('; ');
}
