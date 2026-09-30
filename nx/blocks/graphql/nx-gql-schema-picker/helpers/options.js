// A row's unsaved change against the saved selection; none for a new endpoint.
const getChange = ({ selected, wasSelected, saved }) => {
  if (!saved || selected === wasSelected) return undefined;
  return selected ? 'adding' : 'removing';
};

// Site schemas plus missing ids that are selected or saved, so they can be deselected.
export function getSchemaOptions({ draft, schemas = [], saved }) {
  const selected = new Set(draft.schemas);
  const savedIds = new Set(saved);
  const known = new Set(schemas.map(({ id }) => id));
  const withChange = (row) => {
    const change = getChange({ selected: row.selected, wasSelected: savedIds.has(row.id), saved });
    return change ? { ...row, change } : row;
  };
  const rows = schemas.map((entry) => withChange({
    id: entry.id,
    title: entry.schema?.title,
    selected: selected.has(entry.id),
    usable: !!entry.valid,
    issues: entry.issues ?? [],
  }));
  const missingIds = [...new Set([...draft.schemas, ...savedIds])].filter((id) => !known.has(id));
  const missing = missingIds.map((id) => withChange({
    id,
    selected: selected.has(id),
    usable: false,
    missing: true,
    issues: ['This schema no longer exists.'],
  }));
  return [...rows, ...missing];
}

// `statusLabel(option)` lets the view make its status wording searchable too.
export function filterSchemaOptions({ options = [], query = '', statusLabel }) {
  const needle = query.trim().toLowerCase();
  if (!needle) return options;
  return options.filter((option) => [option.id, option.title, statusLabel?.(option)]
    .some((value) => value?.toLowerCase().includes(needle)));
}

// In Status sort order; a plain selection has no status, as the checkbox shows it.
const SCHEMA_STATUSES = ['invalid', 'missing', 'adding', 'removing'];

export function getSchemaStatus({ usable, missing, change }) {
  if (change) return change;
  if (usable) return undefined;
  return missing ? 'missing' : 'invalid';
}

export function countChanges(options = []) {
  const count = (change) => options.filter((option) => option.change === change).length;
  return { adding: count('adding'), removing: count('removing') };
}

const compareText = (a, b) => {
  if (!a || !b) return !a - !b;
  return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
};

const SORT_VALUES = {
  id: (option) => option.id,
  title: (option) => option.title || option.id,
  status: (option) => {
    const index = SCHEMA_STATUSES.indexOf(getSchemaStatus(option));
    return index < 0 ? SCHEMA_STATUSES.length : index;
  },
};

// Empty titles and status-less rows stay last in both directions; ties sort by id.
export function sortSchemaOptions({ options = [], key = 'title', direction = 'ascending' }) {
  const valueOf = SORT_VALUES[key] ?? SORT_VALUES.id;
  const sign = direction === 'descending' ? -1 : 1;
  const last = key === 'status' ? SCHEMA_STATUSES.length : undefined;
  const rank = (option) => {
    const value = valueOf(option);
    return value === last || value === undefined || value === '' ? 1 : 0;
  };
  const compare = (a, b) => {
    const [valueA, valueB] = [a, b].map(valueOf);
    return typeof valueA === 'number' ? valueA - valueB : compareText(valueA, valueB);
  };
  return [...options].sort((a, b) => rank(a) - rank(b)
    || sign * compare(a, b)
    || compareText(a.id, b.id));
}
