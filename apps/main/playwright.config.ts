import { defineConfig, devices } from '@playwright/test';

process.env.E2E_RUN_ID ??= process.env.GITHUB_RUN_ID ?? `local-${process.pid}`;

/**
 * Custom test options passed to each project.
 */
export type StoreVariant = 'free' | 'pro';

export interface WcposTestOptions {
	storeVariant: StoreVariant;
	storeUrl: string;
	/** Cold-start profile: thin local catalogue, bulk sync starved (#991). */
	coldStart?: boolean;
}

/**
 * Lane → store. The lane owns this decision and passes it in; nothing here may
 * invent a store.
 *
 * A store URL is NEVER defaulted in CI. `E2E_STORE_URL_PRO` used to fall back to
 * dev-next, and since the workflow never set it, the whole main lane silently
 * gated 1.9.x client code against the 1.10 store for weeks, while dev-free
 * coverage vanished because its own default was the empty string. A wrong store
 * answers every request happily, so this surfaces as unrelated flaky specs
 * rather than as a configuration error — hence, fail loudly instead.
 *
 * Allowed stores per lane (owner ruling, 2026-08-18):
 * - main → dev-free (free) + dev-pro (pro), and NOTHING else.
 * - next → dev-next only. One site runs the next branch of BOTH plugins, so it
 *   serves both variants: the free projects point at it too and take the free
 *   path because `stubStoreVersionForE2E` masks the licence per variant (it
 *   already does this on every lane — see fixtures.ts).
 */
const LOCAL_DEFAULT_PRO_STORE_URL = 'https://dev-pro.wcpos.com';

/**
 * `E2E_STORE_URL` points BOTH variants at one store (e2e-native.yml). Resolved
 * here so this module is the single resolver — fixtures used to apply it again
 * downstream, which let a run bootstrap against one origin and connect to another.
 */
function configuredStoreUrl(envValue: string | undefined): string {
	return (envValue || process.env.E2E_STORE_URL || '').trim();
}

/**
 * The free matrix runs ONLY when a free store is named.
 *
 * This is a declaration, not a guess. Playwright's `FullConfig.projects` is the
 * full configured list even under `--project=` (verified 2026-08-18), so
 * globalSetup cannot ask which projects were selected — an earlier attempt to
 * infer it made a pro-only run demand and bootstrap a free store it never opens,
 * which is exactly what breaks the cold-start workflow.
 *
 * Naming the store is therefore what turns the variant on: a run that wants free
 * coverage says so, and one that does not (cold-start; a local pro-only run) pays
 * nothing for it. The risk this reopens — a lane silently losing free coverage,
 * which is how dev-free vanished for weeks — is closed where it belongs, by a
 * contract test asserting deploy.yml names BOTH stores for every lane.
 */
export const FREE_STORE_URL = configuredStoreUrl(process.env.E2E_STORE_URL_FREE);
export const PRO_STORE_URL =
	configuredStoreUrl(process.env.E2E_STORE_URL_PRO) ||
	// Local runs default to the stable trunk's pro store; CI must name it (below).
	(process.env.CI ? '' : LOCAL_DEFAULT_PRO_STORE_URL);

/**
 * Fail a CI run whose lane never named its stores.
 *
 * Deliberately NOT enforced while this module loads: the config is imported by
 * unit tests and by the sibling one-off configs, none of which touch a store, and
 * a module-load throw would fail them for a rule that does not apply. globalSetup
 * is the honest seam — it runs only when a real E2E run is about to authenticate.
 */
export function assertLaneStoresConfigured(): void {
	if (!process.env.CI) return;
	if (PRO_STORE_URL) return;
	throw new Error(
		'E2E_STORE_URL_PRO is not set. Every lane runs the pro matrix, so the workflow ' +
			'must name its store (main → dev-pro, next → dev-next); the config will not ' +
			'guess one. The free matrix is opt-in: name E2E_STORE_URL_FREE to run it.'
	);
}
const FREE_PROJECT_ENABLED = FREE_STORE_URL.length > 0;

