import { defineConfig, devices } from '@playwright/test';

// Playwright's per-pixel colour tolerance (YIQ distance, 0–1). Its default, 0.2, let a shadow
// removal and a tint change through with `maxDiffPixels: 0` in Phase F (2026-10-17): a pixel
// that moved less than the tolerance never counted as different, and 167 light/dark baselines
// had drifted by 0.05–0.2 unseen. Zero flaked: Chromium shaded a rounded corner's antialiased
// edge one level apart between two shots in one job (`dropdown-menu--sheet--spacious-coarse`,
// 6 pixels, about 0.004). 0.05 is the smallest of the steps tried (0, 0.05, 0.1) that holds,
// about 13 levels of luma, well under any drawn change; two runs on unchanged baselines held it.
const PIXEL_COLOUR_THRESHOLD = 0.05;

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
	expect: {
		toHaveScreenshot: {
			maxDiffPixels: 0,
			threshold: PIXEL_COLOUR_THRESHOLD,
			animations: 'disabled',
			caret: 'hide',
			// The unfocused look for an isolated cell's search field, below React (see the file).
			stylePath: './gallery/shoot.css',
		},
	},
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
