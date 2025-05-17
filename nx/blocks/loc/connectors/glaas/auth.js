function getAuthUri(clientid, origin) {
  const redirectUri = encodeURI(window.location.href);
  console.log(redirectUri);
  const endpoint = `${origin}/api/common/sweb/oauth/authorize`;
  const params = `?response_type=token&state=home&client_id=${clientid}&redirect_uri=${redirectUri}`;
  return `${endpoint}${params}`;
}

export async function getGlaasToken(service) {
  let auth;
  const { origin = '' } = service;
  const keyName = origin?.includes('stage') ? 'glaasAuthStage' : 'glaasAuth';
  // Attempt with previous auth store
  const authStore = localStorage.getItem(keyName);
  if (authStore) {
    auth = JSON.parse(authStore);
    if (auth.token && auth.expires > Date.now()) {
      return auth.token;
    }
    // Remove expired auth store
    localStorage.removeItem(keyName);
  }
  // Attempt with previous hash
  const prevHash = localStorage.getItem('prevHash');
  if (prevHash && prevHash.includes('access_token=')) {
    localStorage.removeItem('prevHash');
    const token = prevHash.slice(1).split('&')[0].split('access_token=')[1];
    if (token) {
      // 12 hour expiration
      const expires = Date.now() + (10000 * 4320);
      localStorage.setItem(keyName, JSON.stringify({ token, expires }));
      return token;
    }
  }
  return null;
}

export async function connectToGlaas(origin, clientid) {
  const url = getAuthUri(clientid, origin);
  window.location = url;
}
