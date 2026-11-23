// Only static assets are served. Any real /api request is counted and rejected.
// No production server, database, credentials or inventory is opened here.
import {createServer} from 'node:http';
import {readFileSync, statSync} from 'node:fs';
import {dirname, extname, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../dist-demo');
const unexpectedApi = [];
const types = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg'};

createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path === '/__qa/network') {
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({unexpectedApi}));
  }
  if (path.startsWith('/api/')) {
    unexpectedApi.push({method: req.method, path});
    res.writeHead(404, {'Content-Type': 'application/json'});
    return res.end(JSON.stringify({error: 'This fixture has no API backend'}));
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405); return res.end();
  }
  try {
    const file = resolve(root, '.' + decodeURIComponent(path === '/' ? '/index.html' : path));
    if (!file.startsWith(root + sep) || !statSync(file).isFile()) throw Error('Not found');
    res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
    res.end(req.method === 'HEAD' ? undefined : readFileSync(file));
  } catch {
    res.writeHead(404); res.end('Not found');
  }
}).listen(19440, '127.0.0.1', () => console.log('Demo static fixture ready on 19440'));
