// Full example from da-sc-sdk docs/schema-spec.md §9.
export default {
  $defs: {
    Address: {
      type: 'object',
      title: 'Address',
      required: ['country'],
      properties: {
        street: { type: 'string', title: 'Street' },
        city: { type: 'string', title: 'City' },
        country: { type: 'string', title: 'Country' },
      },
    },
    Contact: {
      type: 'object',
      title: 'Contact',
      required: ['name'],
      properties: {
        name: { type: 'string', title: 'Name' },
        email: { type: 'string', title: 'Email' },
        address: { $ref: '#/$defs/Address' },
      },
    },
    Milestone: {
      type: 'object',
      title: 'Milestone',
      required: ['name'],
      properties: {
        name: { type: 'string', title: 'Name', minLength: 1, maxLength: 80 },
        completed: { type: 'boolean', title: 'Completed', default: false },
        owner: { $ref: '#/$defs/Contact' },
      },
    },
  },
  type: 'object',
  title: 'Project',
  required: ['title', 'slug', 'status'],
  properties: {
    title: { type: 'string', title: 'Title', default: 'Untitled project' },
    slug: {
      type: 'string', title: 'Slug', minLength: 3, maxLength: 30, pattern: '^[a-z0-9-]+$',
    },
    summary: {
      type: 'string',
      title: 'Summary',
      description: 'A short abstract shown in listings.',
      maxLength: 280,
      'x-semantic-type': 'long-text',
    },
    status: {
      type: 'string',
      title: 'Status',
      enum: ['Planning', 'Active', 'Completed', 'On Hold'],
      default: 'Planning',
    },
    priority: {
      type: 'integer', title: 'Priority', minimum: 1, maximum: 5, default: 3,
    },
    score: {
      type: 'number', title: 'Score', minimum: 0, maximum: 100,
    },
    publishDate: { type: 'string', title: 'Publish date', format: 'date' },
    publishedAt: { type: 'string', title: 'Published at', format: 'date-time' },
    dailyStandup: { type: 'string', title: 'Daily standup', format: 'time' },
    archived: { type: 'boolean', title: 'Archived', default: false },
    ownerId: { type: 'string', title: 'Owner ID', readOnly: true },
    tags: {
      type: 'array',
      title: 'Tags',
      minItems: 1,
      maxItems: 10,
      items: { type: 'string', title: 'Tag' },
    },
    owner: { $ref: '#/$defs/Contact' },
    collaborators: {
      type: 'array',
      title: 'Collaborators',
      items: { $ref: '#/$defs/Contact' },
    },
    milestones: {
      type: 'array',
      title: 'Milestones',
      items: { $ref: '#/$defs/Milestone' },
    },
    links: {
      type: 'array',
      title: 'Links',
      items: {
        type: 'object',
        title: 'Link',
        required: ['url'],
        properties: {
          label: { type: 'string', title: 'Label' },
          url: { type: 'string', title: 'URL', pattern: '^https?://' },
        },
      },
    },
  },
};
