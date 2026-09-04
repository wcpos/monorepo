import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BANNER = '// GENERATED — do not edit by hand; run pnpm generate:error-codes';
const DOMAINS = [
	'AUTH',
	'SYNC',
	'CHECKOUT',
	'PAYMENT',
	'PRINT',
	'PRODUCT',
	'LICENSE',
	'CLIENT',
	'HOST',
	'DISPLAY',
];
const SEVERITIES = ['info', 'warn', 'error'];
const RETRY_POLICIES = ['automatic', 'manual', 'after-change', 'never'];
const DATA_SAFETY = [
	'no-impact',
	'local-only',
	'order-safe',
	'money-moved',
	'outcome-unknown',
	'data-at-risk',
];
const ESCALATIONS = [
	'none',
	'store-admin',
	'site-admin',
	'support-with-export',
	'payment-provider',
];
const LOG_SOURCES = [
	'network-inspector',
	'browser-console',
	'wp-admin-pos-logs',
	'woo-status-logs',
	'host-error-log',
	'payment-provider',
];
/**
 * Emitted into `error-codes.generated.ts` and therefore into the shipped
 * bundle. Only fields something actually READS belong here: `dataSafety` drives
 * the risk sentence in the logs row detail, the rest identify and classify the
 * code. The registry's authored prose (`docsBody`, `troubleshooting`,
 * `evidence`, `logSources`, `escalation`, `retryPolicy`, `introducedIn`) is
 * source material for the hand-authored docs pages in wcpos/docs — it stays in
 * `error-registry.json`, where it costs nothing, and no longer rides into the
 * app as a type nothing implements and strings nothing renders.
 */
const EMITTED_FIELDS = {
	code: 'ErrorCode',
	symbol: 'string',
	domain: 'ErrorDomain',
	severity: 'ErrorSeverity',
	actionHint: 'string',
	dataSafety: 'DataSafety',
	summary: 'string',
};
/**
 * Every field an entry must carry as a non-empty string. A superset of
 * EMITTED_FIELDS: the authored prose is still required of the registry even
 * though it is no longer emitted, so a new code cannot land undocumented.
 */
const REQUIRED_STRING_FIELDS = [
	...Object.keys(EMITTED_FIELDS),
	'retryPolicy',
	'escalation',
	'docsBody',
	'introducedIn',
	'evidence',
];
const VOCABULARIES = {
	domain: DOMAINS,
	severity: SEVERITIES,
	retryPolicy: RETRY_POLICIES,
	dataSafety: DATA_SAFETY,
	escalation: ESCALATIONS,
};
const SUMMARY_KEY_PREFIX = 'health.logs.error_summary.';
const ACTION_KEY_PREFIX = 'health.logs.error_action.';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** `SYNC101` → `health.logs.error_summary.SYNC101`. */
export function summaryKey(code) {
	return `${SUMMARY_KEY_PREFIX}${code}`;
}

/** `SYNC101` → `health.logs.error_action.SYNC101`. */
export function actionKey(code) {
	return `${ACTION_KEY_PREFIX}${code}`;
}

function validateRegistry(registry) {
	if (!Array.isArray(registry)) throw new Error('Registry must be a JSON array');
	const codes = new Set();
	const symbols = new Set();
	for (const [index, entry] of registry.entries()) {
		if (!entry || typeof entry !== 'object') throw new Error(`Entry ${index} must be an object`);
		for (const field of REQUIRED_STRING_FIELDS) {
			if (typeof entry[field] !== 'string' || !entry[field].trim()) {
				throw new Error(`Entry ${index} is missing required field ${field}`);
			}
		}
		for (const [field, allowed] of Object.entries(VOCABULARIES)) {
			if (!allowed.includes(entry[field])) {
				throw new Error(`Entry ${entry.code} has unknown ${field}: ${entry[field]}`);
			}
		}
		if (!new RegExp(`^${entry.domain}\\d{3}$`).test(entry.code)) {
			throw new Error(`Code ${entry.code} does not match domain ${entry.domain}`);
		}
		if (
			!Array.isArray(entry.troubleshooting) ||
			entry.troubleshooting.length === 0 ||
			entry.troubleshooting.some((step) => typeof step !== 'string' || !step.trim())
		) {
			throw new Error(
				`Entry ${entry.code ?? index} needs troubleshooting: a non-empty array of non-empty strings`
			);
		}
		if (!Array.isArray(entry.logSources)) {
			throw new Error(`Entry ${entry.code ?? index} needs logSources: an array (may be empty)`);
		}
		for (const source of entry.logSources) {
			if (!LOG_SOURCES.includes(source)) {
				throw new Error(`Entry ${entry.code} has unknown logSource: ${source}`);
			}
		}
		if (new Set(entry.logSources).size !== entry.logSources.length) {
			throw new Error(`Entry ${entry.code} has duplicate logSources`);
		}
		// Control characters are rejected because every registry string is emitted
		// into a TypeScript string literal (and, for summaries and action hints,
		// into the JSON translation catalogue). A raw newline or NUL there is a
		// syntax error or an invisible corruption, not a formatting nuisance.
		for (const [field, value] of Object.entries(entry)) {
			const strings = typeof value === 'string' ? [value] : Array.isArray(value) ? value : [];
			for (const item of strings) {
				if (typeof item === 'string' && /[\u0000-\u001F\u007F]/.test(item)) {
					throw new Error(
						`Entry ${entry.code ?? index} field ${field} contains control characters`
					);
				}
			}
		}
		if (codes.has(entry.code)) throw new Error(`Duplicate code: ${entry.code}`);
		if (symbols.has(entry.symbol)) throw new Error(`Duplicate symbol: ${entry.symbol}`);
		codes.add(entry.code);
		symbols.add(entry.symbol);
	}
}

