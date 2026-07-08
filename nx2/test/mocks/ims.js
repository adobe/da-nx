let _accessToken = { token: 'test-token' };
let _anonymous = false;
let _userId = 'test-user@AdobeID';
let _displayName = 'Test User';
let _email = 'test-user@adobe.com';
let _io = { user: { avatar: 'https://example.com/avatar.png' } };
let _orgs = { data: [] };

export function setMockIms({
  token, anonymous, userId, displayName, email, io, orgs,
} = {}) {
  if (token !== undefined) _accessToken = token;
  if (anonymous !== undefined) _anonymous = anonymous;
  if (userId !== undefined) _userId = userId;
  if (displayName !== undefined) _displayName = displayName;
  if (email !== undefined) _email = email;
  if (io !== undefined) _io = io;
  if (orgs !== undefined) _orgs = orgs;
}

export function resetMockIms() {
  _accessToken = { token: 'test-token' };
  _anonymous = false;
  _userId = 'test-user@AdobeID';
  _displayName = 'Test User';
  _email = 'test-user@adobe.com';
  _io = { user: { avatar: 'https://example.com/avatar.png' } };
  _orgs = { data: [] };
}

export const loadIms = async () => {
  if (_anonymous) return { anonymous: true };
  return {
    anonymous: false,
    accessToken: _accessToken,
    userId: _userId,
    displayName: _displayName,
    email: _email,
    getIo: async () => _io,
    getOrgs: async () => _orgs,
  };
};

export function handleSignIn() {}

export function handleSignOut() {}
