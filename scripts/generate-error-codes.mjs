import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
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
];
const SEVERITIES = ['info', 'warn', 'error'];
const SAFE_ACTIONS = [
	'retry',
	'retry-after-edit',
	'verify-first',
	'continue',
	'repair-local',
	'reconfigure',
	'contact-support',
];
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
const TITLE_TOKENS = {
	DB: 'DB',
	TLS: 'TLS',
	URL: 'URL',
	SKU: 'SKU',
	WOOCOMMERCE: 'WooCommerce',
	WCPOS: 'WCPOS',
	PRO: 'Pro',
};
const SAFE_ACTION_COPY = {
	retry: 'Try the action again.',
	'retry-after-edit': 'Correct the highlighted details, then try again.',
	continue: 'You can keep working — WCPOS handles this automatically.',
	'verify-first': 'Check the details below before trying again.',
	reconfigure: 'A settings change is needed before this will work.',
	'repair-local':
		'Restart WCPOS; if this keeps happening the local data on this device needs repair.',
	'contact-support': 'Export diagnostics and contact support.',
};
const RETRY_POLICY_COPY = {
	automatic: 'WCPOS retries this automatically.',
	manual: 'WCPOS does not retry this by itself — retry when you are ready.',
	'after-change':
		'Retry after making the change above; retrying without it will fail the same way.',
	never: 'Do not retry — the result will not change.',
};
// A blanket "the result will not change" is dangerously wrong when the outcome
// is unknown or money may have moved — there a blind retry can duplicate a
// charge or an order, and the right instruction is verify-first.
const RETRY_NEVER_VERIFY_COPY =
	'Do not retry until you have confirmed what actually happened — a blind retry can create a duplicate charge or order.';
function retryPolicySentence(entry) {
	if (
		entry.retryPolicy === 'never' &&
		(entry.dataSafety === 'outcome-unknown' || entry.dataSafety === 'money-moved')
	) {
		return RETRY_NEVER_VERIFY_COPY;
	}
	return RETRY_POLICY_COPY[entry.retryPolicy];
}
const DATA_SAFETY_COPY = {
	'no-impact': 'No order or product data is affected.',
	'local-only': 'The change is saved on this device but has not reached your store.',
	'order-safe': 'The order itself is safe and unchanged.',
	'data-at-risk': 'Data on this device may be at risk — do not clear local data.',
	'money-moved': 'Money may have moved — verify the payment before acting.',
	'outcome-unknown': 'The outcome could not be confirmed — verify before retrying.',
};
const ESCALATION_COPY = {
	'store-admin': 'If this persists, ask your store administrator.',
	'site-admin': 'If this persists, ask the person who manages your WordPress site.',
	'payment-provider': 'If this persists, contact your payment provider.',
	'support-with-export': 'If this persists, export diagnostics and contact WCPOS support.',
};
// Docs-only troubleshooting surfaces. `logSources` lists the surfaces beyond the
// in-app Logs screen (which every code gets); the copy here is the single place
// that knows where each surface lives, so a UI move is a one-line fix.
const LOG_SOURCES = [
	'network-inspector',
	'browser-console',
	'wp-admin-pos-logs',
	'woo-status-logs',
	'host-error-log',
	'payment-provider',
];
const POS_LOGS_COPY =
	'When WCPOS can save this error, it is recorded on the device that raised it. Open **Store health → Logs** (the heart-pulse icon at the bottom of the navigation drawer), find the entry marked with this code and expand it: the expanded row shows the plain-language reason and the context captured at the moment of failure. For a store request, that context may include the server’s own error code (`serverCode`), the HTTP `status` or the `endpoint`; the fields shown depend on where the failure occurred. When reporting a problem, use **Copy debug info** at the top of the Logs screen (**Share debug info** on phones and tablets) rather than screenshots: it bundles the app version, connection state and the most recent errors. Logs are kept for at most 30 days, so collect them while the problem is fresh. Also copy any browser-console error that appeared before the POS was able to write its own log entry.';
const LOG_SOURCE_COPY = {
	'network-inspector':
		'**Network inspector** (web and desktop): open the developer tools — press F12 in the browser, or **Advanced → Toggle Developer Tools** in the desktop app’s menu — and select the **Network** tab. Follow this page’s retry guidance first; reproduce the action only when those steps say it is safe. A failing request shows the HTTP status and the raw response body, including error pages that never reach the POS log.',
	'browser-console':
		'**Console** (web and desktop): the **Console** tab of the same developer tools records client-side errors, including ones that happen before the POS is able to write its own log entry.',
	'wp-admin-pos-logs':
		'**Server-side POS logs**: in WP Admin, open **POS → Settings → Tools → Logs**. This page records POS-related warnings and errors raised on the server itself, which may never appear inside the app. A red badge on the menu means unread server-side errors.',
	'woo-status-logs':
		'**WooCommerce → Status → Logs**: on the WordPress site, check the newest `fatal-errors-*.log` for PHP crashes, plus any log source named after a plugin involved in the failure. A 500-class error from the store almost always leaves its cause here.',
	'host-error-log':
		"**The site's PHP error log**: if WooCommerce's log page shows nothing for the failure time, ask the hosting provider for the PHP error log — some fatal errors are captured only at the server level.",
	'payment-provider':
		'**Payment provider dashboard**: the terminal provider’s own record (for example Stripe Dashboard → Payments, or the Square Dashboard) is the authority on whether a charge went through — check it before retrying any payment.',
};
const FIELDS = {
	code: 'ErrorCode',
	symbol: 'string',
	domain: 'ErrorDomain',
	severity: 'ErrorSeverity',
	safeAction: 'SafeAction',
	retryPolicy: 'RetryPolicy',
	dataSafety: 'DataSafety',
	escalation: 'Escalation',
	summary: 'string',
	docsBody: 'string',
	introducedIn: 'string',
	evidence: 'string',
};
const VOCABULARIES = {
	domain: DOMAINS,
	severity: SEVERITIES,
	safeAction: SAFE_ACTIONS,
	retryPolicy: RETRY_POLICIES,
	dataSafety: DATA_SAFETY,
	escalation: ESCALATIONS,
};
const SUMMARY_KEY_PREFIX = 'health.logs.error_summary.';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** `SYNC101` → `health.logs.error_summary.SYNC101`. */
export function summaryKey(code) {
	return `${SUMMARY_KEY_PREFIX}${code}`;
}

