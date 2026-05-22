import net from 'node:net';
import http from 'node:http';
import process from 'node:process';

import { Bonjour } from 'bonjour-service';

import { routeHttpRequest } from './http-router.mjs';
import { buildMdnsServices } from './mdns-services.mjs';
import { summarizeEscPos } from './escpos-summary.mjs';

const NAME = process.env.VP_NAME ?? 'Virtual WCPOS Printer';
const RAW_PORT = Number(process.env.VP_RAW_PORT ?? 9100);
const HTTP_PORT = Number(process.env.VP_HTTP_PORT ?? 8008);

const log = (...args) => console.log(`[virtual-printer]`, ...args);

// 1. mDNS advertise (Electron discovery finds this)
const bonjour = new Bonjour();
const published = buildMdnsServices({ name: NAME, port: RAW_PORT }).map((service) => {
  log(`advertising _${service.type}._tcp "${service.name}" on :${service.port}`);
  return bonjour.publish(service);
});

// 2. Raw TCP:9100 server (Electron + native raw print land here)
const rawServer = net.createServer((socket) => {
  const chunks = [];
  socket.on('data', (chunk) => chunks.push(chunk));
  socket.on('end', () => {
    log(`TCP:${RAW_PORT} received`, summarizeEscPos(Buffer.concat(chunks)));
    socket.end();
  });
  socket.on('error', (err) => log(`TCP socket error: ${err.message}`));
});
rawServer.listen(RAW_PORT, () => log(`raw print listening on tcp://0.0.0.0:${RAW_PORT}`));

// 3. HTTP server for the Epson/Star endpoints (web sweep + web print)
const httpServer = http.createServer((req, res) => {
  const { status, body } = routeHttpRequest(req.method ?? 'GET', req.url ?? '/');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'POST') {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      log(`HTTP POST ${req.url} — print job (${Buffer.concat(chunks).length} bytes)`);
      res.writeHead(status, { 'Content-Type': 'text/xml' });
      res.end(body);
    });
    return;
  }
  log(`HTTP ${req.method} ${req.url} -> ${status}`);
  res.writeHead(status, { 'Content-Type': 'text/plain' });
  res.end(body);
});
httpServer.listen(HTTP_PORT, () => log(`HTTP endpoints listening on http://0.0.0.0:${HTTP_PORT}`));

// Graceful shutdown so mDNS de-registers
const shutdown = () => {
  log('shutting down…');
  for (const service of published) service.stop?.();
  bonjour.unpublishAll(() => bonjour.destroy());
  rawServer.close();
  httpServer.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
