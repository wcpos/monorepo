export function allowedOriginsFromEnv(
	envValue: string | undefined,
	fallbackOrigin: string
): string[] {
	const configured = splitCsv(envValue);
	return configured.length > 0 ? configured.map(normalizeOrigin).filter(Boolean) : [fallbackOrigin];
}

export function allowedPrintDestinationsFromEnv(envValue: string | undefined): string[] {
	const configured = splitCsv(envValue);
	return configured.length > 0
		? configured.map((destination) => destination.toLowerCase())
		: defaultPrintDestinations;
}

export function isStoreOriginAllowed(storeUrl: string, allowedOrigins: readonly string[]): boolean {
	const origin = normalizeOrigin(storeUrl);
	return Boolean(origin) && allowedOrigins.includes(origin);
}

export function shouldForwardCookies(storeUrl: string, cookieOrigin: string): boolean {
	const storeOrigin = normalizeOrigin(storeUrl);
	const normalizedCookieOrigin = normalizeOrigin(cookieOrigin.trim());
	return Boolean(storeOrigin) && storeOrigin === normalizedCookieOrigin;
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

export function isPrintDestinationAllowed(
	host: string,
	port: number,
	allowedDestinations: readonly string[]
): boolean {
	const normalizedHost = host.toLowerCase();
	return (
		allowedDestinations.includes(normalizedHost) ||
		allowedDestinations.includes(`${normalizedHost}:${port}`)
	);
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

const defaultPrintDestinations = ['127.0.0.1:9100', 'localhost:9100', '::1:9100'];
