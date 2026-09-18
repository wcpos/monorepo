import { defineConfig, devices } from '@playwright/test';

// CI prebuilds once; local runs always export fresh. Smoke without baselines: npx playwright test -c playwright.gallery.config.ts --ignore-snapshots
export default defineConfig({
	testDir: './gallery',
	workers: 1,
	retries: 0,
	timeout: 120_000,
	forbidOnly: !!process.env.CI,
	updateSnapshots: 'none',
	reporter: [['list'], ['html', { open: 'never' }]],
	snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/{arg}-linux{ext}',
	expect: { toHaveScreenshot: { maxDiffPixels: 0, animations: 'disabled', caret: 'hide' } },
	use: { baseURL: 'http://127.0.0.1:8097', trace: 'off', video: 'off', screenshot: 'off' },
	projects: [{ name: 'gallery', use: { ...devices['Desktop Chrome'] } }],
	webServer: {
		command:
			(process.env.CI
				? ''
				: 'EXPO_PUBLIC_WCPOS_GALLERY=1 npx expo export --platform web --output-dir ./gallery-build && ') +
			'npx serve gallery-build -l 8097 -s',
		url: 'http://127.0.0.1:8097',
		timeout: 7 * 60 * 1000,
	},
});
