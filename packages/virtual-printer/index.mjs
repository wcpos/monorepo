import net from 'node:net';
import http from 'node:http';
import process from 'node:process';

import bonjourService from 'bonjour-service';

import { getServerConfig } from './server-config.mjs';
import { routeHttpRequest } from './http-router.mjs';
import { buildMdnsServices } from './mdns-services.mjs';
import { summarizeEscPos } from './escpos-summary.mjs';

const {
  name: NAME,
  vendor: VENDOR,
  rawPort: RAW_PORT,
  httpPort: HTTP_PORT,
} = getServerConfig(process.env);
const SHUTDOWN_TIMEOUT_MS = 3000;

const log = (...args) => console.log(`[virtual-printer]`, ...args);
const logCleanupError = (label, err) => {
  if (err) log(`${label} cleanup error: ${err instanceof Error ? err.message : String(err)}`);
};

// 1. mDNS advertise (Electron discovery finds this)
const { Bonjour } = bonjourService;
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
  const { status, body } = routeHttpRequest(req.method ?? 'GET', req.url ?? '/', VENDOR);
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
httpServer.listen(HTTP_PORT, () =>
  log(`${VENDOR} HTTP endpoints listening on http://0.0.0.0:${HTTP_PORT}`)
);

// Graceful shutdown so mDNS de-registers
const waitForCallback = (label, start) =>
  new Promise((resolve) => {
    start((err) => {
      logCleanupError(label, err);
      resolve();
    });
  });

const stopPublishedServices = async () => {
  await Promise.allSettled(
    published.map((service) =>
      typeof service.stop === 'function'
        ? waitForCallback('mDNS service', (done) => service.stop(done))
        : Promise.resolve()
    )
  );
  await waitForCallback('mDNS destroy', (done) => bonjour.destroy(done));
};

const shutdownTimeout = () =>
  new Promise((resolve) => {
    const timeout = setTimeout(() => {
      log(`shutdown timed out after ${SHUTDOWN_TIMEOUT_MS}ms`);
      resolve();
    }, SHUTDOWN_TIMEOUT_MS);
    timeout.unref();
  });

const shutdown = async () => {
  log('shutting down…');
  const cleanup = Promise.allSettled([
    stopPublishedServices(),
    waitForCallback('raw server', (done) => rawServer.close(done)),
    waitForCallback('HTTP server', (done) => httpServer.close(done)),
  ]);
  await Promise.race([cleanup, shutdownTimeout()]);
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
