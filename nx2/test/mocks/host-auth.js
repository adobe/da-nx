let _isEmbedded = false;
let _context;
let _accessToken;

export function setMockHostAuth({ isEmbedded, context, token } = {}) {
  if (isEmbedded !== undefined) _isEmbedded = isEmbedded;
  if (context !== undefined) _context = context;
  if (token !== undefined) _accessToken = { token };
}

export function resetMockHostAuth() {
  _isEmbedded = false;
  _context = undefined;
  _accessToken = undefined;
}

export async function initHostAuth() {
  return { isEmbedded: _isEmbedded };
}

export async function getHostContext() {
  return _context;
}

export async function getAccessToken() {
  return _accessToken;
}

export async function setHash() {
  return undefined;
}
