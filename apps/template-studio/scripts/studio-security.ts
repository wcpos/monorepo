export function allowedOriginsFromEnv(
	envValue: string | undefined,
	fallbackOrigin: string
): string[] {
	const configured = splitCsv(envValue);
	return configured.length > 0 ? configured.map(normalizeOrigin).filter(Boolean) : [fallbackOrigin];
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

export function isRawTcpClientAddressAllowed(address: string | undefined): boolean {
	if (!address) return false;
	return isLoopbackAddress(address) || isPrivateLanAddress(address);
}

function isPrivateLanAddress(address: string): boolean {
	const normalized = stripIpv6MappedPrefix(address.toLowerCase());
	const octets = normalized.split('.').map((part) => Number(part));
	if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet))) return false;
	const [first, second, third, fourth] = octets;
	if (
		first === undefined ||
		second === undefined ||
		third === undefined ||
		fourth === undefined ||
		octets.some((octet) => octet < 0 || octet > 255)
	) {
		return false;
	}

	return (
		first === 10 ||
		(first === 172 && second >= 16 && second <= 31) ||
		(first === 192 && second === 168)
	);
}

function stripIpv6MappedPrefix(address: string): string {
	return address.startsWith('::ffff:') ? address.slice('::ffff:'.length) : address;
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
