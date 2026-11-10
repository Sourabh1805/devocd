import { createServer } from 'node:http';
import { handleTotal } from './invoices/upload.js';

const server = createServer((req, res) => {
  if (req.url === '/health') return res.end('ok');
  if (req.url.startsWith('/invoices/total')) return handleTotal(req, res);
  res.statusCode = 404;
  res.end();
});

server.listen(Number(process.env.PORT ?? 3000));
