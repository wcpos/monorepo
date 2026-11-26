describe('app pull pause flag', () => {
	it('defaults to running and can pause and resume pulls', () => {
		jest.resetModules();
		const { getPullsPaused, setPullsPaused }: typeof import('./pulls-paused') =
			jest.requireActual('./pulls-paused');
		expect(getPullsPaused()).toBe(false);
		setPullsPaused(true);
		expect(getPullsPaused()).toBe(true);
		setPullsPaused(false);
		expect(getPullsPaused()).toBe(false);
	});
});
