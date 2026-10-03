import { createHash } from 'node:crypto';

// Bump when the captured source projection or calculation policy changes.
export const TAX_SOURCE_FORMAT = 'tax-sources-v2';

/** Stable object-key ordering and lossless centavos; query arrays must be ordered. */
export function sourceFingerprint(value: unknown): string {
  function canonical(input: unknown): unknown {
    if (typeof input === 'bigint') return input.toString();
    if (input instanceof Date) return input.toISOString();
    if (Array.isArray(input)) return input.map(canonical);
    if (input && typeof input === 'object')
      return Object.fromEntries(
        Object.entries(input)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([key, item]) => [key, canonical(item)]),
      );
    return input;
  }
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}
