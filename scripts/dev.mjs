import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createSponsorServer } from '../sponsor/server.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const runtimeScripts = new Set(['app.js', 'preferences.js', 'i18n.js', 'menu-data.js']);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.gif': 'image/gif', '.txt': 'text/plain; charset=utf-8' };

export function createSiteServer(root = projectRoot) {
  // Reuse the sponsor page's allowlist and response headers without listening on another port.
  const sponsorRequests = createSponsorServer(path.join(root, 'sponsor'));
  return createServer(async (request, response) => {
    const finish = (status, message) => {
      response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(request.method === 'HEAD' ? undefined : message);
    };
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD');
      return finish(405, 'Method not allowed');
    }
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
    catch { return finish(400, 'Invalid URL'); }
    if (pathname === '/sponsor' || pathname.startsWith('/sponsor/')) {
      sponsorRequests.emit('request', request, response);
      return;
    }
    if (pathname === '/') pathname = '/index.html';
    const parts = pathname.slice(1).split('/');
    if (parts.some(part => !part || part.startsWith('.') || part.includes('\\') || part.includes('\0'))) return finish(404, 'Not found');
    const file = parts.join('/');
    const allowed = file === 'index.html' || file === 'styles/main.css' || (parts[0] === 'assets' && parts.length === 2) || (parts[0] === 'scripts' && parts.length === 2 && runtimeScripts.has(parts[1]));
    if (!allowed) return finish(404, 'Not found');
    const absolute = path.resolve(root, ...parts);
    if (!absolute.startsWith(path.resolve(root) + path.sep)) return finish(404, 'Not found');
    try {
      if (!(await stat(absolute)).isFile()) return finish(404, 'Not found');
      const data = await readFile(absolute);
      response.writeHead(200, { 'Content-Type': types[path.extname(absolute)] || 'application/octet-stream', 'Content-Length': data.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      response.end(request.method === 'HEAD' ? undefined : data);
    } catch { finish(404, 'Not found'); }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const portIndex = process.argv.indexOf('--port');
  const port = Number(portIndex < 0 ? process.env.PORT || 4321 : process.argv[portIndex + 1]);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid port');
  const server = createSiteServer();
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log('StarPie preview: http://127.0.0.1:' + server.address().port));
}
