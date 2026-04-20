export const MENU_OPTIONS = {
  PROMPT: 'prompt',
};

export const ADD_MENU_ITEMS = [
  { section: 'Add' },
  { id: 'files', label: 'Files or images', icon: 'Link' },
  { id: MENU_OPTIONS.PROMPT, label: 'Prompt', icon: 'CommentText' },
  { id: 'command', label: '"/" Command', icon: 'Prompt' },
  { divider: true },
  { id: 'prompts', label: 'Manage Prompts' },
  { id: 'skills', label: 'Manage Skills' },
];

export const CHAT_ICONS = {
  add: 'Add', clear: 'RemoveCircle', copy: 'Copy', send: 'ArrowUpSend', stop: 'Stop', up: 'ChevronUp',
};
