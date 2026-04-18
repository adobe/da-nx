import { readFileSync, writeFileSync } from 'fs';

const TOKENS = new URL('../../../node_modules/@adobe/spectrum-tokens/src/', import.meta.url);

const colors = JSON.parse(readFileSync(new URL('color-palette.json', TOKENS), 'utf8'));
const layout = JSON.parse(readFileSync(new URL('layout.json', TOKENS), 'utf8'));
const typography = JSON.parse(readFileSync(new URL('typography.json', TOKENS), 'utf8'));

/* --- Config: which tokens to include --- */

const COLOR_FAMILIES = {
  gray: [25, 50, 75, ...range(100, 1000, 100)],
  blue: range(100, 1200, 100),
  red: range(100, 1200, 100),
  orange: range(100, 1200, 100),
  yellow: range(100, 1200, 100),
  green: range(100, 1200, 100),
  seafoam: range(100, 1200, 100),
  cyan: range(100, 1200, 100),
  pink: range(100, 1200, 100),
};

const HEADING_SIZES = ['xs', 's', 'm', 'l', 'xl', 'xxl', 'xxxl', 'xxxxl'];
const BODY_SIZES = ['xxs', 'xs', 's', 'm', 'l', 'xl', 'xxl', 'xxxl'];
const COMPONENT_SIZES = ['xs', 's', 'm', 'l', 'xl'];
const COMPONENT_WEIGHTS = ['regular', 'medium', 'bold'];

