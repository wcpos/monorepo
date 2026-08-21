/**
 * Measures TCP connection reuse for the two axios configurations used by
 * apps/electron/src/main/axios.ts:
 *  (a) production path: axios.request with NO agent -> Node globalAgent
 *  (b) dev path: custom Agent({ family: 4 }) (mirrors the dev httpsAgent
 *      minus TLS options -- keepAlive is not set there either)
 * Node here: see process.version (Electron 41.10.5 bundles Node 24.18.0).
 * Uses plain HTTP; Agent keep-alive mechanics are identical for http/https.
 */
const http = require('http');
const axios = require('/Users/kilbot/Projects/monorepo-v2/node_modules/axios');

async function run() {
	const server = http.createServer((req, res) => {
		res.writeHead(200, { 'content-type': 'application/json' });
		res.end('{"ok":true}');
	});
	// generous server-side keep-alive so we measure the CLIENT's behavior
	server.keepAliveTimeout = 30000;
	let connections = 0;
	server.on('connection', () => connections++);
	await new Promise((r) => server.listen(0, '127.0.0.1', r));
	const url = `http://127.0.0.1:${server.address().port}/`;

	async function scenario(name, config, requests, gapMs) {
		connections = 0;
		for (let i = 0; i < requests; i++) {
			await axios.request({ url, ...config });
			if (gapMs && i < requests - 1) await new Promise((r) => setTimeout(r, gapMs));
		}
		console.log(
			`${name}: ${requests} sequential requests${gapMs ? ` (${gapMs}ms apart)` : ''} -> ${connections} TCP connections`
		);
	}

	// (a) prod path: no agent -> globalAgent
	await scenario('prod (globalAgent)          ', {}, 5, 0);
	// tick-cadence spacing: does the socket survive a 6s idle gap?
	await scenario('prod (globalAgent, 6s gaps) ', {}, 3, 6000);
	// (b) dev path replica: custom agent, keepAlive unset
	const devAgent = new http.Agent({ family: 4 });
	await scenario('dev  (custom Agent no KA)   ', { httpAgent: devAgent }, 5, 0);
	// (c) what keepAlive:true on the custom agent would do
	const kaAgent = new http.Agent({ family: 4, keepAlive: true });
	await scenario('dev+ (custom Agent KA:true) ', { httpAgent: kaAgent }, 5, 0);

	console.log(`node ${process.version}, axios ${axios.VERSION}`);
	devAgent.destroy();
	kaAgent.destroy();
	server.close();
}
run().catch((e) => {
	console.error(e);
	process.exit(1);
});
