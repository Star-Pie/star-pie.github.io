import { createServer } from 'node:http';
import { readFile, lstat, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const directory = fileURLToPath(new URL('./', import.meta.url));
const publicFiles = new Set(['index.html', 'styles.css', 'preferences.js', 'app.js', 'logo.webp', 'data.json', 'sponsors-light.svg', 'sponsors-dark.svg']);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };

export function createSponsorServer(root = directory) {
  return createServer(async (request, response) => {
    const finish = (status, message) => {
      response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(request.method === 'HEAD' ? undefined : message);
    };
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.setHeader('Allow', 'GET, HEAD');
      return finish(405, 'Method not allowed');
    }
    let pathname;
    try { pathname = decodeURIComponent(request.url.split(/[?#]/, 1)[0]); }
    catch { return finish(400, 'Invalid URL'); }
    if (pathname === '/' || pathname === '/sponsor') {
      response.writeHead(308, { Location: '/sponsor/', 'Cache-Control': 'no-store' });
      return response.end();
    }
    if (pathname === '/sponsor/') pathname += 'index.html';
    if (!pathname.startsWith('/sponsor/')) return finish(404, 'Not found');
    const relative = pathname.slice('/sponsor/'.length);
    if (!publicFiles.has(relative) && !/^avatars\/[a-z0-9][a-z0-9_-]*\.(png|jpe?g|webp)$/i.test(relative)) return finish(404, 'Not found');
    const absolute = path.resolve(root, ...relative.split('/'));
    try {
      const resolvedRoot = await realpath(root);
      const resolvedFile = await realpath(absolute);
      const inside = path.relative(resolvedRoot, resolvedFile);
      if (path.isAbsolute(inside) || inside.startsWith('..')) return finish(404, 'Not found');
      const info = await lstat(absolute);
      if (!info.isFile() || info.isSymbolicLink()) return finish(404, 'Not found');
      if (relative.startsWith('avatars/') && (await lstat(path.join(root, 'avatars'))).isSymbolicLink()) return finish(404, 'Not found');
      const bytes = await readFile(absolute);
      response.writeHead(200, {
        'Content-Type': types[path.extname(absolute).toLowerCase()] || 'application/octet-stream',
        'Content-Length': bytes.length,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'"
      });
      response.end(request.method === 'HEAD' ? undefined : bytes);
    } catch { finish(404, 'Not found'); }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--port' || !/^\d+$/.test(args[1]))) throw new Error('Usage: node sponsor/server.mjs [--port 4337]');
  const port = args.length ? Number(args[1]) : 4337;
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid port');
  const server = createSponsorServer();
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`Sponsor preview: http://127.0.0.1:${server.address().port}/sponsor/`));
}
