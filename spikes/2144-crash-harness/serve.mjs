import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('./.build/', import.meta.url);
createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost:18998').pathname;
  if (request.method === 'POST' && /^\/results\.[\w-]+\.json$/.test(path)) {
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    await writeFile(new URL('.' + path, import.meta.url), Buffer.concat(chunks));
    console.info('Wrote ' + path.slice(1)); response.writeHead(204); return response.end();
  }
  const name = path === '/' ? 'index.html' : path.slice(1);
  const headers = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' };
  try {
    if (!/^[\w.-]+$/.test(name)) throw new Error('Invalid path');
    const body = await readFile(new URL(name, root));
    response.writeHead(200, { ...headers, 'Content-Type': name.endsWith('.wasm') ? 'application/wasm' : name.endsWith('.json') ? 'application/json' : name.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript' });
    response.end(body);
  } catch { response.writeHead(404, headers); response.end('Not found'); }
}).listen(18998, 'localhost', () => console.info('Open http://localhost:18998/ in real Safari. Results are downloaded, not written by this server.'));
