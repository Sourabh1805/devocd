/**
 * Total of an invoice in cents.
 * @param {{ amountCents: number, quantity: number }[]} lines
 * @returns {number}
 */
export function invoiceTotal(lines) {
  if (!Array.isArray(lines)) throw new TypeError('lines must be an array');
  return lines.reduce((n, l) => n + l.amountCents * l.quantity, 0);
}
