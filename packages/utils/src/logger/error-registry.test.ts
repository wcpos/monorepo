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
	'APP_START_FAILED',
	'APP_START_SLOW',
	'AUTH_PLUGIN_CONFLICT',
	'AUTH_UNEXPECTED',
	'AUTOPRINT_DID_NOT_START',
	'BARCODE_CONFIG_UNAVAILABLE',
	'CHECKOUT_EMPTY_RESPONSE',
	'CHECKOUT_FAILED_CART_SAFE',
	'CHECKOUT_OUTCOME_UNKNOWN',
	'CHECKOUT_UNEXPECTED',
	'GATEWAY_UNAVAILABLE',
	'INSUFFICIENT_ROLE',
	'LICENSE_NOT_ACTIVE_HERE',
	'LICENSE_UNEXPECTED',
	'LOCAL_DB_CORRUPTED',
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
	'RECORD_CONFLICT',
	'RECORD_INVALID_FIELD',
	'RECORD_REJECTED',
	'REST_ROUTE_MISSING',
	'SCHEMA_MISMATCH',
	'SEARCH_NO_RESULTS_REASON',
	'SESSION_EXPIRED',
	'SKU_DUPLICATE',
	'STOCK_STALE',
	'STORE_RATE_LIMITED',
	'STORE_SERVER_ERROR',
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
	'VARIATION_ADD_FAILED',
	'VERSION_SKEW_PRO_DISABLED',
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
