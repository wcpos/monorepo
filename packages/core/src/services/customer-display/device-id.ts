import { uuid } from './envelope';

const DISPLAY_DEVICE_ID_KEY = 'wcpos_display_device_id';

let deviceId: Promise<string> | undefined;

export function getDeviceId(): Promise<string> {
	deviceId ??= Promise.resolve()
		.then(() => {
			const browser = window as typeof window & { electron?: { installId?: unknown } };
			if (typeof browser.electron?.installId === 'string' && browser.electron.installId.trim()) {
				return browser.electron.installId;
			}
			const stored = browser.localStorage.getItem(DISPLAY_DEVICE_ID_KEY);
			if (stored) return stored;
			const created = uuid();
			browser.localStorage.setItem(DISPLAY_DEVICE_ID_KEY, created);
			return created;
		})
		.catch((error) => {
			deviceId = undefined;
			throw error;
		});
	return deviceId;
}
