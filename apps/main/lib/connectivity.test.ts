function loadConnectivity(): typeof import('./connectivity') {
	jest.resetModules();
	return jest.requireActual('./connectivity');
}

describe('app connectivity store', () => {
	it('defaults to online', () => {
		const { getEngineConnectivity } = loadConnectivity();

		expect(getEngineConnectivity()).toBe('online');
	});

	it('seeds offline when navigator reports offline at load', () => {
		const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
		Object.defineProperty(globalThis, 'navigator', {
			value: { onLine: false },
			configurable: true,
			writable: true,
		});
		try {
			const { getEngineConnectivity } = loadConnectivity();

			expect(getEngineConnectivity()).toBe('offline');
		} finally {
			if (original) {
				Object.defineProperty(globalThis, 'navigator', original);
			} else {
				delete (globalThis as { navigator?: unknown }).navigator;
			}
		}
	});

	it.each([
		['offline', 'offline'],
		['online-website-unavailable', 'degraded'],
		['online-website-available', 'online'],
	] as const)('maps %s to %s', (onlineStatus, engineConnectivity) => {
		const { getEngineConnectivity, setAppOnlineStatus } = loadConnectivity();

		setAppOnlineStatus(onlineStatus);

		expect(getEngineConnectivity()).toBe(engineConnectivity);
	});
});