// Match Prettier's quote choice so generated output is lint-clean by construction:
// it prefers single quotes, but switches to double when the string contains one
// (an apostrophe in a summary would otherwise fail prettier/prettier every time).
const quote = (value) => {
	const escaped = value.replaceAll('\\', '\\\\');
	return escaped.includes("'") ? `"${escaped.replaceAll('"', '\\"')}"` : `'${escaped}'`;
};
const union = (name, values) => {
	const joined = values.map(quote).join(' | ');
	const inline = `export type ${name} = ${joined};`;
	if (inline.length <= 100) return inline;
	// Prettier >= 3.9 wraps the whole union onto one indented continuation line
	// when it fits within printWidth (leading tab counted as tabWidth = 2).
	if (joined.length + 3 <= 100) return `export type ${name} =\n\t${joined};`;
	return `export type ${name} =\n${values.map((value) => `\t| ${quote(value)}`).join('\n')};`;
};

function renderTypescript(registry) {
	const fields = Object.entries(EMITTED_FIELDS);
	const renderField = (entry, field) => {
		const line = `\t\t${field}: ${quote(entry[field])},`;
		return line.length <= 97 ? line : `\t\t${field}:\n\t\t\t${quote(entry[field])},`;
	};
	const catalogue = registry
		.map(
			(entry) =>
				`\t${entry.code}: {\n${fields.map(([field]) => renderField(entry, field)).join('\n')}\n\t},`
		)
		.join('\n');
	const symbols = registry.map((entry) => `\t${entry.symbol}: ${quote(entry.code)},`).join('\n');
	return `${BANNER}

${union(
	'ErrorCode',
	registry.map(({ code }) => code)
)}
${union('ErrorDomain', DOMAINS)}
${union('ErrorSeverity', SEVERITIES)}
${union('DataSafety', DATA_SAFETY)}

export interface CatalogueEntry {
${fields.map(([field, type]) => `\t${field}: ${type};`).join('\n')}
}

export const ERROR_CATALOGUE: Record<ErrorCode, CatalogueEntry> = {
${catalogue}
};

export const ERROR_CODES = {
${symbols}
} as const satisfies Record<string, ErrorCode>;
`;
}

/**
 * One literal `t()` call per error code, mirroring `event-titles.generated.ts`.
 *
 * The summary is the row's plain-language reason, and on the 147 `logger.error`
 * call sites in packages/core that carry a code but no registered engine event
 * type it is the ONLY merchant-readable sentence on the row — the title there
 * falls back to the persisted developer message. Leaving it English meant a
 * French till rendered a French title, an English reason and French guidance in
 * one stack.
 *
 * Literal keys, because the string extractor only sees `t('literal')`: a
 * computed `t(summaryKey(code))` would never reach translators.
 *
 * Codes are the switch cases rather than a lookup object so a code added to the
 * registry without regenerating this file is a TYPE error, not a blank row.
 */
function renderSummaries(registry) {
	const cases = registry
		.map((entry) =>
			[`\t\tcase ${quote(entry.code)}:`, `\t\t\treturn t(${quote(summaryKey(entry.code))});`].join(
				'\n'
			)
		)
		.join('\n');
	return `${BANNER}
import type { ErrorCode } from '@wcpos/utils/logger/generated/error-codes.generated';

/** The translate function shape \`useT()\` returns. */
type TranslateError = (key: string) => string;

/**
 * The plain-language reason for an error code, translated at render time — so a
 * row written months ago on a Spanish till reads in whatever language the till
 * runs today, the same contract \`translateEventTitle\` holds for row titles.
 *
 * No \`defaultValue\`: the English catalogue is bundled statically and IS the
 * fallback language, and this generator writes those strings into it from the
 * registry. A defaultValue would be a third copy of every summary that nothing
 * renders and this generator could silently drift from.
 */
export function translateErrorSummary(t: TranslateError, code: ErrorCode): string {
	switch (code) {
${cases}
		default: {
			const exhaustive: never = code;
			return exhaustive;
		}
	}
}
`;
}

