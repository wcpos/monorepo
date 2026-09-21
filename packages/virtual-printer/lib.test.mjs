import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import https from 'node:https';
import { once } from 'node:events';

import { createVirtualPrinter } from './lib.mjs';

const withPrinter = async (options, run) => {
	const printer = await createVirtualPrinter(options);
	try {
		return await run(printer);
	} finally {
		await printer.close();
	}
};

const sendRaw = async (port, bytes) => {
	const socket = net.connect(port, '127.0.0.1');
	// A refusing printer resets the connection; the test still wants to see what was recorded,
	// so wait on 'close' directly — events.once() would reject on the reset.
	socket.on('error', () => {});
	await once(socket, 'connect');
	socket.end(Buffer.from(bytes));
	await new Promise((resolve) => socket.on('close', resolve));
};

/** Trust exactly the certificate the scenario serves (a real Epson's is self-signed too). */
const getSecure = (printer, path) =>
	new Promise((resolve, reject) => {
		https
			.get(
				{
					host: '127.0.0.1',
					port: printer.ports.https,
					path,
					ca: printer.tls.cert,
					// The cert names no host: pin its fingerprint instead of skipping verification.
					checkServerIdentity: (_host, peer) =>
						peer.fingerprint256 === printer.tls.fingerprint256
							? undefined
							: new Error('unexpected virtual printer certificate'),
				},
				async (response) => {
				const chunks = [];
				for await (const chunk of response) chunks.push(chunk);
				resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString('utf8') });
			})
			.on('error', reject);
	});

test('library mode picks ephemeral ports and advertises nothing', async () => {
	await withPrinter({}, (printer) => {
		assert.ok(printer.ports.raw > 0);
		assert.ok(printer.ports.http > 0);
		assert.equal(printer.ports.https, null);
	});
});

test('a raw job is captured with an ESC/POS summary', async () => {
	await withPrinter({}, async (printer) => {
		await sendRaw(printer.ports.raw, [0x1b, 0x40, 0x41, 0x1d, 0x56, 0x00]);
		assert.equal(printer.jobs.length, 1);
		assert.equal(printer.jobs[0].held, false);
		assert.match(printer.jobs[0].summary, /init \(ESC @\), cut \(GS V\)/);
		assert.ok(printer.events.some((event) => event.lane === 'raw' && event.event === 'connect'));
	});
});

test('secure printing takes the raw bytes and holds them', async () => {
	await withPrinter({ scenario: 'secure-printing' }, async (printer) => {
		await sendRaw(printer.ports.raw, [0x1b, 0x40]);
		assert.equal(printer.jobs[0].held, true);
	});
});

test('the office printer refuses raw 9100 but accepts IPP', async () => {
	await withPrinter({ scenario: 'office-printer' }, async (printer) => {
		// Nothing listens on 9100 at all: an office printer refuses the connection outright.
		assert.equal(printer.ports.raw, null);
		assert.deepEqual(printer.jobs, [], 'nothing is ever printed');
		const socket = net.connect(printer.ports.ipp, '127.0.0.1');
		await once(socket, 'connect');
		await new Promise((resolve) => setTimeout(resolve, 50));
		socket.destroy();
		assert.ok(printer.events.some((event) => event.lane === 'ipp'));
	});
});

test('HTTP requests are recorded as events', async () => {
	await withPrinter({ scenario: 'star-only' }, async (printer) => {
		const response = await fetch(`http://127.0.0.1:${printer.ports.http}/StarWebPRNT/SendMessage`);
		assert.equal(response.status, 405);
		assert.ok(printer.events.some((event) => event.path === '/StarWebPRNT/SendMessage'));
	});
});

test('the ePOS-Device scenario serves a socket.io banner over TLS', async () => {
	await withPrinter({ scenario: 'epos-device' }, async (printer) => {
		const response = await getSecure(printer, '/cgi-bin/epos/service.cgi');
		assert.equal(response.status, 200);
		assert.equal(response.body, 'Welcome to socket.io.');
	});
});
