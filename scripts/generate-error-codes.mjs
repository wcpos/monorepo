import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BANNER = '// GENERATED — do not edit by hand; run pnpm generate:error-codes';
const DOMAINS = ['AUTH', 'SYNC', 'CHECKOUT', 'PAYMENT', 'PRINT', 'PRODUCT', 'LICENSE', 'CLIENT'];
const SEVERITIES = ['info', 'warn', 'error'];
const SAFE_ACTIONS = ['retry', 'retry-after-edit', 'verify-first', 'continue', 'repair-local', 'reconfigure', 'contact-support'];
const RETRY_POLICIES = ['automatic', 'manual', 'after-change', 'never'];
const DATA_SAFETY = ['no-impact', 'local-only', 'order-safe', 'money-moved', 'outcome-unknown', 'data-at-risk'];
const ESCALATIONS = ['none', 'store-admin', 'site-admin', 'support-with-export', 'payment-provider'];
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
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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
	return escaped.includes("'")
		? `"${escaped.replaceAll('"', '\\"')}"`
		: `'${escaped}'`;
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
	const catalogue = registry.map((entry) => `\t${entry.code}: {\n${fields.map(([field]) => renderField(entry, field)).join('\n')}\n\t},`).join('\n');
	const symbols = registry.map((entry) => `\t${entry.symbol}: ${quote(entry.code)},`).join('\n');
	return `${BANNER}

${union('ErrorCode', registry.map(({ code }) => code))}
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

function parseArguments(args) {
	const options = {
		registry: path.join(repoRoot, 'packages/utils/src/logger/error-registry.json'),
		outputDirectory: path.join(repoRoot, 'packages/utils/src/logger/generated'),
	};
	for (let index = 0; index < args.length; index += 2) {
		if (args[index] === '--registry') options.registry = path.resolve(args[index + 1]);
		else if (args[index] === '--output-dir') options.outputDirectory = path.resolve(args[index + 1]);
		else throw new Error(`Unknown argument: ${args[index]}`);
	}
	return options;
}

export async function generateErrorCodes(options = parseArguments([])) {
	const registry = JSON.parse(await readFile(options.registry, 'utf8'));
	validateRegistry(registry);
	await mkdir(options.outputDirectory, { recursive: true });
	await Promise.all([
		writeFile(path.join(options.outputDirectory, 'error-codes.generated.ts'), renderTypescript(registry)),
		writeFile(path.join(options.outputDirectory, 'error-catalogue.json'), `${JSON.stringify({ [BANNER]: true, entries: registry }, null, '\t')}\n`),
	]);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	generateErrorCodes(parseArguments(process.argv.slice(2))).catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
