/**
 * Must run before any other script that may load da.live modules.
 * setNx() so getNx() is set in the shared utils instance (da-dialog, etc.).
 * IMS auth is handled by initIms/daFetch (nx/utils/daFetch.js) when the canvas loads.
 */
// eslint-disable-next-line import/no-unresolved
import { setNx } from 'https://da.live/scripts/utils.js';

setNx('/nx', window.location);
