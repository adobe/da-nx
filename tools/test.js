import { Queue } from '../nx/public/utils/tree.js';
import { daFetch } from '../nx/utils/daFetch.js';

async function run(urls) {
  const uiUpdater = async (url) => {
    const resp = await daFetch(url);
    console.log(resp.ok);
  };

  const queue = new Queue(uiUpdater, 50);

  await Promise.all(urls.map((url) => queue.push(url)));
}

(async function loadPostLCP() {
  const form = document.querySelector('form');
  form.addEventListener('submit', () => {
    const formData = new FormData(form);
    const { urls } = Object.fromEntries(formData);
    run(urls);
  });
}());
