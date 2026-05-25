import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

export function startServer({ port, root }) {
  const rootAbs = path.resolve(root);
  const server = http.createServer(async (req, res) => {
    try {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      let filePath = path.resolve(rootAbs, '.' + urlPath);
      if (filePath !== rootAbs && !filePath.startsWith(rootAbs + path.sep)) {
        res.writeHead(403, { 'content-type': 'text/plain' });
        res.end('Forbidden');
        return;
      }
      let stat;
      try { stat = await fs.stat(filePath); } catch { stat = null; }
      if (stat && stat.isDirectory()) filePath = path.join(filePath, 'index.html');
      const data = await fs.readFile(filePath);
      const mime = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, { 'content-type': mime });
      res.end(data);
    } catch (err) {
      const code = err && err.code === 'ENOENT' ? 404 : 500;
      res.writeHead(code, { 'content-type': 'text/plain' });
      res.end(code === 404 ? 'Not Found' : 'Server Error');
    }
  });
  return new Promise((resolve) => {
    server.listen(port, () => {
      const actualPort = server.address().port;
      resolve({ server, port: actualPort, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const parsed = parseInt(process.env.PORT, 10);
  const port = Number.isFinite(parsed) && parsed > 0 ? parsed : 8080;
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  startServer({ port, root }).then(({ port: p }) => {
    console.log(`Serving on http://localhost:${p}/`);
  });
}
