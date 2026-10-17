import config from '../playwright.gallery.config';

jest.resetModules();

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
