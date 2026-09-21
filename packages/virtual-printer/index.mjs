import process from 'node:process';

import { createVirtualPrinter } from './lib.mjs';
import { getServerConfig } from './server-config.mjs';
import { vendorScenario } from './scenarios.mjs';

/** Unprivileged stand-ins for the real TLS/IPP ports, which need root to bind. */
const CLI_HTTPS_PORT = 8043;
const CLI_IPP_PORT = 6310;
const SHUTDOWN_TIMEOUT_MS = 3000;

const { name, vendor, rawPort, httpPort } = getServerConfig(process.env);
const argv = process.argv.slice(2);
const scenarioIndex = argv.indexOf('--scenario');
const scenarioName = scenarioIndex === -1 ? undefined : argv[scenarioIndex + 1];
const label = scenarioName ?? vendor;

const log = (...args) => console.log('[virtual-printer]', ...args);

// Registered before anything starts or logs: a reader that acts on the first line of output can
// signal us while the top-level await is still running, and an unhandled SIGTERM is a hard kill.
let printer;
const shutdown = async () => {
	log('shutting down…');
	await Promise.race([
		printer?.close() ?? Promise.resolve(),
		new Promise((resolve) => setTimeout(resolve, SHUTDOWN_TIMEOUT_MS).unref()),
	]);
	process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

printer = await createVirtualPrinter({
	scenario: scenarioName ?? vendorScenario(vendor),
	// A scenario names the printer it mimics; VP_NAME only overrides when it was set explicitly.
	name: scenarioName && !process.env.VP_NAME ? undefined : name,
	rawPort,
	httpPort,
	httpsPort: CLI_HTTPS_PORT,
	ippPort: CLI_IPP_PORT,
	host: '0.0.0.0',
	mdns: true,
	log,
});

log(
	printer.ports.raw === null
		? `scenario "${label}" — raw 9100 closed`
		: `scenario "${label}" — raw print listening on tcp://0.0.0.0:${printer.ports.raw}`
);
if (printer.ports.http) {
	log(`${label} HTTP endpoints listening on http://0.0.0.0:${printer.ports.http}`);
}
if (printer.ports.https) {
	log(`${label} HTTPS endpoints listening on https://0.0.0.0:${printer.ports.https} (self-signed)`);
}
if (printer.ports.ipp) log(`IPP listening on tcp://0.0.0.0:${printer.ports.ipp}`);
