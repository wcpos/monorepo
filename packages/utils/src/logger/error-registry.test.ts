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
