// Dependency allowlist: name → vetted module URL served by this host.
// Skills declare deps in execution_dependencies; only names in this map are permitted.
// A skill declaring any name NOT present here is refused before execution.
export const DEPENDENCY_ALLOWLIST = {
  fflate: '/nx2/deps/fflate/dist/index.js',
};

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
neuter(self, 'localStorage');
neuter(self, 'sessionStorage');
neuter(self, 'document');
if (self.navigator) {
  try { Object.defineProperty(self.navigator, 'sendBeacon', { value: undefined, writable: false }); } catch {}
}

self.onmessage = async ({ data }) => {
  const { moduleUrl, entry, input, timeoutMs, dependencies, allowlist } = data;
  const logs = [];
  const host = {
    log: (...args) => { logs.push(args.map(String).join(' ')); },
    deps: {},
  };

  // Load each declared dependency from the host-supplied allowlist URLs.
  // The worker must import them (module objects with functions can't be postMessage'd).
  if (dependencies && dependencies.length) {
    for (const name of dependencies) {
      const depUrl = allowlist && allowlist[name];
      if (!depUrl) {
        self.postMessage({ error: 'dependency "' + name + '" not allowed' });
        return;
      }
      // eslint-disable-next-line no-await-in-loop
      host.deps[name] = await import(depUrl);
    }
  }

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
