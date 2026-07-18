/**
 * Feature-detection for the direct-connection transports. Web Serial and WebHID
 * exist only on Chromium desktop + Electron; everywhere else these return false
 * so the UI capability-gates the connection types (mirrors the printer package's
 * device-capabilities helpers).
 */

interface NavigatorLike {
	serial?: unknown;
	hid?: unknown;
	userAgent?: string;
}

function nav(navLike?: NavigatorLike): NavigatorLike | undefined {
	if (navLike) {
		return navLike;
	}
	return typeof navigator !== 'undefined' ? (navigator as NavigatorLike) : undefined;
}

// Electron exposes navigator.serial/hid but device access needs main-process
// handlers (select-serial-port / select-hid-device) that live in the separate
// electron repo and aren't wired yet (wcpos/monorepo#742). Until they land,
// report unsupported on Electron so the UI doesn't offer a dead connect button.
function isElectron(navLike?: NavigatorLike): boolean {
	const ua = nav(navLike)?.userAgent;
	return typeof ua === 'string' && /electron/i.test(ua);
}

export function isWebSerialSupported(navLike?: NavigatorLike): boolean {
	return !!nav(navLike)?.serial && !isElectron(navLike);
}

export function isWebHidSupported(navLike?: NavigatorLike): boolean {
	return !!nav(navLike)?.hid && !isElectron(navLike);
}
