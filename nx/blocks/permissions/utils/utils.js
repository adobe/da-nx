import { AEM_ORIGIN, DA_ORIGIN } from '../../../public/utils/constants.js';
import { daFetch } from '../../../utils/daFetch.js';

// See: https://www.aem.live/docs/authentication-setup-authoring
const AEM_ROLES = ['admin', 'basic_author', 'basic_publish', 'author', 'publish', 'develop', 'config', 'config_admin'];

function pathToDetails(path) {
  const [, org, site] = path.split('/');
  return { org, site };
}

function handleError(status, path) {
  const error = { error: true, status };

  if (status === 404) return { ...error, message: `Permissions do not exist for ${path}.` };
  if (status === 403) return { ...error, message: `Not authorized to view permissions for ${path}.` };
  if (status === 401) return { ...error, message: `Not authorized to view permissions for ${path}.` };

  return { ...error, message: `Unknown error getting permissions for: ${path}.` };
}

async function formatOrgUsers(resp) {
  const json = await resp.json();

  json.users = json.users.map((user) => ({
    ...user,
    aemId: user.id,
    id: user.email,
  }));

  return json;
}

async function formatAccess(resp) {
  const json = await resp.json();

  const roles = json.admin.role || [];

  const users = Object.keys(roles).reduce((acc, key) => {
    json.admin.role[key].forEach((email) => {
      let user = acc.find((existingUser) => existingUser.email === email);
      if (!user) {
        user = { email, roles: [] };
        acc.push(user);
      }
      user.roles = [...user.roles, key];
    });

    return acc;
  }, []);
  return { users };
}

async function daUserConfig(path, opts = {}) {
  return daFetch(`${DA_ORIGIN}/source${path}/.da/aem-permission-requests.json`, opts);
}

export async function getDaUsers(path) {
  const resp = await daUserConfig(path);
  if (!resp.ok) return [];
  return (await resp.json()).users?.data.map((user) => {
    const formatted = {
      displayName: `${user['First Name']} ${user['Last Name']}`,
      email: user.Email,
      id: user.Id,
    };

    if (user['Role Request']) {
      formatted.requested = user['Role Request'].split(',').map((role) => role.trim());
    } else {
      formatted.requested = [];
    }

    return formatted;
  }) || [];
}

async function fetchAemOrg(org) {
  return daFetch(`${AEM_ORIGIN}/config/${org}.json`);
}

async function fetchAemSite(org, site) {
  const resp = await daFetch(`${AEM_ORIGIN}/config/${org}/sites/${site}/access.json`);
  if (resp.status === 404) {
    return {
      ok: true,
      json: async () => ({
        admin: {
          requireAuth: 'false',
          role: {
            admin: [],
            author: [],
            publish: [],
          },
        },
      }),
    };
  }
  return resp;
}

async function saveToAem(path, json, method = 'POST') {
  const opts = { method };

  if (method === 'POST') {
    opts.body = JSON.stringify(json);
    opts.headers = { 'Content-Type': 'application/json' };
  }

  return daFetch(`${AEM_ORIGIN}${path}`, opts);
}

export async function getAemConfig(suppliedPath) {
  const { org, site } = pathToDetails(suppliedPath);
  const resp = site ? await fetchAemSite(org, site) : await fetchAemOrg(org);
  if (!resp.ok) return handleError(resp.status, suppliedPath);
  if (site) return formatAccess(resp);
  return formatOrgUsers(resp);
}

function compareRoles(aemUser, daUser) {
  // If no requests, give back all the AEM roles
  if (daUser.requested.length < 1) return { roles: aemUser.roles, requested: [] };

  // Filter down to only net new requests
  const requested = daUser.requested
    .filter((requestedRole) => !aemUser.roles.some((role) => role === requestedRole));

  // Combine existing AEM roles with new requests
  return { roles: aemUser.roles, requested };
}

