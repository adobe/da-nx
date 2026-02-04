import DA_SDK from '../utils/sdk.js';

(async function init() {
  const { actions } = await DA_SDK;
  actions.sendText('Send text and close');
  actions.closeLibrary();
}());
