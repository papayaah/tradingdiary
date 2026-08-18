/**
 * cyrb53 — a fast, well-distributed non-cryptographic hash. Deterministic and
 * dependency-free (no Date/Math.random/crypto), so the same input always yields
 * the same id. 53 bits of range makes collisions negligible at journal scale.
 * Used for execution identity and import-file fingerprints.
 */
export function cyrb53(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hash = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return hash.toString(36);
}

/**
 * Stable fingerprint of the set of executions an import produced. Order- and
 * duplicate-independent, so re-importing the same file yields the same checksum
 * even if rows are reordered. Used to recognise overlapping imports.
 */
export function executionSetChecksum(tradeIds: string[]): string {
  const unique = [...new Set(tradeIds)].sort();
  return cyrb53(unique.join(','));
}
