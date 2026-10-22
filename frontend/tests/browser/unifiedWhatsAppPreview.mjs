// Local synthetic preview. No credentials, backend, provider or real records.
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { harnessBundle, fixture, patient, lead, allPermissions } from '../fixtures/unifiedWhatsAppFixture.mjs';

const entrySource = `import React from 'react'; import {createRoot} from 'react-dom/client';
 import Harness from './tests/fixtures/unifiedWhatsAppHarness.jsx';
 const patient=${JSON.stringify(patient)},lead=${JSON.stringify(lead)},allPermissions=${JSON.stringify(allPermissions)};
 const fixture=${fixture.toString()};
 globalThis.widgetFixture=fixture({showCrm:new URLSearchParams(location.search).get('mode')==='crm'});
 globalThis.fetch=globalThis.widgetFixture.fetch;
 createRoot(document.getElementById('root')).render(<Harness/>);`;
const compiled = await harnessBundle({ browser: true, entrySource });
const assets = new URL('../../dist/assets/', import.meta.url);
const cssName = (await readdir(assets)).find(name => /^index-.*\.css$/.test(name));
const css = await readFile(new URL(cssName, assets), 'utf8');
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
 <title>Synthetic WhatsApp QA</title><style>${css}</style></head><body><div id="root"></div><script>${compiled.outputFiles[0].text}</script></body></html>`;
createServer((request, response) => {
  response.setHeader('Content-Security-Policy', "default-src 'self' data:; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:");
  if (request.url.startsWith('/fonts/')) { response.writeHead(204); response.end(); return; }
  if (request.method !== 'GET') { response.writeHead(405); response.end('Synthetic preview is read-only'); return; }
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.end(html);
}).listen(4179, '127.0.0.1', () => process.stdout.write('Synthetic preview: http://127.0.0.1:4179\n'));
