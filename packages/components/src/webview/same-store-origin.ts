/**
 * Whether `url` is on the store at `storeURL`: same host or its www twin, same port, same scheme
 * or http to https. The native WebView admits frame messages by it; checkout sends its token by it.
 */
export function sameStoreOrigin(
	url: string | null | undefined,
	storeURL: string | null | undefined
): boolean {
	if (!url || !storeURL) return false;
	try {
		const sender = new URL(url);
		const pin = new URL(storeURL);
		return (
			['http:', 'https:'].includes(sender.protocol) &&
			['http:', 'https:'].includes(pin.protocol) &&
			(sender.protocol === pin.protocol ||
				(pin.protocol === 'http:' && sender.protocol === 'https:')) &&
			sender.hostname.replace(/^www\./, '') === pin.hostname.replace(/^www\./, '') &&
			sender.port === pin.port
		);
	} catch {
		return false;
	}
}
