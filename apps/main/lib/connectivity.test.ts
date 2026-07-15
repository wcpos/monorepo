function loadConnectivity(): typeof import('./connectivity') {
	jest.resetModules();
	return jest.requireActual('./connectivity');
}

describe('app connectivity store', () => {
	it('defaults to online', () => {
		const { getEngineConnectivity } = loadConnectivity();

		expect(getEngineConnectivity()).toBe('online');
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
