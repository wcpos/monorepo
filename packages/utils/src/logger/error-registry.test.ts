import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import registry from './error-registry.json';

const DOMAINS = ['AUTH', 'SYNC', 'CHECKOUT', 'PAYMENT', 'PRINT', 'PRODUCT', 'LICENSE', 'CLIENT'];
const SEVERITIES = ['info', 'warn', 'error'];
const REQUIRED_FIELDS = [
	'code',
	'symbol',
	'domain',
	'severity',
	'safeAction',
	'retryPolicy',
	'dataSafety',
	'escalation',
	'summary',
	'docsBody',
	'introducedIn',
	'evidence',
	'troubleshooting',
	'logSources',
];
const SEED_SYMBOLS = [
	'APP_START_FAILED',
	'APP_START_SLOW',
	'AUTH_PLUGIN_CONFLICT',
	'AUTH_UNEXPECTED',
	'AUTOPRINT_DID_NOT_START',
	'BARCODE_AMBIGUOUS',
	'BARCODE_CONFIG_UNAVAILABLE',
	'CART_UPDATE_FAILED',
	'CHECKOUT_EMPTY_RESPONSE',
	'CHECKOUT_FAILED_CART_SAFE',
	'CHECKOUT_OUTCOME_UNKNOWN',
	'CHECKOUT_UNEXPECTED',
	'CREDENTIALS_REJECTED',
	'DEMAND_REQUEST_FLOOD',
	'GATEWAY_UNAVAILABLE',
	'INSUFFICIENT_ROLE',
	'LICENSE_NOT_ACTIVE_HERE',
	'LICENSE_UNEXPECTED',
	'LOCAL_DB_CORRUPTED',
	'LOCAL_DB_SETUP_FAILED',
	'LOCAL_DB_UNAVAILABLE',
	'LOCAL_DB_WRITE_FAILED',
	'MULTI_TAB_LIMITED',
	'NATIVE_CRASH',
	'OUT_OF_MEMORY',
	'PAYMENT_OK_STATUS_CHECK_FAILED',
	'PAYMENT_OUTCOME_UNKNOWN',
	'PAYMENT_UNEXPECTED',
	'PRINTER_UNREACHABLE',
	'PRINT_JOB_FAILED',
	'PRINT_UNEXPECTED',
	'PRODUCT_IMAGE_UNAVAILABLE',
	'PRODUCT_SAVE_FAILED',
	'PRODUCT_UNEXPECTED',
	'RECEIPT_DELIVERY_FAILED',
	'RECORD_CONFLICT',
	'RECORD_INVALID_FIELD',
	'RECORD_REJECTED',
	'REQUEST_QUEUE_OVERFLOW',
	'REST_ROUTE_MISSING',
	'SCHEMA_MISMATCH',
	'SEARCH_NO_RESULTS_REASON',
	'SESSION_EXPIRED',
	'SIGNED_IN_AS_WRONG_USER',
	'SKU_DUPLICATE',
	'STOCK_STALE',
	'STORE_RATE_LIMITED',
	'STORE_RESPONSE_MALFORMED',
	'STORE_SERVER_ERROR',
	'STORE_URL_INVALID',
	'SYNC_BEHIND_HEAD',
	'SYNC_PARTIAL',
	'SYNC_TASK_CRASHED',
	'SYNC_UNEXPECTED',
	'SYNC_UNREACHABLE',
	'TERMINAL_PAIRING_INCOMPLETE',
	'TLS_UNTRUSTED',
	'TOTALS_DIVERGED',
	'UNEXPECTED_ERROR',
	'UPDATER_NOT_AUTHORIZED',
	'VARIABLE_PRICE_META_INVALID',
	'VARIATION_ADD_FAILED',
	'VERSION_SKEW_PRO_DISABLED',
	'WOOCOMMERCE_MISSING',
];

const generatorScript = path.resolve(__dirname, '../../../../scripts/generate-error-codes.mjs');
const generatedDirectory = path.join(__dirname, 'generated');
const entryFor = (code: string) => {
	const entry = registry.find((candidate) => candidate.code === code);
	if (!entry?.troubleshooting) throw new Error(`Missing registry entry ${code}`);
	return entry;
};

