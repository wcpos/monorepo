import { ERROR_CATALOGUE } from './generated/error-codes.generated';

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
};

export const CODE_REGISTRY: CodeRegistryEntry[] = Object.values(ERROR_CATALOGUE).map(
	({ code, symbol, domain, severity }) => ({
		code,
		symbol,
		domain: domain.toLowerCase() as LogDomain,
		severity,
	})
);

const REGISTERED_CODES = new Set(CODE_REGISTRY.map(({ code }) => code));

export function isRegisteredCode(code: string): boolean {
	return REGISTERED_CODES.has(code);
}
