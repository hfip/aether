#!/usr/bin/env node
/** Minimal static server for `npm run preview`. */
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};
const port = Number(process.env.PORT || 4173);

http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  const target = path.join(root, url === '/' ? 'index.html' : url);
  if (!target.startsWith(root)) { res.writeHead(403).end('forbidden'); return; }
  fs.readFile(target, (error, data) => {
    if (error) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(port, () => console.log(`http://localhost:${port}`));