function runGenerator(outputDirectory: string, registryPath?: string) {
	const args = [generatorScript, '--output-dir', outputDirectory];
	if (registryPath) args.push('--registry', registryPath);
	execFileSync(process.execPath, args);
}

describe('error registry', () => {
	it('contains every evidence-backed seed symbol and nothing else', () => {
		expect(registry.map(({ symbol }) => symbol).sort()).toEqual(SEED_SYMBOLS);
	});

	it('has complete, unique entries whose prefixes match their domains', () => {
		const codes = new Set<string>();
		const symbols = new Set<string>();

		for (const entry of registry) {
			for (const field of REQUIRED_FIELDS) {
				expect(entry[field as keyof typeof entry]).toBeTruthy();
			}
			expect(DOMAINS).toContain(entry.domain);
			expect(SEVERITIES).toContain(entry.severity);
			expect(entry.code).toMatch(new RegExp(`^${entry.domain}\\d{3}$`));
			expect(codes.has(entry.code)).toBe(false);
			expect(symbols.has(entry.symbol)).toBe(false);
			codes.add(entry.code);
			symbols.add(entry.symbol);
		}
	});

	it('regenerates byte-identical checked-in artifacts', () => {
		const outputDirectory = mkdtempSync(path.join(tmpdir(), 'wcpos-error-codes-'));
		try {
			runGenerator(outputDirectory);
			for (const filename of ['error-codes.generated.ts', 'error-catalogue.json']) {
				expect(readFileSync(path.join(outputDirectory, filename), 'utf8')).toBe(
					readFileSync(path.join(generatedDirectory, filename), 'utf8')
				);
			}

			const generatedDocs = readdirSync(path.join(outputDirectory, 'error-docs')).sort();
			const checkedInDocs = readdirSync(path.join(generatedDirectory, 'error-docs')).sort();
			expect(generatedDocs).toEqual(checkedInDocs);
			for (const filename of checkedInDocs) {
				expect(readFileSync(path.join(outputDirectory, 'error-docs', filename), 'utf8')).toBe(
					readFileSync(path.join(generatedDirectory, 'error-docs', filename), 'utf8')
				);
			}
		} finally {
			rmSync(outputDirectory, { recursive: true, force: true });
		}
	});

	it('keeps shared log guidance conditional and safe to reproduce', () => {
		const outputDirectory = mkdtempSync(path.join(tmpdir(), 'wcpos-error-codes-guidance-'));
		try {
			runGenerator(outputDirectory);
			const cartSafe = readFileSync(
				path.join(outputDirectory, 'error-docs', 'CHECKOUT101.mdx'),
				'utf8'
			);
			const beforePosLog = readFileSync(
				path.join(outputDirectory, 'error-docs', 'CLIENT999.mdx'),
				'utf8'
			);
			const outcomeUnknown = readFileSync(
				path.join(outputDirectory, 'error-docs', 'CHECKOUT201.mdx'),
				'utf8'
			);
			expect(cartSafe).toContain('the fields shown depend on where the failure occurred');
			expect(beforePosLog).toContain('When WCPOS can save this error');
			expect(beforePosLog).not.toContain('Every occurrence of this code is recorded');
			expect(beforePosLog).toContain('before the POS is able to write its own log entry');
			expect(outcomeUnknown).toContain('reproduce the action only when those steps say it is safe');
			expect(outcomeUnknown).not.toContain('select the **Network** tab and repeat the action');
		} finally {
			rmSync(outputDirectory, { recursive: true, force: true });
		}
	});

	it('covers non-record local write failures in SYNC101 guidance', () => {
		const guidance = entryFor('SYNC101').troubleshooting.join(' ');
		expect(guidance).toContain('Site and credential writes');
		expect(guidance).toContain('may name only the failed operation and error');
	});

	it('distinguishes queued and pre-queue SYNC999 failures', () => {
		const guidance = entryFor('SYNC999').troubleshooting.join(' ');
		expect(guidance).toContain('already queued, WCPOS retries automatically');
		expect(guidance).toContain('nothing was queued');
		expect(guidance).toContain('save it again');
	});

	it('checks the endpoint before treating SYNC211 as a record error', () => {
		const guidance = entryFor('SYNC211').troubleshooting.join(' ');
		expect(guidance).toContain('settings, authentication or other non-record request');
		expect(guidance).toContain("If it is not a record request, follow the server's message");
	});

	it('covers email and PDF paths in PRINT311 guidance', () => {
		const guidance = entryFor('PRINT311').troubleshooting.join(' ');
		expect(guidance).toContain('an email address or server status identifies email delivery');
		expect(guidance).toContain("device's free storage and download permissions");
	});

	it('keeps PRINT999 guidance specific to the logged operation', () => {
		const guidance = entryFor('PRINT999').troubleshooting.join(' ');
		expect(guidance).toContain('receipt-email queue actions and receipt-template sync');
		expect(guidance).toContain('Reprint from the order screen only for a physical print attempt');
	});

	it('tests both WordPress REST permalink styles in AUTH311 guidance', () => {
		const guidance = entryFor('AUTH311').troubleshooting.join(' ');
		expect(guidance).toContain('/wp-json/');
		expect(guidance).toContain('/index.php?rest_route=/');
		expect(guidance).toContain('Only diagnose a REST block if neither address returns JSON');
	});

	it('does not claim every SYNC151 response was repaired', () => {
		const guidance = entryFor('SYNC151').troubleshooting.join(' ');
		expect(guidance).toContain('Check whether the related request ultimately succeeded');
		expect(guidance).toContain("if it failed, follow that request's error");
	});

	it('documents the passive SYNC411 flood alarm without implying throttling', () => {
		const entry = entryFor('SYNC411');
		const guidance = entry.troubleshooting.join(' ');
		expect(guidance).toContain('Keep working');
		expect(guidance).toContain('does not slow, queue or drop any request');
		expect(guidance).toContain('Copy debug info');
		expect(entry.logSources).toEqual([]);
	});

	it('rejects control characters in registry strings — they break MDX frontmatter', () => {
		const directory = mkdtempSync(path.join(tmpdir(), 'wcpos-error-codes-newline-'));
		const invalidRegistry = path.join(directory, 'registry.json');
		writeFileSync(
			invalidRegistry,
			JSON.stringify([{ ...registry[0], summary: 'line one\nline two' }])
		);

		try {
			expect(() => runGenerator(directory, invalidRegistry)).toThrow();
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	it('rejects an entry whose troubleshooting is missing, empty, or contains control characters', () => {
		const directory = mkdtempSync(path.join(tmpdir(), 'wcpos-error-codes-troubleshooting-'));
		const invalidRegistry = path.join(directory, 'registry.json');

		try {
			for (const troubleshooting of [
				undefined,
				[],
				['ok step', 'line one\nline two'],
				['ok step', '\u0000'],
				['ok step', '\u007f'],
			]) {
				writeFileSync(invalidRegistry, JSON.stringify([{ ...registry[0], troubleshooting }]));
				expect(() => runGenerator(directory, invalidRegistry)).toThrow();
			}
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	it('rejects an entry with an unknown or duplicate logSource', () => {
		const directory = mkdtempSync(path.join(tmpdir(), 'wcpos-error-codes-logsources-'));
		const invalidRegistry = path.join(directory, 'registry.json');

		try {
			for (const logSources of [['sentry'], ['woo-status-logs', 'woo-status-logs']]) {
				writeFileSync(invalidRegistry, JSON.stringify([{ ...registry[0], logSources }]));
				expect(() => runGenerator(directory, invalidRegistry)).toThrow();
			}
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	it('exits non-zero when registry validation fails', () => {
		const directory = mkdtempSync(path.join(tmpdir(), 'wcpos-error-codes-invalid-'));
		const invalidRegistry = path.join(directory, 'registry.json');
		writeFileSync(
			invalidRegistry,
			JSON.stringify([...registry, { ...registry[0], symbol: 'DUPLICATE_CODE' }])
		);

		try {
			expect(() => runGenerator(directory, invalidRegistry)).toThrow();
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});
});