function validateRegistry(registry) {
	if (!Array.isArray(registry)) throw new Error('Registry must be a JSON array');
	const codes = new Set();
	const symbols = new Set();
	for (const [index, entry] of registry.entries()) {
		if (!entry || typeof entry !== 'object') throw new Error(`Entry ${index} must be an object`);
		for (const field of Object.keys(FIELDS)) {
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
// (an apostrophe in a docsBody would otherwise fail prettier/prettier every time).
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
	const fields = Object.entries(FIELDS);
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
${union('SafeAction', SAFE_ACTIONS)}
${union('RetryPolicy', RETRY_POLICIES)}
${union('DataSafety', DATA_SAFETY)}
${union('Escalation', ESCALATIONS)}

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

const yamlString = (value) => `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
const humanizeTitle = (symbol) =>
	symbol
		.split('_')
		.map((token, index) => {
			if (TITLE_TOKENS[token]) return TITLE_TOKENS[token];
			const lower = token.toLowerCase();
			return index === 0 ? `${lower[0].toUpperCase()}${lower.slice(1)}` : lower;
		})
		.join(' ');

function renderDocsPage(entry) {
	const escalation = ESCALATION_COPY[entry.escalation];
	return `---
title: ${yamlString(`${entry.code}: ${humanizeTitle(entry.symbol)}`)}
sidebar_label: ${entry.code}
description: ${yamlString(entry.summary)}
---

{/* GENERATED PAGE — do not edit. Source of truth: packages/utils/src/logger/error-registry.json in wcpos/monorepo. Regenerate with \`pnpm generate:error-codes\`. */}

## What this means {#what-this-means}

${entry.summary}

${entry.docsBody}

## What to do {#what-to-do}

${SAFE_ACTION_COPY[entry.safeAction]} ${retryPolicySentence(entry)}

## Your data {#your-data}

${DATA_SAFETY_COPY[entry.dataSafety]}${escalation ? ` ${escalation}` : ''}

## Troubleshoot {#troubleshoot}

${entry.troubleshooting.map((step, stepIndex) => `${stepIndex + 1}. ${step}`).join('\n')}

## Where to look {#where-to-look}

${POS_LOGS_COPY}
${entry.logSources.length ? `\nBeyond the in-app log, this failure can leave evidence in:\n\n${entry.logSources.map((source) => `- ${LOG_SOURCE_COPY[source]}`).join('\n')}\n` : ''}
## Details {#details}

- **Code:** \`${entry.code}\` (\`${entry.symbol}\`)
- **Severity:** ${entry.severity}
- **Introduced in:** WCPOS ${entry.introducedIn}
`;
}

function renderSidebar(registry) {
	const domains = new Map();
	for (const entry of registry) {
		if (!domains.has(entry.domain)) domains.set(entry.domain, []);
		domains.get(entry.domain).push(`error-codes/${entry.code}`);
	}
	return `${JSON.stringify(
		{
			type: 'category',
			label: 'Error codes (1.10+)',
			items: [...domains].map(([label, items]) => ({
				type: 'category',
				label,
				items: items.sort(),
			})),
		},
		null,
		'\t'
	)}\n`;
}

async function writeDocs(outputDirectory, registry) {
	const docsDirectory = path.join(outputDirectory, 'error-docs');
	await rm(docsDirectory, { recursive: true, force: true });
	await mkdir(docsDirectory, { recursive: true });
	await Promise.all([
		...registry.map((entry) =>
			writeFile(path.join(docsDirectory, `${entry.code}.mdx`), renderDocsPage(entry))
		),
		writeFile(path.join(docsDirectory, 'sidebar-category.json'), renderSidebar(registry)),
	]);
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
 * The English source strings the generated `t()` calls resolve against.
 *
 * Only `health.logs.error_summary.*` keys are touched: every other key keeps its
 * value AND its position, and the block is rewritten where it already sits, so
 * editing a summary in the registry and regenerating produces a diff of exactly
 * the summaries that changed. Same contract as `generate-event-labels.mjs`.
 */
export function renderLocale(registry, source) {
	const existing = Object.entries(source);
	const generated = (key) => key.startsWith(SUMMARY_KEY_PREFIX);
	const untouched = existing.filter(([key]) => !generated(key));
	const anchor = existing.findIndex(([key]) => generated(key));
	const block = registry.map((entry) => [summaryKey(entry.code), entry.summary]);
	const at = anchor === -1 ? untouched.length : anchor;
	const merged = [...untouched.slice(0, at), ...block, ...untouched.slice(at)];
	return `${JSON.stringify(Object.fromEntries(merged), null, '\t')}\n`;
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
		writeFile(options.localeOutput, renderLocale(registry, locale)),
		writeFile(
			path.join(options.outputDirectory, 'error-catalogue.json'),
			`${JSON.stringify({ [BANNER]: true, entries: registry }, null, '\t')}\n`
		),
		writeDocs(options.outputDirectory, registry),
	]);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	generateErrorCodes(parseArguments(process.argv.slice(2))).catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
