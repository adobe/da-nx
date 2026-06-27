// The worker bootstrap source code as a string
export const WORKER_BOOTSTRAP = `
// Neuter ambient globals for security sandboxing
function neuter(obj, prop) {
  try { obj[prop] = undefined; } catch {
    try { Object.defineProperty(obj, prop, { value: undefined, writable: false, configurable: false }); } catch {}
  }
}
neuter(self, 'fetch');
neuter(self, 'XMLHttpRequest');
neuter(self, 'WebSocket');
neuter(self, 'importScripts');
neuter(self, 'indexedDB');
neuter(self, 'caches');
neuter(self, 'Notification');
if (self.navigator) {
  try { Object.defineProperty(self.navigator, 'sendBeacon', { value: undefined, writable: false }); } catch {}
}

self.onmessage = async ({ data }) => {
  const { moduleUrl, entry, input, timeoutMs } = data;
  const logs = [];
  const host = {
    log: (...args) => { logs.push(args.map(String).join(' ')); },
  };
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('timeout')), timeoutMs)
  );
  try {
    const mod = await import(moduleUrl);
    const output = await Promise.race([mod[entry](input, host), timeoutPromise]);
    self.postMessage({ json: { output, logs } });
  } catch (err) {
    self.postMessage({ error: err.message || String(err) });
  }
};
`;

export default WORKER_BOOTSTRAP;
