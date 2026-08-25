import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import registry from './error-registry.json';

const DOMAINS = ['AUTH', 'SYNC', 'CHECKOUT', 'PAYMENT', 'PRINT', 'PRODUCT', 'LICENSE', 'CLIENT'];
DOMAINS.push('HOST');
const SEVERITIES = ['info', 'warn', 'error'];
/**
 * Required of every registry entry. Wider than what the generator EMITS: the
 * authored prose (docsBody, evidence, troubleshooting, logSources, escalation,
 * retryPolicy, introducedIn) feeds the hand-authored docs pages in wcpos/docs
 * and stays required here, so a new code cannot land undocumented — it is just
 * no longer bundled into the app.
 */
const REQUIRED_FIELDS = [
	'code',
	'symbol',
	'domain',
	'severity',
	'actionHint',
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
	'AUTH_TOKEN_BLOCKED_BY_HOST',
	'AUTH_TOKEN_TOO_LARGE',
	'AUTH_UNEXPECTED',
	'AUTOPRINT_DID_NOT_START',
	'BARCODE_AMBIGUOUS',
	'BARCODE_CONFIG_UNAVAILABLE',
	'BOT_CHALLENGE_BLOCKING_API',
	'CACHE_SHARED_REPLAY',
	'CART_UPDATE_FAILED',
	'CHECKOUT_EMPTY_RESPONSE',
	'CHECKOUT_FAILED_CART_SAFE',
	'CHECKOUT_OUTCOME_UNKNOWN',
	'CHECKOUT_UNEXPECTED',
	'CORS_MISCONFIGURED',
	'CORS_PREFLIGHT_BLOCKED',
	'CREDENTIALS_REJECTED',
	'DEMAND_REQUEST_FLOOD',
	'GATEWAY_UNAVAILABLE',
	'HOST_RATE_LIMITED',
	'INSUFFICIENT_ROLE',
	'LICENSE_NOT_ACTIVE_HERE',
	'LICENSE_UNEXPECTED',
	'LOCAL_DB_CORRUPTED',
	'LOCAL_DB_SETUP_FAILED',
	'LOCAL_DB_UNAVAILABLE',
	'LOCAL_DB_WRITE_FAILED',
	'LOCAL_RECORD_DIVERGED',
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
	'RESPONSE_HEADERS_REJECTED',
	'REST_ROUTE_MISSING',
	'REST_TRANSPORT_BLOCKED',
	'SCHEMA_MISMATCH',
	'SEARCH_BLOCKED_BY_WAF',
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
	'WCPOS_PLUGIN_OUTDATED',
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

	it('regenerates the byte-identical checked-in catalogue', () => {
		const outputDirectory = mkdtempSync(path.join(tmpdir(), 'wcpos-error-codes-'));
		try {
			runGenerator(outputDirectory);
			const filename = 'error-codes.generated.ts';
			expect(readFileSync(path.join(outputDirectory, filename), 'utf8')).toBe(
				readFileSync(path.join(generatedDirectory, filename), 'utf8')
			);
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

	it('gives status-aware repair guidance for SYNC331 tombstones', () => {
		const entry = entryFor('SYNC331');
		const guidance = entry.troubleshooting.join(' ');
		expect(entry.summary).not.toContain('downloading');
		expect(guidance).toContain('deleted record');
		expect(guidance).toContain('must not be downloaded');
	});

	it('documents the passive SYNC411 flood alarm without implying throttling', () => {
		const entry = entryFor('SYNC411');
		const guidance = entry.troubleshooting.join(' ');
		expect(guidance).toContain('Keep working');
		expect(guidance).toContain('does not slow, queue or drop any request');
		expect(guidance).toContain('Copy debug info');
		expect(entry.logSources).toEqual([]);
	});

	// Every registry string is emitted into a TypeScript string literal, and the
	// summaries and action hints into the JSON translation catalogue too — a raw
	// newline or NUL there is a syntax error, not a formatting nuisance. (The
	// original reason, MDX frontmatter, went away with the generated docs pages.)
	it('rejects control characters in registry strings — they break the generated literals', () => {
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
