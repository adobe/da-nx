const DA_SDK = (() => new Promise((resolve) => {
  window.addEventListener('message', (e) => { if (e.data) resolve(e.data); });
}))();

export default DA_SDK;
