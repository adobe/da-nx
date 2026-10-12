let _accessToken = { token: 'test-token' };
let _anonymous = false;
let _userId = 'test-user@AdobeID';
let _displayName = 'Test User';
let _email = 'test-user@adobe.com';
let _userImageUrl;
let _orgs = { data: [] };
let _projectedProductContext;

export function setMockIms({
  token, anonymous, userId, displayName, email, userImageUrl, orgs, projectedProductContext,
} = {}) {
  if (token !== undefined) _accessToken = token;
  if (anonymous !== undefined) _anonymous = anonymous;
  if (userId !== undefined) _userId = userId;
  if (displayName !== undefined) _displayName = displayName;
  if (email !== undefined) _email = email;
  if (userImageUrl !== undefined) _userImageUrl = userImageUrl;
  if (orgs !== undefined) _orgs = orgs;
  if (projectedProductContext !== undefined) _projectedProductContext = projectedProductContext;
}

export function resetMockIms() {
  _accessToken = { token: 'test-token' };
  _anonymous = false;
  _userId = 'test-user@AdobeID';
  _displayName = 'Test User';
  _email = 'test-user@adobe.com';
  _userImageUrl = undefined;
  _orgs = { data: [] };
  _projectedProductContext = undefined;
}

export const loadIms = async () => {
  if (_anonymous) return { anonymous: true };
  return {
    anonymous: false,
    accessToken: _accessToken,
    userId: _userId,
    displayName: _displayName,
    email: _email,
    user_image_url: _userImageUrl,
    projectedProductContext: _projectedProductContext,
    getIo: async () => ({ user: { avatar: _userImageUrl } }),
    getOrgs: async () => _orgs,
  };
};

export function handleSignIn() {}

export function handleSignOut() {}