// Cold-start profile (#991): a thin-local-DB variant that runs only the
// `*.cold.spec.ts` subset. Opt-in — it needs a second OAuth bootstrap in
// globalSetup. Keep this check in sync with COLD_START_ENABLED in
// e2e/cold-start.ts (the config must not import the test fixtures).
const COLD_START_ENABLED = /^(1|true)$/i.test(process.env.E2E_COLD_START || '');
const COLD_SPEC = /\.cold\.spec\.ts$/;
const LIVE_SPEC = /\.live\.spec\.ts$/;

/**
 * Playwright configuration for WCPOS E2E tests
 *
 * Run tests against:
 * - Local dev server: npx playwright test
 * - Preview deployment: BASE_URL=https://preview-xxx.expo.app npx playwright test
 * - Production: BASE_URL=https://wcpos.expo.app npx playwright test
 *
 * Run a single variant:
 * - npx playwright test --project=free-authenticated
 * - npx playwright test --project=pro-authenticated
 */
export default defineConfig<WcposTestOptions>({
	globalSetup: './e2e/global-setup.ts',
	testDir: './e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	// Total store load is runs x shards x workers. With 4 shards and a deep PR
	// queue, 4 workers/shard put ~100 concurrent browser sessions on one dev
	// store and saturated its PHP pool (2026-08-19: every main-lane gate failed
	// at global-setup while the store timed out). The dev stores are deliberately
	// sized like a normal shop, so CI is what gives — 2 workers/shard keeps the
	// shard parallelism that makes runs fast while halving the concurrent load.
	// Override with E2E_WORKERS for a deliberate experiment.
	workers: process.env.E2E_WORKERS
		? Number(process.env.E2E_WORKERS)
		: process.env.CI
			? 2
			: 1,
	reporter: process.env.CI
		? [
				['github'],
				['list'],
				['html', { open: 'never' }],
				['json', { outputFile: 'test-results.json' }],
				['blob'],
			]
		: 'html',
	timeout: 180_000,

	use: {
		baseURL: process.env.BASE_URL || 'http://localhost:8081',
		trace: 'on-first-retry',
		screenshot: 'only-on-failure',
		video: 'retain-on-failure',
	},

	projects: [
		// Free store — only when an explicit free next-train target exists (see above).
		...(FREE_PROJECT_ENABLED
			? [
					{
						name: 'free-unauthenticated',
						testMatch: /auth\.spec\.ts/,
						use: {
							...devices['Desktop Chrome'],
							storeVariant: 'free' as const,
							storeUrl: FREE_STORE_URL,
						},
					},
					{
						name: 'free-authenticated',
						testIgnore: [/auth\.spec\.ts/, COLD_SPEC, LIVE_SPEC],
						use: {
							...devices['Desktop Chrome'],
							storeVariant: 'free' as const,
							storeUrl: FREE_STORE_URL,
						},
					},
				]
			: []),
		// Pro store
		{
			name: 'pro-unauthenticated',
			testMatch: /auth\.spec\.ts/,
			use: {
				...devices['Desktop Chrome'],
				storeVariant: 'pro',
				storeUrl: PRO_STORE_URL,
			},
		},
		{
			name: 'pro-authenticated',
			testIgnore: [/auth\.spec\.ts/, COLD_SPEC, LIVE_SPEC],
			use: {
				...devices['Desktop Chrome'],
				storeVariant: 'pro',
				storeUrl: PRO_STORE_URL,
			},
		},
		// Cold start: thin local catalogue (#991). Runs the `*.cold.spec.ts`
		// subset only — see e2e/cold-start.ts for the mechanism.
		...(COLD_START_ENABLED
			? [
					{
						name: 'pro-cold-start',
						testMatch: COLD_SPEC,
						use: {
							...devices['Desktop Chrome'],
							storeVariant: 'pro' as const,
							storeUrl: PRO_STORE_URL,
							coldStart: true,
						},
					},
				]
			: []),
	],

	/* Build and serve web app locally before tests (only when not testing against deployed URL) */
	webServer: process.env.BASE_URL
		? undefined
		: {
				command: 'pnpm run build:web && npx serve web-build -p 8081 -s',
				url: 'http://localhost:8081',
				reuseExistingServer: !process.env.CI,
				timeout: 180 * 1000,
			},
});
