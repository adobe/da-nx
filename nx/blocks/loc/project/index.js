const DA_ORIGIN = 'https://admin.da.live';

let projPath;

async function fetchData(path) {
  const resp = await fetch(path);
  if (!resp.ok) return null;
  return resp.json();
}

export async function getDetails() {
  projPath = window.location.hash.replace('#', '');
  const data = await fetchData(`${DA_ORIGIN}/source${projPath}.json`);
  console.log(data);
  return data;
}

export async function copy(url) {
  const body = new FormData();
  body.append('destination', url.destination);
  const opts = { method: 'POST', body };

  return new Promise((resolve) => {
    (() => {
      const fetched = fetch(`${DA_ORIGIN}/copy${url.source}`, opts);

      const timedout = setTimeout(() => {
        url.status = 'timeout';
        resolve('timeout');
      }, 20000);

      fetched.then((resp) => {
        clearTimeout(timedout);
        url.status = resp.ok ? 'success' : 'error';
        resolve();
      }).catch(() => {
        clearTimeout(timedout);
        url.status = 'error';
        resolve();
      });
    })();
  });
}
