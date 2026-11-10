import { createServer } from 'node:http';

const server = createServer((req, res) => {
  if (req.url === '/health') return res.end('ok');
  res.statusCode = 404;
  res.end();
});

server.listen(Number(process.env.PORT ?? 3000));
