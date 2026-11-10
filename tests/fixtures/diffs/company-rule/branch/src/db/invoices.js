import { query } from './pool.js';

/** One invoice by its id, or null when there is none. */
export async function getInvoice(id) {
  const { rows } = await query('SELECT id, customer_id, total_cents FROM invoices WHERE id = $1', [id]);
  return rows[0] ?? null;
}
