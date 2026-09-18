import config from '../playwright.gallery.config';

jest.resetModules();

jest.mock('@playwright/test', () => ({
	defineConfig: <T>(config: T) => config,
	devices: { 'Desktop Chrome': {} },
}));

it('isolates the gallery from store E2E and keeps a zero-pixel screenshot contract', () => {
	expect(config.projects?.map((project) => project.name)).toEqual(['gallery']);
	expect(config.testDir).toBe('./gallery');
	expect(config.globalSetup).toBeUndefined();
	expect(config.retries).toBe(0);
	expect(config.updateSnapshots).toBe('none');
	expect(config.expect?.toHaveScreenshot).toEqual({
		maxDiffPixels: 0,
		animations: 'disabled',
		caret: 'hide',
	});
	expect(config.snapshotPathTemplate).toBe('{testDir}/{testFilePath}-snapshots/{arg}-linux{ext}');
});
