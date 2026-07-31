import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
];
const SEED_SYMBOLS = [
	'LOCAL_DB_WRITE_FAILED',
	'LOCAL_DB_CORRUPTED',
	'SYNC_UNREACHABLE',
	'RECORD_REJECTED',
	'RECORD_INVALID_FIELD',
	'SYNC_BEHIND_HEAD',
	'SCHEMA_MISMATCH',
	'SYNC_PARTIAL',
	'SESSION_EXPIRED',
	'INSUFFICIENT_ROLE',
	'AUTH_PLUGIN_CONFLICT',
	'REST_ROUTE_MISSING',
	'TLS_UNTRUSTED',
	'CHECKOUT_FAILED_CART_SAFE',
	'CHECKOUT_OUTCOME_UNKNOWN',
	'CHECKOUT_EMPTY_RESPONSE',
	'SKU_DUPLICATE',
	'PAYMENT_OK_STATUS_CHECK_FAILED',
	'PAYMENT_OUTCOME_UNKNOWN',
	'GATEWAY_UNAVAILABLE',
	'TERMINAL_PAIRING_INCOMPLETE',
	'AUTOPRINT_DID_NOT_START',
	'PRINT_JOB_FAILED',
	'PRINTER_UNREACHABLE',
	'PRODUCT_SAVE_FAILED',
	'VARIATION_ADD_FAILED',
	'PRODUCT_IMAGE_UNAVAILABLE',
	'SEARCH_NO_RESULTS_REASON',
	'STOCK_STALE',
	'STORE_RATE_LIMITED',
	'STORE_SERVER_ERROR',
	'LICENSE_NOT_ACTIVE_HERE',
	'VERSION_SKEW_PRO_DISABLED',
	'UPDATER_NOT_AUTHORIZED',
	'APP_START_FAILED',
	'OUT_OF_MEMORY',
	'NATIVE_CRASH',
	'UNEXPECTED_ERROR',
].sort();

const repoRoot = path.resolve(__dirname, '../../../..');
const generator = path.join(repoRoot, 'scripts/generate-error-codes.mjs');
const generatedDirectory = path.join(__dirname, 'generated');

function runGenerator(outputDirectory: string, registryPath?: string): void {
	const args = [generator, '--output-dir', outputDirectory];
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
		} finally {
			rmSync(outputDirectory, { recursive: true, force: true });
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
