const config = await (async () => {
  try {
    // NX1
    const { nxJS, getNx } = await import(`${window.location.origin}/scripts/utils.js`);
    const { getConfig } = await import(`${getNx()}${nxJS}`);
    return getConfig();
  } catch {
    // NX2
    const { getConfig } = await import('../scripts/nx.js');
    return getConfig();
  }
})();

export default config;
