/** Storage settings. Credentials come from the environment, never from code. */
export const storage = {
  bucket: process.env.INVOICE_BUCKET ?? 'acme-example-invoices',
  region: process.env.AWS_REGION ?? 'eu-west-1',
};
