// Local synthetic preview; uses the installed build tool and production CSS.
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const bundle = await build({
  entryPoints: [fileURLToPath(new URL('../fixtures/doctorMonthlyHarness.jsx', import.meta.url))],
  bundle: true, write: false, platform: 'browser', format: 'iife',
  loader: { '.js': 'jsx' }, define: { 'import.meta.env': '{"VITE_BACKEND_URL":""}' }
});
const assets = new URL('../../dist/assets/', import.meta.url);
const cssName = (await readdir(assets)).find(name => /^index-.*\.css$/.test(name));
const css = await readFile(new URL(cssName, assets), 'utf8');
const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Monthly salary synthetic QA</title><style>${css}</style></head><body><div id="root"></div><script>${bundle.outputFiles[0].text}</script></body></html>`;
createServer((request, response) => {
  response.setHeader('Content-Security-Policy', "default-src 'self' data:; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:");
  if (request.url.startsWith('/fonts/')) { response.writeHead(204); response.end(); return; }
  if (request.method !== 'GET') { response.writeHead(405); response.end(); return; }
  response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(html);
}).listen(4186, '127.0.0.1', () => process.stdout.write('Synthetic monthly QA: http://127.0.0.1:4186\n'));
