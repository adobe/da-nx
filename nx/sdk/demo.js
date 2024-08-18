import DA_SDK from '../utils/sdk.js';

(async function init() {
  const { project, token, actions } = await DA_SDK;
  actions.sendText('Ryan is the coolest');
  actions.closeLibrary();
  // const tagBrowser = document.createElement('da-tag-browser');
  // tagBrowser.project = project;
  // tagBrowser.token = token;
  // document.body.append(tagBrowser);
}());
