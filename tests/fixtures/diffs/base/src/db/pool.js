/**
 * A stand-in for the database pool: query(text, params) resolves to { rows }.
 * @param {string} text
 * @param {unknown[]} [params]
 */
export async function query(text, params = []) {
  void text;
  void params;
  return { rows: [] };
}
