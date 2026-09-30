// User-facing wording, kept apart from the logic and the markup.

// Status light props per nx-gql-schema-picker/helpers/options.js getSchemaStatus.
export const SCHEMA_STATUSES = {
  invalid: {
    variant: 'negative',
    label: 'Invalid',
    title: 'This schema cannot be used in GraphQL. Fix it in the Schema Editor.',
  },
  missing: {
    variant: 'negative',
    label: 'Not found',
    title: 'This schema no longer exists. Deselect it to remove it from the endpoint.',
  },
  adding: {
    variant: 'notice',
    label: 'Adding',
    title: 'Added to the endpoint when you save.',
  },
  removing: {
    variant: 'notice',
    label: 'Removing',
    title: 'Removed from the endpoint when you save.',
  },
};

export const unsavedSchemaChanges = ({ adding, removing }) => [
  adding && `${adding} adding`,
  removing && `${removing} removing`,
].filter(Boolean).join(', ');

export const READ_ONLY = {
  heading: 'View only',
  text: 'You do not have permission to change GraphQL endpoints for this site. Contact your administrator for access.',
};

export const endpointSaved = (name) => `Endpoint "${name}" saved.`;

export const endpointDeleted = (name) => `Endpoint "${name}" deleted.`;

// SDL problems are { schemaId, pointer, message }.
export function describeProblem({ schemaId, pointer, message }) {
  if (!schemaId) return message;
  return `${schemaId}${pointer ? ` #${pointer}` : ''}: ${message}`;
}
