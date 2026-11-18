export function invoiceTotal(cents: number[]): number {
  return cents.reduce((total, amount) => total + amount, 0);
}
