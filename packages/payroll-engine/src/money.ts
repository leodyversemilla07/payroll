/**
 * Exact centavo-to-peso formatting. All money in this repo is integer
 * centavos (bigint); rendering must never pass through float division,
 * which silently rounds above 2^53 centavos (~PHP 90 trillion).
 */

function splitCentavos(cents: bigint): {
  sign: string;
  pesos: string;
  fraction: string;
} {
  const sign = cents < 0n ? "-" : "";
  const abs = cents < 0n ? -cents : cents;
  return {
    sign,
    pesos: (abs / 100n).toString(),
    fraction: (abs % 100n).toString().padStart(2, "0"),
  };
}

/**
 * Exact "1234.50" decimal string for machine-readable exports (bank CSVs,
 * BIR DAT files). Never grouped: commas would corrupt CSV columns.
 */
export function formatCentavosToPesos(cents: bigint): string {
  const { sign, pesos, fraction } = splitCentavos(cents);
  return `${sign}${pesos}.${fraction}`;
}

/**
 * Exact "1,234.50" string with en-PH thousands grouping for human-readable
 * documents (worksheets, compliance reports). Grouping is applied to the
 * integer part with string operations only.
 */
export function formatCentavosGrouped(cents: bigint): string {
  const { sign, pesos, fraction } = splitCentavos(cents);
  const grouped = pesos.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${grouped}.${fraction}`;
}
