export const NETWORK = 'network';
export const SECRETS = 'secrets';
export const PII = 'pii';
export const STORAGE = 'storage';

export const isClientEligible = (capabilities) => capabilities.length === 0;
