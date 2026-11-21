export const CHECKING_CHAT_ACCESS = {
  status: 'checking',
  title: 'Checking Coworker access...',
};

const ACCESS_STATES = {
  denied: {
    status: 'denied',
    title: 'Coworker unavailable',
    description: 'Please make sure you are logged in with the correct user and have selected the right Adobe org.',
    actionLabel: 'Open Profile',
  },
  error: {
    status: 'error',
    title: 'Coworker unavailable',
    description: 'Please try again later.',
    actionLabel: 'Retry',
  },
};

export function getChatAccessState({ allowed } = {}) {
  if (allowed === true) return undefined;
  return { ...ACCESS_STATES[allowed === false ? 'denied' : 'error'] };
}