const SPACING = [50, 75, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
const CORNER_RADIUS = [0, 75, 100, 200, 300, 400, 500, 600, 700, 800];

const FONT_WEIGHT_MAP = {
  'light': 300,
  'regular': 400,
  'medium': 500,
  'bold': 700,
  'extra-bold': 800,
  'black': 900,
};

/* --- Helpers --- */

function range(start, end, step) {
  const result = [];
  for (let i = start; i <= end; i += step) result.push(i);
  return result;
}

function resolveAlias(name) {
  const match = name.match(/^\{(.+)\}$/);
  return match ? match[1] : null;
}

function resolveFontSize(alias) {
  const tokenName = resolveAlias(alias);
  const token = typography[tokenName];
  if (!token?.sets?.desktop) throw new Error(`Cannot resolve font-size: ${alias}`);
  return token.sets.desktop.value;
}

function resolveLineHeight(alias) {
  const tokenName = resolveAlias(alias);
  const token = typography[tokenName];
  if (!token) throw new Error(`Cannot resolve line-height: ${alias}`);
  if (token.sets?.desktop) return token.sets.desktop.value;
  if (token.value !== undefined) return token.value;
  throw new Error(`Cannot resolve line-height: ${alias}`);
}

function resolveMultiplier(alias) {
  const tokenName = resolveAlias(alias);
  const token = typography[tokenName];
  if (!token?.value) throw new Error(`Cannot resolve: ${alias}`);
  return token.value;
}

function resolveFontWeight(alias) {
  const tokenName = resolveAlias(alias);
  const token = typography[tokenName];
  if (!token?.value) throw new Error(`Cannot resolve font-weight: ${alias}`);
  return FONT_WEIGHT_MAP[token.value] ?? token.value;
}

/** Normalize `rgb(r, g, b)` → `rgb(r g b)` for modern CSS. */
function normalizeRgb(value) {
  return value.replace(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/g, 'rgb($1 $2 $3)');
}

/* --- Build Colors --- */

function buildColors() {
  const lines = ['  /* color */'];

  for (const [family, stops] of Object.entries(COLOR_FAMILIES)) {
    for (const stop of stops) {
      const key = `${family}-${stop}`;
      const token = colors[key];
      if (!token?.sets) throw new Error(`Missing color-set token: ${key}`);

      const light = normalizeRgb(token.sets.light.value);
      const dark = normalizeRgb(token.sets.dark.value);
      lines.push(`  --s2-${key}: light-dark(${light}, ${dark});`);
    }
  }

  return lines.join('\n');
}

/* --- Build Layout --- */

function buildSpacing() {
  const lines = ['  /* spacing */'];
  for (const stop of SPACING) {
    const token = layout[`spacing-${stop}`];
    if (!token?.value) throw new Error(`Missing spacing-${stop}`);
    lines.push(`  --s2-spacing-${stop}: ${token.value};`);
  }
  return lines.join('\n');
}

function buildCornerRadius() {
  const lines = ['  /* corner radius */'];
  for (const stop of CORNER_RADIUS) {
    const token = layout[`corner-radius-${stop}`];
    if (!token) throw new Error(`Missing corner-radius-${stop}`);
    lines.push(`  --s2-corner-radius-${stop}: ${token.value};`);
  }
  return lines.join('\n');
}

/* --- Build Typography --- */

function buildHeading() {
  const lines = ['  /* heading */'];
  const lineHeight = resolveMultiplier(typography['heading-line-height'].value);
  const fontWeight = resolveFontWeight(typography['heading-sans-serif-font-weight'].value);

  for (const size of HEADING_SIZES) {
    const token = typography[`heading-size-${size}`];
    if (!token) throw new Error(`Missing heading-size-${size}`);
    lines.push(`  --s2-heading-size-${size}: ${resolveFontSize(token.value)};`);
  }

  lines.push(`  --s2-heading-font-weight: ${fontWeight};`);
  lines.push(`  --s2-heading-line-height: ${lineHeight};`);
  lines.push(`  --s2-heading-margin-top-multiplier: ${parseFloat(typography['heading-margin-top-multiplier'].value.toFixed(4))};`);
  lines.push(`  --s2-heading-margin-bottom-multiplier: ${typography['heading-margin-bottom-multiplier'].value};`);

  return lines.join('\n');
}

function buildBody() {
  const lines = ['  /* body */'];
  const lineHeight = resolveMultiplier(typography['body-line-height'].value);
  const fontWeight = resolveFontWeight(typography['body-sans-serif-font-weight'].value);

  for (const size of BODY_SIZES) {
    const token = typography[`body-size-${size}`];
    if (!token) throw new Error(`Missing body-size-${size}`);
    lines.push(`  --s2-body-size-${size}: ${resolveFontSize(token.value)};`);
  }

  lines.push(`  --s2-body-font-weight: ${fontWeight};`);
  lines.push(`  --s2-body-line-height: ${lineHeight};`);
  lines.push(`  --s2-body-margin-multiplier: ${typography['body-margin-multiplier'].value};`);

  return lines.join('\n');
}

function buildComponent() {
  const lines = ['  /* component */'];

  for (const size of COMPONENT_SIZES) {
    for (const weight of COMPONENT_WEIGHTS) {
      const key = `component-${size}-${weight}`;
      const token = typography[key];
      if (!token?.value) throw new Error(`Missing ${key}`);

      const prefix = `--s2-${key}`;
      lines.push(`  ${prefix}-font-size: ${resolveFontSize(token.value.fontSize)};`);
      lines.push(`  ${prefix}-font-weight: ${resolveFontWeight(token.value.fontWeight)};`);
      lines.push(`  ${prefix}-line-height: ${resolveLineHeight(token.value.lineHeight)};`);
    }
  }

  return lines.join('\n');
}

/* --- Assemble & inject --- */

const START = '/* --- Generated by nx/deps/spectrum/build.js — do not edit --- */';
const END = '/* --- End generated --- */';

const tokens = [
  `  ${START}`,
  '',
  buildColors(),
  '',
  buildSpacing(),
  '',
  buildCornerRadius(),
  '',
  buildHeading(),
  '',
  buildBody(),
  '',
  buildComponent(),
  '',
  `  ${END}`,
].join('\n');

const stylesPath = new URL('../../styles/styles.css', import.meta.url);
const styles = readFileSync(stylesPath, 'utf8');

const indentedStart = `  ${START}`;
const indentedEnd = `  ${END}`;
const startIdx = styles.indexOf(indentedStart);
const endIdx = styles.indexOf(indentedEnd);
if (startIdx === -1 || endIdx === -1) {
  throw new Error('Could not find generated token markers in styles.css');
}

const updated = styles.slice(0, startIdx) + tokens + styles.slice(endIdx + indentedEnd.length);
writeFileSync(stylesPath, updated);
console.log('Injected spectrum tokens into nx/styles/styles.css');
