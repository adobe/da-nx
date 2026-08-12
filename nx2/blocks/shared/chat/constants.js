export const ADOBE_AI_GUIDELINES_URL = 'https://www.adobe.com/legal/licenses-terms/adobe-dx-gen-ai-user-guidelines.html';

export const MENU_OPTIONS = {
  PROMPT: 'prompt',
  COMMAND: 'command',
  FILES: 'files',
  MANAGE_SKILLS: 'skills',
  MANAGE_PROMPT: 'prompts',
};

export const ADD_MENU_ITEMS = [
  { section: 'Add' },
  { id: MENU_OPTIONS.FILES, label: 'Files or images', icon: 'link' },
  { id: MENU_OPTIONS.PROMPT, label: 'Prompt', icon: 'commentremove' },
  { id: MENU_OPTIONS.COMMAND, label: '"/" Command', icon: 'prompt' },
  { divider: true },
  { id: MENU_OPTIONS.MANAGE_PROMPT, label: 'Manage Prompts' },
  { id: MENU_OPTIONS.MANAGE_SKILLS, label: 'Manage Skills' },
];

export const ICON_NAMES = {
  add: 's2-icon-add-20-n',
  clear: 's2-icon-removecircle-20-n',
  close: 's2-icon-splitleft-20-n',
  send: 's2-icon-arrowupsend-20-n',
  stop: 's2-icon-stop-20-n',
  up: 's2-icon-chevronup-20-n',
};
