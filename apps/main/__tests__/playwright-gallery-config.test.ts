import config from '../playwright.gallery.config';

jest.resetModules();

const loadConfig = (ci: string | undefined) => {
	const saved = process.env.CI;
	if (ci === undefined) delete process.env.CI;
	else process.env.CI = ci;
	try {
		let loaded: typeof config | undefined;
		jest.isolateModules(() => {
			loaded = jest.requireActual<{ default: typeof config }>(
				'../playwright.gallery.config'
			).default;
		});
		return loaded!;
	} finally {
		if (saved === undefined) delete process.env.CI;
		else process.env.CI = saved;
	}
};

jest.mock('@playwright/test', () => ({
	defineConfig: <T>(config: T) => config,
	devices: { 'Desktop Chrome': {} },
}));

it('isolates the gallery from store E2E and keeps a zero-pixel, near-exact-colour screenshot contract', () => {
	expect(config.projects?.map((project) => project.name)).toEqual(['gallery']);
	expect(config.testDir).toBe('./gallery');
	expect(config.globalSetup).toBeUndefined();
	expect(config.retries).toBe(0);
	expect(config.updateSnapshots).toBe('none');
	expect(config.expect?.toHaveScreenshot).toEqual({
		maxDiffPixels: 0,
		// Near-exact colour per pixel: the default 0.2 let tint and shadow changes pass; 0 flaked
		// on antialiased corners.
		threshold: 0.05,
		animations: 'disabled',
		caret: 'hide',
		// The unfocused look for a search field, below React (gallery/shoot.css).
		stylePath: './gallery/shoot.css',
	});
	expect(config.snapshotPathTemplate).toBe('{testDir}/{testFilePath}-snapshots/{arg}-linux{ext}');
});

it('shoots one test per component in parallel: four workers in CI, two on a laptop', () => {
	const ci = loadConfig('true');
	const local = loadConfig(undefined);
	expect(ci.fullyParallel).toBe(true);
	expect(local.fullyParallel).toBe(true);
	expect(ci.workers).toBe(4);
	// One worker is the serial walk this replaced (9.5 min for 3,780 cells, 2026-10-22).
	expect(ci.workers).toBeGreaterThanOrEqual(2);
	expect(local.workers).toBe(2);
});
