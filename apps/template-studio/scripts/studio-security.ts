export function allowedOriginsFromEnv(
	envValue: string | undefined,
	fallbackOrigin: string
): string[] {
	const configured = splitCsv(envValue);
	return configured.length > 0 ? configured.map(normalizeOrigin).filter(Boolean) : [fallbackOrigin];
}

export function allowedHostsFromEnv(envValue: string | undefined): string[] {
	const configured = splitCsv(envValue);
	return configured.length > 0 ? configured.map((host) => host.toLowerCase()) : loopbackHosts;
}

export function isStoreOriginAllowed(storeUrl: string, allowedOrigins: readonly string[]): boolean {
	const origin = normalizeOrigin(storeUrl);
	return Boolean(origin) && allowedOrigins.includes(origin);
}

export function shouldForwardCookies(storeUrl: string, cookieOrigin: string): boolean {
	return normalizeOrigin(storeUrl) === cookieOrigin;
}

export function isLoopbackAddress(address: string | undefined): boolean {
	if (!address) return false;
	const normalized = address.toLowerCase();
	return (
		normalized === '::1' ||
		normalized === '127.0.0.1' ||
		normalized.startsWith('127.') ||
		normalized.startsWith('::ffff:127.')
	);
}

export function isPrintHostAllowed(host: string, allowedHosts: readonly string[]): boolean {
	return allowedHosts.includes(host.toLowerCase());
}

function normalizeOrigin(rawUrl: string): string {
	try {
		return new URL(rawUrl).origin;
	} catch {
		return '';
	}
}

function splitCsv(value: string | undefined): string[] {
	return (value ?? '')
		.split(',')
		.map((item) => item.trim())
		.filter(Boolean);
}

const loopbackHosts = ['127.0.0.1', 'localhost', '::1'];
