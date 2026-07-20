/** Canonical local note attachment href scheme. */

export const NORDLY_ASSET_SCHEME = 'nordly-asset:';

export function parseNordlyAssetId(href: string): string | null {
  const trimmed = href.trim();
  if (!trimmed.startsWith(NORDLY_ASSET_SCHEME)) return null;
  const id = trimmed.slice(NORDLY_ASSET_SCHEME.length).trim();
  return id || null;
}

export function nordlyAssetHref(id: string): string {
  return `${NORDLY_ASSET_SCHEME}${id}`;
}
