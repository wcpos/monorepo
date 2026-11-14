const KEY = 'wcpos.scannerSettingsResetNotice';
let store: Map<string, string>;

function installStorage(overrides: Partial<Storage> = {}) {
	store = new Map();
	(globalThis as { window?: unknown }).window = {
		localStorage: {
			getItem: (key: string) => store.get(key) ?? null,
			setItem: (key: string, value: string) => store.set(key, value),
			removeItem: (key: string) => store.delete(key),
			...overrides,
		},
	};
}

const load = async () => {
	jest.resetModules();
	return import('./scanner-reset-notice.web');
};

describe('scanner reset notice (web)', () => {
	afterEach(() => {
		delete (globalThis as { window?: unknown }).window;
	});

	it('arms the persisted flag and tells each listener once', async () => {
		installStorage();
		const notice = await load();
		const listener = jest.fn();
		notice.subscribeScannerResetNotice(listener);

		expect(notice.isScannerResetNoticeArmed()).toBe(false);
		notice.armScannerResetNotice();

		expect(notice.isScannerResetNoticeArmed()).toBe(true);
		expect(store.get(KEY)).toBe('1');
		expect(notice.SCANNER_RESET_NOTICE_KEY).toBe(KEY);
		expect(listener).toHaveBeenCalledTimes(1);
	});

	it('dismisses the flag and tells the listener', async () => {
		installStorage();
		const notice = await load();
		notice.armScannerResetNotice();
		const listener = jest.fn();
		notice.subscribeScannerResetNotice(listener);

		notice.dismissScannerResetNotice();

		expect(notice.isScannerResetNoticeArmed()).toBe(false);
		expect(store.has(KEY)).toBe(false);
		expect(listener).toHaveBeenCalledTimes(1);
	});

	it('stops calling a listener once it unsubscribes', async () => {
		installStorage();
		const notice = await load();
		const listener = jest.fn();
		const unsubscribe = notice.subscribeScannerResetNotice(listener);
		unsubscribe();

		notice.armScannerResetNotice();
		notice.dismissScannerResetNotice();

		expect(listener).not.toHaveBeenCalled();
	});

	it('reads a throwing storage as not armed, without throwing', async () => {
		installStorage({
			getItem: () => {
				throw new DOMException('denied', 'SecurityError');
			},
		});
		const notice = await load();

		expect(() => notice.isScannerResetNoticeArmed()).not.toThrow();
		expect(notice.isScannerResetNoticeArmed()).toBe(false);
	});

	it('survives a storage whose writes throw', async () => {
		const refuse = () => {
			throw new DOMException('quota exceeded', 'QuotaExceededError');
		};
		installStorage({ setItem: refuse, removeItem: refuse });
		const notice = await load();

		expect(() => notice.armScannerResetNotice()).not.toThrow();
		expect(() => notice.dismissScannerResetNotice()).not.toThrow();
	});
});