export function combineUsers(daUsers, aemUsers) {
  // Combine up all the existing AEM users that have new requests
  const combined = aemUsers.reduce((acc, aemUser) => {
    const foundUser = daUsers.find((daUser) => daUser.id === aemUser.email);

    // If user wasn't found in DA users, push them to aemUsers.
    if (!foundUser) {
      acc.aemUsers.push(aemUser);
      return acc;
    }

    const { roles, requested } = compareRoles(aemUser, foundUser);
    const userType = requested.length > 0 ? 'daUsers' : 'aemUsers';
    acc[userType].push({ ...aemUser, ...foundUser, roles, requested });

    return acc;
  }, { daUsers: [], aemUsers: [] });

  const onlyRequests = daUsers.filter((daUser) => {
    const inDaCombined = combined.daUsers.find((user) => daUser.id === user.id);
    const inAemCombined = combined.aemUsers.find((user) => daUser.id === user.id);
    return !inDaCombined && !inAemCombined && daUser.requested.length > 0;
  });

  combined.daUsers.push(...onlyRequests);

  // If there's absolutely nothing, drop the entire DA user list
  // user.js will see there are no permissions and put some default requests into an inactive state.
  if (combined.aemUsers.length === 0 && combined.daUsers.length === 0) {
    return { daUsers };
  }

  return combined;
}

export async function clearRequests(path, user) {
  const resp = await daUserConfig(path);
  if (!resp.ok) return handleError(resp.status, path);
  const json = await resp.json();

  // Un-sanitized will be a capital Id as this is can be pasted from adminconsole CSV.
  const daUser = json.users.data.find((userData) => userData.Id === user.id);
  if (!daUser) return null;
  daUser['Role Request'] = '';

  const body = new FormData();
  const data = new Blob([JSON.stringify(json)], { type: 'application/json' });

  body.set('data', data);
  const opts = { method: 'POST', body };
  return daUserConfig(path, opts);
}

async function approveSiteUser(org, site, path, user) {
  // Fetch a fresh copy of permissions
  const resp = site ? await fetchAemSite(org, site) : fetchAemOrg(org);
  if (!resp.ok) return handleError(resp.status, path);
  const json = await resp.json();

  const { requested = [], roles = [] } = user;

  const approvedRoles = [...new Set([...requested, ...roles])];

  AEM_ROLES.forEach((role) => {
    const existingRoleUsers = json.admin.role[role] || [];

    // Find the role in the approved role array
    const found = approvedRoles.some((approvedRole) => approvedRole === role);

    if (found) {
      // If found, check to see if the user is already in the list.
      const exists = existingRoleUsers.some((existingUser) => existingUser === user.id);

      // It's possible there's nothing in the role, so set it if the user isn't already there
      if (!exists) json.admin.role[role] = [...existingRoleUsers, user.id];
    } else {
      // Check to see if there are existing users in the current role
      if (!existingRoleUsers.length) return;

      // Ensure this user is removed if they've had the role taken away from them
      json.admin.role[role] = existingRoleUsers.filter((existingUser) => existingUser !== user.id);
    }
  });

  // Make sure existing requests are cleared out.
  await clearRequests(path, user);

  const aemPath = `/config/${org}/sites/${site}/access.json`;

  return saveToAem(aemPath, json);
}

async function approveOrgUser(org, path, user) {
  const { id, aemId, requested = [], roles = [] } = user;
  const approvedRoles = [...new Set([...requested, ...roles])];

  const pathBase = `/config/${org}/users`;
  const aemPath = aemId ? `${pathBase}/${aemId}.json` : `${pathBase}.json`;

  const json = { email: id, roles: approvedRoles };
  if (aemId) json.id = aemId;

  await clearRequests(path, user);

  return saveToAem(aemPath, json);
}

export async function approveUser(path, user) {
  const { org, site } = pathToDetails(path);

  if (site) return approveSiteUser(org, site, path, user);

  return approveOrgUser(org, path, user);
}

async function removeSiteUser(org, site, path, user) {
  const userId = user.id || user.email;

  // Fetch a fresh copy of permissions
  const resp = await fetchAemSite(org, site);
  if (!resp.ok) return handleError(resp.status, path);
  const json = await resp.json();

  Object.keys(json.admin.role).forEach((key) => {
    const roleUsers = json.admin.role[key];
    json.admin.role[key] = roleUsers.filter((roleUserId) => roleUserId !== userId);
  });

  // Make sure existing requests are cleared out.
  await clearRequests(path, user);

  const aemPath = `/config/${org}/sites/${site}/access.json`;

  return saveToAem(aemPath, json);
}

async function removeOrgUser(org, path, user) {
  const pathBase = `/config/${org}/users`;
  const aemPath = `${pathBase}/${user.aemId}.json`;

  await clearRequests(path, user);
  return saveToAem(aemPath, null, 'DELETE');
}

export async function removeUser(path, user) {
  const { org, site } = pathToDetails(path);

  if (site) return removeSiteUser(org, site, path, user);

  return removeOrgUser(org, path, user);
}
