// The virtual printer as a library: start a scenario in-process, drive the real app code at it,
// then read back what it actually asked for (`events`) and what it sent (`jobs`).
/**
 * @typedef {'raw' | 'http' | 'https' | 'ipp'} Lane
 * @typedef {{ lane: Lane, bytes?: Buffer, summary?: string, path?: string, xml?: string,
 *   status?: number, held: boolean, at: number }} PrinterJob what the printer was asked to print
 * @typedef {{ lane: Lane, event?: string, method?: string, url?: string, path?: string,
 *   at: number }} PrinterEvent every request the app made, including ones that printed nothing
 */
import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';
import net from 'node:net';
import { once } from 'node:events';

import { routeHttpRequest } from './http-router.mjs';
import { buildMdnsServices } from './mdns-services.mjs';
import { getScenario } from './scenarios.mjs';
import { generateSelfSignedCert } from './self-signed-cert.mjs';
import { summarizeEscPos } from './escpos-summary.mjs';

/** RSA keygen is slow and the cert never varies between scenarios, so make it once per process. */
let cachedCert;
const tlsCert = () => (cachedCert ??= generateSelfSignedCert());

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const CORS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
	'Access-Control-Allow-Headers': '*',
	'Access-Control-Allow-Private-Network': 'true',
};

const listen = async (server, port, host) => {
	server.listen(port, host);
	await once(server, 'listening');
	return server.address().port;
};

/**
 * Start a virtual printer.
 *
 * @param {object} [options]
 * @param {string | import('./scenarios.mjs').Scenario} [options.scenario] scenario name or object
 * @param {string} [options.name] advertised name; defaults to the scenario's own
 * @param {number} [options.rawPort] 0 (the default) picks an ephemeral port so tests can run in parallel
 * @param {number} [options.httpPort]
 * @param {number} [options.httpsPort]
 * @param {number} [options.ippPort]
 * @param {string} [options.host] interface to bind; loopback by default
 * @param {boolean} [options.mdns] advertise over mDNS — off in library mode
 * @param {(...args: unknown[]) => void} [options.log]
 * @returns {Promise<{ scenario: import('./scenarios.mjs').Scenario, name: string,
 *   ports: { raw: number, http: number | null, https: number | null, ipp: number | null },
 *   jobs: PrinterJob[], events: PrinterEvent[], close: () => Promise<void> }>}
 */
export async function createVirtualPrinter(options = {}) {
	const {
		scenario = 'default',
		rawPort = 0,
		httpPort = 0,
		httpsPort = 0,
		ippPort = 0,
		host = '127.0.0.1',
		mdns = false,
		log = () => {},
	} = options;
	const spec = getScenario(scenario);
	const name = options.name ?? spec.mdns?.name ?? 'Virtual WCPOS Printer';
	/** @type {PrinterJob[]} */
	const jobs = [];
	/** @type {PrinterEvent[]} */
	const events = [];
	const record = (event) => events.push({ ...event, at: Date.now() });
	const servers = [];

	// Raw 9100. `hold` is the Secure Printing behaviour: the bytes are taken and quietly binned.
	const rawServer = net.createServer((socket) => {
		record({ lane: 'raw', event: 'connect' });
		socket.on('error', () => {});
		if (spec.raw === 'closed') return socket.destroy();
		const chunks = [];
		socket.on('data', (chunk) => chunks.push(chunk));
		socket.on('close', () => {
			const bytes = Buffer.concat(chunks);
			if (!bytes.length) return;
			const summary = summarizeEscPos(bytes);
			log(`raw received ${summary}${spec.raw === 'hold' ? ' — held, not printed' : ''}`);
			jobs.push({ lane: 'raw', bytes, summary, held: spec.raw === 'hold', at: Date.now() });
		});
	});
	servers.push(rawServer);
	const ports = {
		raw: await listen(rawServer, rawPort, host),
		http: null,
		https: null,
		ipp: null,
	};

	const handler = (lane, config) => async (req, res) => {
		const chunks = [];
		for await (const chunk of req) chunks.push(chunk);
		const body = Buffer.concat(chunks).toString('utf8');
		const path = (req.url ?? '/').split('?')[0];
		record({ lane, method: req.method, url: req.url, path });
		if (spec.delayMs) await sleep(spec.delayMs);
		const result = routeHttpRequest(req.method ?? 'GET', req.url ?? '/', config, body);
		if (req.method === 'POST' && body) {
			jobs.push({
				lane,
				path,
				xml: body,
				status: result.status,
				held: result.status === 503,
				at: Date.now(),
			});
		}
		log(`${lane.toUpperCase()} ${req.method} ${req.url} -> ${result.status}`);
		res.writeHead(result.status, { ...CORS, 'Content-Type': result.contentType ?? 'text/plain' });
		res.end(result.body);
	};

	if (spec.http) {
		const server = http.createServer(handler('http', spec.http));
		servers.push(server);
		ports.http = await listen(server, httpPort, host);
	}
	if (spec.https) {
		const server = https.createServer(tlsCert(), handler('https', spec.https));
		servers.push(server);
		ports.https = await listen(server, httpsPort, host);
	}
	if (spec.ipp) {
		// IPP is only ever port-scanned by the app, so accepting the connection is the whole job.
		const server = net.createServer((socket) => {
			record({ lane: 'ipp', event: 'connect' });
			socket.on('error', () => {});
			socket.resume();
		});
		servers.push(server);
		ports.ipp = await listen(server, ippPort, host);
	}

	let bonjour;
	if (mdns) {
		const { Bonjour } = (await import('bonjour-service')).default;
		bonjour = new Bonjour();
		for (const service of buildMdnsServices({ ...spec.mdns, name, port: ports.raw })) {
			log(`advertising _${service.type}._tcp "${service.name}" on :${service.port}`);
			bonjour.publish(service);
		}
	}

	const close = async () => {
		if (bonjour) {
			await new Promise((resolve) => bonjour.unpublishAll(resolve));
			await new Promise((resolve) => bonjour.destroy(resolve));
		}
		await Promise.all(
			servers.map(async (server) => {
				server.closeAllConnections?.();
				server.close();
				await once(server, 'close');
			})
		);
	};

	// The self-signed certificate the HTTPS scenario serves, as PEM plus its SHA-256 fingerprint, so
	// a caller can pin exactly this one (the cert names no host) instead of disabling verification.
	const { cert } = tlsCert();
	const fingerprint256 = new crypto.X509Certificate(cert).fingerprint256;
	return { scenario: spec, name, ports, jobs, events, tls: { cert, fingerprint256 }, close };
}
