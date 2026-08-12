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
