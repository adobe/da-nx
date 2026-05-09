function normalizeCapabilities(permissions) {
  if (!permissions || typeof permissions !== 'object') {
    return {
      canEdit: true,
    };
  }

  if (typeof permissions.canEdit === 'boolean') {
    return {
      ...permissions,
      canEdit: permissions.canEdit,
    };
  }

  return {
    ...permissions,
    canEdit: true,
  };
}

export function evaluatePermissions({ permissions }) {
  const capabilities = normalizeCapabilities(permissions);
  const canEdit = !!capabilities.canEdit;

  return {
    readonly: !canEdit,
    disabled: !canEdit,
    capabilities,
  };
}
