export const env = 'test';

export function getConfig() {
  return { codeBase: '/nx2' };
}

export function setConfig() {}

export async function loadStyle() {
  return new CSSStyleSheet();
}

export function getMetadata() { return null; }
export function getLocale() { return null; }
export function getColorScheme() { return 'light'; }
export const loc = ([first]) => first;
// eslint-disable-next-line no-empty-function
export async function loadBlock() {}
export function decorateLink() {}
// eslint-disable-next-line no-empty-function
export async function loadArea() {}
