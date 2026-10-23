import { setupDependencies } from '../../utils/dependencies.js';

setupDependencies();

const { default: loadQuickEdit } = await import('./quick-edit-core.js');

export default loadQuickEdit;
