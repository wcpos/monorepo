const INSTALL_ID_KEY = 'wcpos_install_id';

let deviceId: Promise<string> | undefined;

export function getDeviceId(): Promise<string> {
	deviceId ??= Promise.resolve().then(() => {
		const browser = window as typeof window & { electron?: { installId?: unknown } };
		if (typeof browser.electron?.installId === 'string' && browser.electron.installId.trim()) {
			return browser.electron.installId;
		}
		const stored = browser.localStorage.getItem(INSTALL_ID_KEY);
		if (stored) return stored;
		const created = browser.crypto.randomUUID();
		browser.localStorage.setItem(INSTALL_ID_KEY, created);
		return created;
	});
	return deviceId;
}
