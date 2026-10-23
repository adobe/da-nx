const DEPENDENCIES = {
  'da-lit': '/deps/lit/dist/index.js',
  'da-y-wrapper': '/deps/da-y-wrapper/dist/index.js',
  'da-parser': '/deps/da-parser/dist/index.js',
};

function resolveImport(specifier) {
  try {
    return import.meta.resolve(specifier);
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    return undefined;
  }
}

// Resolving an unmapped URL would prevent a later import map from redirecting it.
function resolveLegacyImport(specifier) {
  const mapped = [...document.querySelectorAll('script[type="importmap"]')].some((script) => {
    const { imports = {}, scopes = {} } = JSON.parse(script.textContent);
    const scoped = Object.entries(scopes)
      .filter(([scope]) => import.meta.url.startsWith(new URL(scope, document.baseURI).href))
      .map(([, mappings]) => mappings);
    return [imports, ...scoped].some((mappings) => Object.keys(mappings).some((key) => (
      key === specifier || (key.endsWith('/') && specifier.startsWith(key))
    )));
  });
  return mapped ? resolveImport(specifier) : undefined;
}

export function getDaOrigin() {
  const configured = new URL(window.location.href).searchParams.get('da-origin');
  if (configured) return new URL(configured).origin;
  const wrapper = resolveImport('da-y-wrapper')
    || resolveLegacyImport('https://da.live/deps/da-y-wrapper/dist/index.js');
  return wrapper ? new URL(wrapper).origin : 'https://da.live';
}

export function resolveDependency(specifier) {
  const mapped = resolveImport(specifier);
  if (mapped) return mapped;
  const path = DEPENDENCIES[specifier];
  if (!path) throw new TypeError(`Unknown dependency: ${specifier}`);
  const legacy = `https://da.live${path}`;
  const mappedLegacy = resolveLegacyImport(legacy);
  if (mappedLegacy) return mappedLegacy;
  return new URL(path, getDaOrigin()).href;
}

export function setupDependencies() {
  const imports = Object.fromEntries(Object.entries(DEPENDENCIES).flatMap(([name, path]) => {
    const href = resolveDependency(name);
    return [[name, href], [`https://da.live${path}`, href]];
  }));
  const script = document.createElement('script');
  script.type = 'importmap';
  script.textContent = JSON.stringify({ imports });
  document.head.append(script);
}
