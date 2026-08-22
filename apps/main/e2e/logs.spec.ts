import { expect, type Page } from '@playwright/test';

import { navigateToPage, authenticatedTest as test } from './fixtures';

async function openLogs(page: Page) {
	await navigateToPage(page, 'health');
	await page.getByTestId('health-nav-logs').click();
	const screen = page.getByTestId('screen-logs');
	await expect(screen.getByTestId('search-logs')).toBeVisible({ timeout: 30_000 });
	return screen;
}

test.describe('Store health · Logs', () => {
	test('shows the stat header, preset chips and the flat ledger', async ({ posPage: page }) => {
		const screen = await openLogs(page);

		await expect(screen.getByTestId('logs-status-line')).toBeVisible();
		await expect(screen.getByTestId('logs-stat-events')).toBeVisible();
		await expect(screen.getByTestId('logs-stat-errors')).toBeVisible();
		await expect(screen.getByTestId('logs-stat-stuck')).toBeVisible();
		await expect(screen.getByTestId('logs-stat-waiting')).toBeVisible();

		await expect(screen.getByTestId('logs-chip-all')).toBeVisible();
		await expect(screen.getByTestId('logs-chip-actions')).toBeVisible();
		await expect(screen.getByTestId('logs-chip-errors')).toBeVisible();
		await expect(screen.getByTestId('logs-chip-sync')).toBeVisible();
		await expect(screen.getByTestId('logs-chip-verbose')).toBeVisible();

		await expect(screen.getByTestId('logs-heading-time')).toBeVisible();
		await expect(screen.getByTestId('logs-heading-level')).toBeVisible();
		await expect(screen.getByTestId('logs-heading-event')).toBeVisible();
		await expect(screen.getByTestId('logs-heading-took')).toBeVisible();
		await expect(screen.getByTestId('logs-heading-status')).toBeVisible();

		// The engine writes startup/cycle rows on boot, so an authenticated
		// session always has ledger entries.
		await expect(screen.getByTestId('logs-ledger')).toBeVisible();
		await expect(screen.locator('[data-testid^="logs-row-"]').first()).toBeVisible({
			timeout: 30_000,
		});
	});

	test('expands a ledger row to its inline detail', async ({ posPage: page }) => {
		const screen = await openLogs(page);

		// Layout B2 (#1154): the whole row is the press target — the md+ overlay
		// carries the row testID; the separate expand caret no longer exists.
		const expander = screen.locator('[data-testid^="logs-row-"]:visible').first();
		await expect(expander).toBeVisible({ timeout: 30_000 });
		await expander.click();
		await expect(screen.locator('[data-testid^="logs-detail-"]').first()).toBeVisible();
	});

	test('filters the ledger via the sync preset chip', async ({ posPage: page }) => {
		const screen = await openLogs(page);
		await expect(screen.locator('[data-testid^="logs-row-"]').first()).toBeVisible({
			timeout: 30_000,
		});

		await screen.getByTestId('logs-chip-sync').click();
		// Sync rows exist on any booted session; the ledger must not go empty.
		await expect(screen.locator('[data-testid^="logs-row-"]').first()).toBeVisible({
			timeout: 15_000,
		});

		// Actions is sparse until action coverage (WS5) instruments actors, but
		// the $exists query must not blow up the ledger.
		await screen.getByTestId('logs-chip-actions').click();
		await page.waitForTimeout(1_000);
		await expect(screen.getByTestId('logs-ledger')).toBeVisible({ timeout: 15_000 });

		await screen.getByTestId('logs-chip-all').click();
		await expect(screen.locator('[data-testid^="logs-row-"]').first()).toBeVisible({
			timeout: 15_000,
		});
	});

	// The header block used to carry `shrink grow-0` utility classes, which are
	// inert on a react-native-web ScrollView (RNW's own `flexGrow: 1` base wins),
	// so it grew to fill the column and left a third of the page blank above a
	// squeezed ledger. Measured, not eyeballed: the ledger has to start right
	// under the controls.
	test('the ledger starts directly below the controls, not down the page', async ({
		posPage: page,
	}) => {
		await page.setViewportSize({ width: 1400, height: 1000 });
		const screen = await openLogs(page);
		await expect(screen.getByTestId('logs-ledger')).toBeVisible({
			timeout: 30_000,
		});

		const controls = await screen.getByTestId('logs-chip-verbose').boundingBox();
		const ledger = await screen.getByTestId('logs-ledger').boundingBox();
		expect(controls).not.toBeNull();
		expect(ledger).not.toBeNull();
		// One row gap's worth of slack; the bug left ~345 px here.
		const gap = ledger!.y - (controls!.y + controls!.height);
		expect(gap).toBeGreaterThanOrEqual(0);
		expect(gap).toBeLessThan(48);
	});

	test('searches logs without breaking the ledger', async ({ posPage: page }) => {
		const screen = await openLogs(page);
		const searchInput = screen.getByTestId('search-logs');
		await searchInput.fill('sync');
		await page.waitForTimeout(1_000);
		await expect(screen.getByTestId('logs-ledger')).toBeVisible({ timeout: 15_000 });
	});
});
