import { setupDependencies } from '../../utils/dependencies.js';

setupDependencies();

const { default: loadQuickEdit, claimBootstrap } = await import('./quick-edit-core.js');

export { claimBootstrap };
export default loadQuickEdit;
