/**
 * Feature-detection for the direct-connection transports. Web Serial and WebHID
 * exist only on Chromium desktop + Electron; everywhere else these return false
 * so the UI capability-gates the connection types (mirrors the printer package's
 * device-capabilities helpers).
 */

interface NavigatorLike {
	serial?: unknown;
	hid?: unknown;
}

function nav(navLike?: NavigatorLike): NavigatorLike | undefined {
	if (navLike) {
		return navLike;
	}
	return typeof navigator !== 'undefined' ? (navigator as NavigatorLike) : undefined;
}

export function isWebSerialSupported(navLike?: NavigatorLike): boolean {
	return !!nav(navLike)?.serial;
}

export function isWebHidSupported(navLike?: NavigatorLike): boolean {
	return !!nav(navLike)?.hid;
}
