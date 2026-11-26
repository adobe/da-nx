import { AO_HTTP_BASE, AO_WS_BASE } from './constants.js';

export function resolveAoLocation(projectedProductContext) {
  const found = projectedProductContext?.find(({ prodCtx } = {}) => prodCtx?.statusCode === 'ACTIVE'
    && (prodCtx?.serviceCode === 'acp' || prodCtx?.serviceCode === 'dma_tartan'));
  try {
    const { region, environment } = JSON.parse(found?.prodCtx?.fulfillable_data ?? 'null') ?? {};
    if (!region || !environment) return null;
    return { region: region.toLowerCase(), environment: environment.toLowerCase() };
  } catch {
    return null;
  }
}

export function resolveAoHttpBase(projectedProductContext) {
  const loc = resolveAoLocation(projectedProductContext);
  return loc ? `https://agent-orchestrator-${loc.environment}-${loc.region}.adobe.io` : AO_HTTP_BASE;
}

export function resolveAoWsBase(projectedProductContext) {
  const loc = resolveAoLocation(projectedProductContext);
  return loc ? `wss://agent-orchestrator-${loc.environment}-${loc.region}.adobe.io` : AO_WS_BASE;
}
