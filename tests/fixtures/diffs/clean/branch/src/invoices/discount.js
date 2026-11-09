/** The largest total accepted, in cents. Keeps totalCents * percent well inside Number.MAX_SAFE_INTEGER. */
export const MAX_TOTAL_CENTS = 1_000_000_000_000;

/**
 * Take a whole-percent discount off a total in cents.
 * The discount is rounded down to a whole cent, so the customer never gets more off than the stated percentage.
 * @param {number} totalCents an integer from 0 to MAX_TOTAL_CENTS
 * @param {number} percent an integer from 0 to 100
 * @returns {number} the discounted total in cents
 */
export function applyDiscount(totalCents, percent) {
  if (!Number.isInteger(totalCents) || totalCents < 0 || totalCents > MAX_TOTAL_CENTS) {
    throw new RangeError(`totalCents must be an integer from 0 to ${MAX_TOTAL_CENTS}`);
  }
  if (!Number.isInteger(percent) || percent < 0 || percent > 100) throw new RangeError('percent must be an integer from 0 to 100');
  const discount = Math.floor((totalCents * percent) / 100);
  return totalCents - discount;
}