/**
 * One literal `t()` call per action hint, matching `renderSummaries` so the
 * string extractor sees every key and new registry codes remain exhaustive.
 */
function renderActions(registry) {
	const cases = registry
		.map((entry) =>
			[`		case ${quote(entry.code)}:`, `			return t(${quote(actionKey(entry.code))});`].join('\n')
		)
		.join('\n');
	return `${BANNER}
import type { ErrorCode } from '@wcpos/utils/logger/generated/error-codes.generated';

/** The translate function shape \`useT()\` returns. */
type TranslateError = (key: string) => string;

/**
 * The safe next step for an error code, translated at render time through the
 * statically bundled English fallback catalogue.
 */
export function translateErrorAction(t: TranslateError, code: ErrorCode): string {
	switch (code) {
${cases}
		default: {
			const exhaustive: never = code;
			return exhaustive;
		}
	}
}
`;
}

/**
 * The English source strings the generated `t()` calls resolve against.
 *
 * Only the generated summary and action keys are touched: every other key keeps
 * its value AND its position, and each block is rewritten where it already sits.
 */
export function renderLocale(registry, source) {
	const mergeBlock = (catalogue, prefix, block) => {
		const existing = Object.entries(catalogue);
		const generated = (key) => key.startsWith(prefix);
		const untouched = existing.filter(([key]) => !generated(key));
		const anchor = existing.findIndex(([key]) => generated(key));
		const at = anchor === -1 ? untouched.length : anchor;
		return Object.fromEntries([...untouched.slice(0, at), ...block, ...untouched.slice(at)]);
	};
	const summaries = registry.map((entry) => [summaryKey(entry.code), entry.summary]);
	const actions = registry.map((entry) => [actionKey(entry.code), entry.actionHint]);
	const merged = mergeBlock(
		mergeBlock(source, SUMMARY_KEY_PREFIX, summaries),
		ACTION_KEY_PREFIX,
		actions
	);
	return `${JSON.stringify(merged, null, '\t')}\n`;
}

function parseArguments(args) {
	const localePath = path.join(
		repoRoot,
		'packages/core/src/contexts/translations/locales/en/core.json'
	);
	const options = {
		registry: path.join(repoRoot, 'packages/utils/src/logger/error-registry.json'),
		outputDirectory: path.join(repoRoot, 'packages/utils/src/logger/generated'),
		summariesDirectory: path.join(repoRoot, 'packages/core/src/screens/main/logs/generated'),
		localeSource: localePath,
		localeOutput: localePath,
	};
	for (let index = 0; index < args.length; index += 2) {
		if (args[index] === '--registry') options.registry = path.resolve(args[index + 1]);
		else if (args[index] === '--output-dir') {
			// Test mode: every artifact lands in one throwaway directory, and the
			// real English catalogue is read but never written.
			const directory = path.resolve(args[index + 1]);
			options.outputDirectory = directory;
			options.summariesDirectory = directory;
			options.localeOutput = path.join(directory, 'core.json');
		} else throw new Error(`Unknown argument: ${args[index]}`);
	}
	return options;
}

export async function generateErrorCodes(options = parseArguments([])) {
	const registry = JSON.parse(await readFile(options.registry, 'utf8'));
	validateRegistry(registry);
	const locale = JSON.parse(await readFile(options.localeSource, 'utf8'));
	await mkdir(options.outputDirectory, { recursive: true });
	await mkdir(options.summariesDirectory, { recursive: true });
	await Promise.all([
		writeFile(
			path.join(options.outputDirectory, 'error-codes.generated.ts'),
			renderTypescript(registry)
		),
		writeFile(
			path.join(options.summariesDirectory, 'error-summaries.generated.ts'),
			renderSummaries(registry)
		),
		writeFile(
			path.join(options.summariesDirectory, 'error-actions.generated.ts'),
			renderActions(registry)
		),
		writeFile(options.localeOutput, renderLocale(registry, locale)),
		// Error-code help pages are hand-authored in the wcpos/docs repo — the generator no longer emits them here.
	]);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	generateErrorCodes(parseArguments(process.argv.slice(2))).catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
