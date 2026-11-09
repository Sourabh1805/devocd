import { query } from './pool.js';

/** One customer of a tenant, or null when there is none. */
export async function getCustomer(tenantId, id) {
  const { rows } = await query('SELECT id, name FROM customers WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
  return rows[0] ?? null;
}
