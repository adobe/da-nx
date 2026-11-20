const SPACING = new Set([0, 4, 8, 12, 16, 24, 32]);
const WIDTHS = new Map([
  ['full', '100%'], ['min', 'min-content'], ['max', 'max-content'],
  ['fit', 'fit-content'], ['screen', '100vw'],
]);
const OPTIONS = {
  justify: ['justify-content', new Set(['start', 'center', 'end', 'space-between', 'space-around', 'space-evenly', 'stretch', 'normal'])],
  align: ['align-items', new Set(['start', 'end', 'center', 'baseline', 'stretch'])],
  wrap: ['flex-wrap', new Set(['nowrap', 'wrap', 'wrap-reverse'])],
};

export function layoutStyle({
  width, gap, padding, justify, align, wrap,
}) {
  const styles = {};
  if (width !== undefined) {
    if (typeof width === 'number' && Number.isFinite(width) && width > 0) {
      styles.width = `${width}px`;
    } else if (WIDTHS.has(width)) {
      styles.width = WIDTHS.get(width);
    } else {
      throw new Error('Unsupported layout width.');
    }
  }
  Object.entries({ gap, padding }).forEach(([key, value]) => {
    if (value === undefined) return;
    if (!SPACING.has(value)) throw new Error('Unsupported layout spacing.');
    styles[key] = `${value}px`;
  });
  Object.entries({ justify, align, wrap }).forEach(([key, value]) => {
    if (value === undefined) return;
    const [property, values] = OPTIONS[key];
    if (!values.has(value)) throw new Error('Unsupported layout alignment.');
    styles[property] = value;
  });
  return Object.entries(styles).map(([key, value]) => `${key}:${value}`).join(';');
}
