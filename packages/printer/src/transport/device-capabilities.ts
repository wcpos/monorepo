type NavLike = { usb?: unknown; bluetooth?: unknown } | undefined;

function nav(navigatorLike?: NavLike): NavLike {
	if (navigatorLike !== undefined) return navigatorLike;
	return typeof navigator !== 'undefined' ? (navigator as NavLike) : undefined;
}

/** True when the browser exposes WebUSB (Chromium desktop/Android; never iOS Safari). */
export function isWebUsbSupported(navigatorLike?: NavLike): boolean {
	return !!nav(navigatorLike)?.usb;
}

/** True when the browser exposes Web Bluetooth (Chromium desktop/Android; never iOS Safari). */
export function isWebBluetoothSupported(navigatorLike?: NavLike): boolean {
	return !!nav(navigatorLike)?.bluetooth;
}
