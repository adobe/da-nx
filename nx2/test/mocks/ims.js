let _accessToken = { token: 'test-token' };
let _anonymous = false;

export function setMockIms({ token, anonymous } = {}) {
  if (token !== undefined) _accessToken = token;
  if (anonymous !== undefined) _anonymous = anonymous;
}

export function resetMockIms() {
  _accessToken = { token: 'test-token' };
  _anonymous = false;
}

export const loadIms = async () => {
  if (_anonymous) return { anonymous: true };
  return { accessToken: _accessToken };
};

export function handleSignIn() {}

export function handleSignOut() {}
