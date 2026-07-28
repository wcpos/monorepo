import { ERROR_CODES } from './error-codes';

export const LOG_DOMAINS = [
	'sync',
	'checkout',
	'payment',
	'print',
	'product',
	'auth',
	'license',
	'client',
	'db',
	'ui',
	'settings',
] as const;

export type LogDomain = (typeof LOG_DOMAINS)[number];

export type CodeRegistryEntry = {
	code: string;
	symbol: string;
	domain: LogDomain;
	severity: 'debug' | 'info' | 'warn' | 'error';
	deprecated?: boolean;
};

function legacyDomain(code: string): LogDomain {
	if (code.startsWith('DB')) return 'db';
	if (code.startsWith('PY')) return 'payment';
	return 'client';
}

export const CODE_REGISTRY: CodeRegistryEntry[] = Object.entries(ERROR_CODES).map(
	([symbol, code]) => ({
		code,
		symbol,
		domain: legacyDomain(code),
		severity: 'error',
		deprecated: true,
	})
);

const REGISTERED_CODES = new Set(CODE_REGISTRY.map(({ code }) => code));

export function isRegisteredCode(code: string): boolean {
	return REGISTERED_CODES.has(code);
}
